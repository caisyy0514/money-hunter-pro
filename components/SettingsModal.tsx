
import React, { useState, useRef, useEffect } from 'react';
import { AppConfig, StrategyProfile, ChatMessage, InstrumentInfo } from '../types';
import { X, Save, Plus, Trash2, Settings2, Search, Sparkles, Send, Key, Globe, Target, Shield, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, config, onSave }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [allInstruments, setAllInstruments] = useState<Record<string, InstrumentInfo>>({});
  const [coinSearch, setCoinSearch] = useState('');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
        fetch('/api/instruments').then(res => res.json()).then(data => setAllInstruments(data));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStrategy = localConfig.strategies.find(s => s.id === localConfig.activeStrategyId) || localConfig.strategies[0];

  const updateStrategy = (id: string, updates: Partial<StrategyProfile>) => {
    const updated = localConfig.strategies.map(s => s.id === id ? { ...s, ...updates } : s);
    setLocalConfig({ ...localConfig, strategies: updated });
  };

  const addStrategy = () => {
    const newS: StrategyProfile = {
      ...currentStrategy,
      id: "strat-" + Date.now(),
      name: "新猎手策略 " + (localConfig.strategies.length + 1),
    };
    setLocalConfig({ ...localConfig, strategies: [...localConfig.strategies, newS] });
  };

  const handleChatSend = async () => {
      if (!chatInput.trim() || isChatLoading) return;
      const userMsg: ChatMessage = { role: 'user', content: chatInput };
      const newHistory = [...chatHistory, userMsg];
      setChatHistory(newHistory);
      setChatInput('');
      setIsChatLoading(true);

      try {
          const res = await fetch('/api/assistant/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: newHistory })
          });
          const data = await res.json();
          if (data.reply) setChatHistory([...newHistory, { role: 'assistant', content: data.reply }]);
      } catch (e) {
          setChatHistory([...newHistory, { role: 'assistant', content: "连接失败" }]);
      } finally { setIsChatLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-xl">
      <div className="bg-okx-bg border border-okx-border rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-okx-card">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-okx-primary/10 rounded-xl"><Settings2 className="text-okx-primary" /></div>
             <div>
                <h2 className="text-xl font-bold text-white tracking-tight">猎手指挥部</h2>
                <p className="text-[10px] text-okx-subtext uppercase font-black">Strategy Command Center</p>
             </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r border-okx-border bg-black/40 flex flex-col shrink-0">
             <div className="p-4 flex justify-between items-center border-b border-white/5">
                <span className="text-[10px] font-black text-okx-subtext uppercase tracking-widest">战术目录</span>
                <button onClick={addStrategy} className="text-okx-primary hover:bg-okx-primary/10 p-1.5 rounded-lg"><Plus size={18} /></button>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {localConfig.strategies.map(s => (
                    <div 
                        key={s.id} 
                        onClick={() => setLocalConfig({...localConfig, activeStrategyId: s.id})}
                        className={`group p-4 rounded-xl cursor-pointer flex items-center justify-between transition-all border ${localConfig.activeStrategyId === s.id ? 'bg-okx-primary border-okx-primary text-white shadow-xl' : 'bg-white/5 border-transparent text-okx-subtext hover:bg-white/10'}`}
                    >
                        <div className="flex flex-col">
                            <span className="text-sm font-bold truncate w-40">{s.name}</span>
                            <span className="text-[9px] uppercase font-black mt-1 opacity-70">{s.coinSelectionMode === 'new-coin' ? '新币猎手' : '手动列表'}</span>
                        </div>
                    </div>
                ))}
             </div>
          </div>

          {/* Main Form */}
          <div className="flex-1 overflow-y-auto p-10 space-y-12 bg-gradient-to-br from-okx-bg to-okx-card custom-scrollbar">
             {/* Section 1: Keys */}
             <section className="space-y-6">
                <h3 className="text-xs font-black text-okx-primary uppercase tracking-[0.2em] flex items-center gap-2"><Key size={14} /> 核心连接凭证</h3>
                <div className="grid grid-cols-2 gap-6 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                    <div className="space-y-2"><label className="text-[10px] text-okx-subtext uppercase font-bold">OKX API Key</label><input value={localConfig.okxApiKey} onChange={e => setLocalConfig({...localConfig, okxApiKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white outline-none" placeholder="交易所密钥" /></div>
                    <div className="space-y-2"><label className="text-[10px] text-okx-subtext uppercase font-bold">OKX Secret Key</label><input type="password" value={localConfig.okxSecretKey} onChange={e => setLocalConfig({...localConfig, okxSecretKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white outline-none" placeholder="交易所私钥" /></div>
                </div>
             </section>

             {/* Section 2: Strategy Params */}
             <section className="space-y-6">
                <h3 className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2"><Target size={14} /> 战术风控参数</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">最大持仓槽位 (Slots)</label>
                        <input type="number" value={currentStrategy.maxPositions} onChange={e => updateStrategy(currentStrategy.id, { maxPositions: parseInt(e.target.value) })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">新币定义 (天数)</label>
                        <input type="number" value={currentStrategy.newCoinDays} onChange={e => updateStrategy(currentStrategy.id, { newCoinDays: parseInt(e.target.value) })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">移动止盈回调 (%)</label>
                        <input type="number" step="0.1" value={currentStrategy.trailingCallback * 100} onChange={e => updateStrategy(currentStrategy.id, { trailingCallback: parseFloat(e.target.value) / 100 })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">单笔初始风险 (%)</label>
                        <input type="number" step="1" value={currentStrategy.initialRisk * 100} onChange={e => updateStrategy(currentStrategy.id, { initialRisk: parseFloat(e.target.value) / 100 })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white" />
                    </div>
                </div>
             </section>

             {/* Section 3: AI Brain */}
             <section className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2"><Sparkles size={14} /> 猎手战术提示词 (Prompt)</h3>
                    <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                        <button onClick={() => updateStrategy(currentStrategy.id, { coinSelectionMode: 'new-coin' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${currentStrategy.coinSelectionMode === 'new-coin' ? 'bg-okx-primary text-white' : 'text-okx-subtext'}`}>新币模式</button>
                        <button onClick={() => updateStrategy(currentStrategy.id, { coinSelectionMode: 'manual' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${currentStrategy.coinSelectionMode === 'manual' ? 'bg-okx-primary text-white' : 'text-okx-subtext'}`}>手动模式</button>
                    </div>
                </div>
                <textarea 
                    value={currentStrategy.systemPrompt}
                    onChange={e => updateStrategy(currentStrategy.id, { systemPrompt: e.target.value })}
                    rows={10}
                    className="w-full bg-black/60 border border-okx-border rounded-2xl px-6 py-4 text-sm text-gray-100 outline-none font-mono leading-relaxed"
                />
             </section>
          </div>
        </div>

        <div className="p-8 border-t border-okx-border flex justify-between items-center bg-okx-card">
           <label className="flex items-center gap-3 cursor-pointer group">
               <div className="relative">
                   <input type="checkbox" checked={localConfig.isSimulation} onChange={e => setLocalConfig({...localConfig, isSimulation: e.target.checked})} className="sr-only" />
                   <div className={`w-10 h-6 rounded-full transition-colors ${localConfig.isSimulation ? 'bg-emerald-500' : 'bg-gray-700'}`}></div>
                   <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${localConfig.isSimulation ? 'translate-x-4' : ''}`}></div>
               </div>
               <span className="text-xs font-bold text-okx-subtext">模拟演习模式 (Simulation)</span>
           </label>
           <button onClick={() => onSave(localConfig)} className="bg-okx-primary hover:bg-blue-600 text-white px-10 py-3 rounded-xl font-black text-xs transition-all flex items-center gap-2"><Save size={18} /> 部署并启动策略</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
