
import React, { useEffect, useState } from 'react';
import { AIDecision } from '../types';
import { X, Clock, Zap, RefreshCw, ChevronRight } from 'lucide-react';
import DecisionReport from './DecisionReport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const HistoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'recent' | 'actions'>('recent');
  const [data, setData] = useState<{ recent: AIDecision[], actions: AIDecision[] }>({ recent: [], actions: [] });
  const [selectedDecision, setSelectedDecision] = useState<AIDecision | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
        fetchHistory();
    }
  }, [isOpen]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
        const res = await fetch('/api/history');
        if (!res.ok) return;
        const json = await res.json();
        setData(json);
        // Select first item by default if nothing selected
        if (!selectedDecision) {
            if (activeTab === 'recent' && json.recent.length > 0) setSelectedDecision(json.recent[0]);
            else if (activeTab === 'actions' && json.actions.length > 0) setSelectedDecision(json.actions[0]);
        }
    } catch (e) {
        console.error("Failed to fetch history", e);
    } finally {
        setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentList = activeTab === 'recent' ? data.recent : data.actions;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-okx-card w-full max-w-6xl h-[85vh] rounded-xl border border-okx-border shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-okx-border flex justify-between items-center bg-okx-card shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock size={20} className="text-okx-primary"/> 
            云端战术历史回溯
          </h3>
          <div className="flex items-center gap-4">
            <button onClick={fetchHistory} className="text-okx-subtext hover:text-white transition-colors" title="刷新">
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={onClose} className="text-okx-subtext hover:text-white transition-colors">
                <X size={24} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar List */}
            <div className="w-1/3 min-w-[300px] border-r border-okx-border flex flex-col bg-[#121214]">
                {/* Tabs */}
                <div className="flex p-2 gap-2 border-b border-okx-border shrink-0">
                    <button 
                        onClick={() => setActiveTab('recent')}
                        className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors ${activeTab === 'recent' ? 'bg-okx-primary text-white' : 'bg-okx-bg text-okx-subtext hover:text-white'}`}
                    >
                        <Clock size={14} /> 最近1小时 ({data.recent.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('actions')}
                        className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors ${activeTab === 'actions' ? 'bg-orange-600 text-white' : 'bg-okx-bg text-okx-subtext hover:text-white'}`}
                    >
                        <Zap size={14} /> 关键行动 ({data.actions.length})
                    </button>
                </div>

                {/* List Items */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {currentList.length === 0 ? (
                        <div className="p-8 text-center text-okx-subtext text-xs">暂无历史记录</div>
                    ) : (
                        currentList.map((item, idx) => (
                            <button
                                key={`history-${idx}-${item.coin}`}
                                onClick={() => setSelectedDecision(item)}
                                className={`w-full text-left p-4 border-b border-gray-800/50 hover:bg-white/5 transition-colors flex items-center justify-between group ${selectedDecision === item ? 'bg-white/5 border-l-2 border-l-okx-primary' : 'border-l-2 border-l-transparent'}`}
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                            item.action === 'BUY' ? 'bg-green-500/20 text-green-400' :
                                            item.action === 'SELL' ? 'bg-red-500/20 text-red-400' :
                                            item.action === 'UPDATE_TPSL' ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-gray-700 text-gray-400'
                                        }`}>
                                            {String(item.action === 'UPDATE_TPSL' ? 'TPSL' : item.action)}
                                        </span>
                                        <span className="text-xs text-okx-subtext font-mono">
                                            {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '--:--:--'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 truncate w-48">
                                        {String(item.reasoning)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-okx-subtext">{String(item.trading_decision?.confidence)}</div>
                                    <ChevronRight size={14} className={`text-gray-600 mt-1 ml-auto group-hover:text-white transition-colors ${selectedDecision === item ? 'text-okx-primary' : ''}`} />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content Detail */}
            <div className="flex-1 bg-okx-card overflow-hidden flex flex-col relative">
                {selectedDecision ? (
                    <>
                        <div className="absolute top-0 right-0 p-2 z-10 opacity-50 pointer-events-none">
                            <span className="text-[100px] font-bold text-white/5 leading-none tracking-tighter">
                                {String(selectedDecision.action)}
                            </span>
                        </div>
                        <div className="p-4 border-b border-okx-border bg-[#121214] shrink-0 flex justify-between items-center z-20">
                            <div>
                                <div className="text-xs text-okx-subtext mb-1">决策时间: {selectedDecision.timestamp ? new Date(selectedDecision.timestamp).toLocaleString() : '未知'}</div>
                                <div className="font-bold text-white text-lg">{String(selectedDecision.stage_analysis).split(' ')[0]}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-okx-subtext">置信度</div>
                                <div className="text-okx-primary font-bold">{String(selectedDecision.trading_decision?.confidence)}</div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar z-10 relative">
                           <DecisionReport decision={selectedDecision} />
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-okx-subtext">
                        <div className="text-center">
                            <Clock size={48} className="mx-auto mb-4 opacity-20"/>
                            <p>请选择左侧记录查看详情</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
