
import React, { useState, useEffect } from 'react';
import { X, Play, Loader2, TrendingUp, BarChart3, History, Settings2, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { BacktestConfig, BacktestResult, StrategyProfile } from '../types';
import BacktestReport from './BacktestReport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  enabledCoins: string[];
}

const BacktestModal: React.FC<Props> = ({ isOpen, onClose, enabledCoins }) => {
  const [loading, setLoading] = useState(false);
  const [strategies, setStrategies] = useState<StrategyProfile[]>([]);
  const [labStrategy, setLabStrategy] = useState<StrategyProfile | null>(null);
  const [showLab, setShowLab] = useState(false);
  
  const [config, setConfig] = useState<BacktestConfig>({
    startTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
    endTime: Date.now(),
    initialBalance: 10000,
    coin: 'ETH'
  });
  const [result, setResult] = useState<BacktestResult | null>(null);

  useEffect(() => {
    if (isOpen) {
        fetch('/api/config').then(res => res.json()).then(data => {
            setStrategies(data.strategies);
            const active = data.strategies.find((s: any) => s.id === data.activeStrategyId) || data.strategies[0];
            setLabStrategy({ ...active });
        });
    }
  }, [isOpen]);

  const updateLab = (updates: Partial<StrategyProfile>) => {
    if (labStrategy) setLabStrategy({ ...labStrategy, ...updates });
  };

  const runBacktest = async () => {
    if (!labStrategy) return;
    setLoading(true);
    setResult(null);
    try {
        const res = await fetch('/api/backtest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, strategy: labStrategy })
        });
        const data = await res.json();
        setResult(data);
    } catch (e) {
        alert("回测失败: " + e);
    } finally {
        setLoading(false);
    }
  };

  const saveToRealtime = async () => {
    if (!labStrategy) return;
    try {
        const res = await fetch('/api/strategies/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(labStrategy)
        });
        if (res.ok) alert("战术实验室参数已成功同步到实战列表");
    } catch (e) { alert("同步失败"); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-okx-bg border border-okx-border rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-okx-card">
          <div className="flex items-center gap-3">
             <History className="text-okx-primary" />
             <h2 className="text-xl font-bold text-white">策略实验室 (Strategy Lab)</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            {/* 参数控制区 */}
            <div className="p-6 bg-black/40 border-b border-okx-border space-y-6 shrink-0">
                <div className="grid grid-cols-5 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">基准策略</label>
                        <select 
                            value={labStrategy?.id} 
                            onChange={e => {
                                const selected = strategies.find(s => s.id === e.target.value);
                                if (selected) setLabStrategy({...selected});
                            }}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-4 py-2 text-sm text-white outline-none"
                        >
                            {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">回测币种</label>
                        <select 
                            value={config.coin} 
                            onChange={e => setConfig({...config, coin: e.target.value})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-4 py-2 text-sm text-white outline-none"
                        >
                            <option value="BTC">BTC</option>
                            <option value="ETH">ETH</option>
                            <option value="SOL">SOL</option>
                            {enabledCoins.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">本金 (USDT)</label>
                        <input 
                            type="number" 
                            value={config.initialBalance} 
                            onChange={e => setConfig({...config, initialBalance: parseFloat(e.target.value)})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-4 py-2 text-sm text-white" 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">开始时间</label>
                        <input 
                            type="date" 
                            value={new Date(config.startTime).toISOString().split('T')[0]} 
                            onChange={e => setConfig({...config, startTime: new Date(e.target.value).getTime()})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-4 py-2 text-sm text-white" 
                        />
                    </div>
                    <div className="flex items-end gap-2">
                        <button 
                            onClick={() => setShowLab(!showLab)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 ${showLab ? 'bg-purple-600/20 border-purple-600 text-purple-400' : 'bg-white/5 border-okx-border text-okx-subtext'}`}
                        >
                            <Settings2 size={14} /> 实验台 {showLab ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                        </button>
                        <button 
                            onClick={runBacktest}
                            disabled={loading || !labStrategy}
                            className="flex-[1.5] bg-okx-primary hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                            运行推演
                        </button>
                    </div>
                </div>

                {showLab && labStrategy && (
                    <div className="grid grid-cols-4 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 animate-in slide-in-from-top-2">
                        <div className="col-span-2 space-y-2">
                            <label className="text-[10px] text-purple-400 uppercase font-black">AI 逻辑微调 (Prompt)</label>
                            <textarea 
                                value={labStrategy.systemPrompt}
                                onChange={e => updateLab({ systemPrompt: e.target.value })}
                                rows={4}
                                className="w-full bg-black/40 border border-okx-border rounded-xl px-3 py-2 text-[10px] font-mono text-gray-300"
                            />
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] text-okx-subtext">杠杆倍数</label>
                                <input value={labStrategy.leverage} onChange={e => updateLab({ leverage: e.target.value })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-okx-subtext">入场风险 (%)</label>
                                <input type="number" value={labStrategy.initialRisk * 100} onChange={e => updateLab({ initialRisk: parseFloat(e.target.value)/100 })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] text-okx-subtext">初始止损 (%)</label>
                                <input type="number" value={labStrategy.initialStopLossRoi * 100} onChange={e => updateLab({ initialStopLossRoi: parseFloat(e.target.value)/100 })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-okx-subtext">保本触发 (%)</label>
                                <input type="number" value={labStrategy.beTriggerRoi * 100} onChange={e => updateLab({ beTriggerRoi: parseFloat(e.target.value)/100 })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {result ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-black text-okx-primary uppercase tracking-widest">推演结论报告</h3>
                            <button 
                                onClick={saveToRealtime}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
                            >
                                <Save size={14} /> 部署至实战列表
                            </button>
                        </div>
                        <BacktestReport result={result} />
                    </div>
                ) : !loading ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 gap-4">
                        <BarChart3 size={80} strokeWidth={1} />
                        <p className="text-sm">实验室就绪，请微调参数并点击运行</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                            <TrendingUp size={64} className="text-okx-primary animate-pulse" />
                            <Loader2 size={32} className="text-white animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <p className="text-lg font-bold text-white">时空复刻中...</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default BacktestModal;
