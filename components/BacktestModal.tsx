
import React, { useState, useEffect } from 'react';
import { X, Play, Loader2, TrendingUp, BarChart3, History, Settings2, ChevronDown, ChevronUp, Save, Plus, Trash2, Search, Calendar } from 'lucide-react';
import { BacktestConfig, BacktestResult, StrategyProfile, InstrumentInfo } from '../types';
import BacktestReport from './BacktestReport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  enabledCoins: string[];
}

const NEW_STRATEGY_ID = 'NEW_STRATEGY_TEMP';

const BacktestModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [strategies, setStrategies] = useState<StrategyProfile[]>([]);
  const [allInstruments, setAllInstruments] = useState<Record<string, InstrumentInfo>>({});
  const [labStrategy, setLabStrategy] = useState<StrategyProfile | null>(null);
  const [showLab, setShowLab] = useState(false);
  const [coinSearch, setCoinSearch] = useState('');
  
  const [config, setConfig] = useState<BacktestConfig>({
    startTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
    endTime: Date.now(),
    initialBalance: 10000,
    coin: ''
  });
  const [result, setResult] = useState<BacktestResult | null>(null);

  useEffect(() => {
    if (isOpen) {
        Promise.all([
            fetch('/api/config').then(res => res.json()),
            fetch('/api/instruments').then(res => res.json())
        ]).then(([data, insts]) => {
            setStrategies(data.strategies);
            setAllInstruments(insts);
            
            const active = data.strategies.find((s: any) => s.id === data.activeStrategyId) || data.strategies[0];
            const initialLab = { ...active };
            setLabStrategy(initialLab);
            
            if (initialLab.enabledCoins.length > 0) {
                setConfig(prev => ({ ...prev, coin: initialLab.enabledCoins[0] }));
            }
        });
    }
  }, [isOpen]);

  const updateLab = (updates: Partial<StrategyProfile>) => {
    if (labStrategy) {
        const next = { ...labStrategy, ...updates };
        setLabStrategy(next);
        if (updates.enabledCoins && !updates.enabledCoins.includes(config.coin)) {
            setConfig(prev => ({ ...prev, coin: updates.enabledCoins![0] || '' }));
        }
    }
  };

  const handleCreateNew = () => {
    const newS: StrategyProfile = {
        id: "strat-" + Date.now(),
        name: "实验室新战术 " + (strategies.length + 1),
        coinSelectionMode: 'manual',
        enabledCoins: ['ETH'],
        maxPositions: 3,
        newCoinDays: 30,
        leverage: "20",
        initialRisk: 0.1,
        initialStopLossRoi: 0.1,
        beTriggerRoi: 0.05,
        trailingCallback: 0.01,
        emptyInterval: 30,
        holdingInterval: 15,
        systemPrompt: "你是一个专业的加密货币交易策略。请基于 EMA 趋势和波动率进行分析。"
    };
    setLabStrategy(newS);
    setConfig(prev => ({ ...prev, coin: 'ETH' }));
    setShowLab(true);
  };

  const runBacktest = async () => {
    if (!labStrategy || !config.coin) return;
    setLoading(true);
    setResult(null);
    try {
        const res = await fetch('/api/backtest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, strategy: labStrategy })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResult(data);
    } catch (e: any) {
        alert("回测失败: " + e.message);
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
        if (res.ok) alert(`战术 [${labStrategy.name}] 已成功部署至实战列表`);
    } catch (e) { alert("同步失败"); }
  };

  const backtestableCoins = labStrategy?.coinSelectionMode === 'manual' 
    ? labStrategy.enabledCoins 
    : Object.keys(allInstruments).slice(0, 20);

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
            <div className="p-6 bg-black/40 border-b border-okx-border space-y-6 shrink-0">
                <div className="grid grid-cols-6 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">基准/新建</label>
                        <select 
                            value={labStrategy?.id} 
                            onChange={e => {
                                if (e.target.value === NEW_STRATEGY_ID) {
                                    handleCreateNew();
                                } else {
                                    const selected = strategies.find(s => s.id === e.target.value);
                                    if (selected) setLabStrategy({...selected});
                                }
                            }}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-3 py-2 text-xs text-white outline-none"
                        >
                            <option value={NEW_STRATEGY_ID}>✨ [+ 新建战术]</option>
                            <optgroup label="现有策略">
                                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </optgroup>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">测试靶点</label>
                        <select 
                            value={config.coin} 
                            onChange={e => setConfig({...config, coin: e.target.value})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-3 py-2 text-xs text-white outline-none"
                        >
                            <option value="">请选择币种</option>
                            {backtestableCoins.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">初始资金</label>
                        <input 
                            type="number" 
                            value={config.initialBalance} 
                            onChange={e => setConfig({...config, initialBalance: parseFloat(e.target.value)})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-3 py-2 text-xs text-white" 
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">推演起点</label>
                        <input 
                            type="date" 
                            value={new Date(config.startTime).toISOString().split('T')[0]} 
                            onChange={e => setConfig({...config, startTime: new Date(e.target.value).getTime()})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-3 py-2 text-xs text-white" 
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">推演终点</label>
                        <input 
                            type="date" 
                            value={new Date(config.endTime).toISOString().split('T')[0]} 
                            onChange={e => setConfig({...config, endTime: new Date(e.target.value).getTime() + 86399999})}
                            className="w-full bg-okx-bg border border-okx-border rounded-xl px-3 py-2 text-xs text-white" 
                        />
                    </div>

                    <div className="flex items-end gap-2">
                        <button 
                            onClick={() => setShowLab(!showLab)}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-bold border flex items-center justify-center gap-1 transition-all ${showLab ? 'bg-purple-600/20 border-purple-600 text-purple-400' : 'bg-white/5 border-okx-border text-okx-subtext'}`}
                        >
                            <Settings2 size={12} /> 面板
                        </button>
                        <button 
                            onClick={runBacktest}
                            disabled={loading || !labStrategy || !config.coin}
                            className="flex-[1.5] bg-okx-primary hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1 transition-all shadow-lg text-[10px]"
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                            运行推演
                        </button>
                    </div>
                </div>

                {showLab && labStrategy && (
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 animate-in slide-in-from-top-2 space-y-4">
                        <div className="grid grid-cols-4 gap-6">
                            <div className="col-span-1 space-y-2">
                                <label className="text-[10px] text-purple-400 uppercase font-black">战术名称</label>
                                <input 
                                    value={labStrategy.name}
                                    onChange={e => updateLab({ name: e.target.value })}
                                    className="w-full bg-black/40 border border-okx-border rounded-xl px-3 py-2 text-xs text-white"
                                />
                            </div>
                            <div className="col-span-1 space-y-2">
                                <label className="text-[10px] text-purple-400 uppercase font-black">选币模式</label>
                                <select 
                                    value={labStrategy.coinSelectionMode}
                                    onChange={e => updateLab({ coinSelectionMode: e.target.value as any })}
                                    className="w-full bg-black/40 border border-okx-border rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="manual">手动锁定币种</option>
                                    <option value="new-coin">新币狩猎模式</option>
                                </select>
                            </div>
                            {labStrategy.coinSelectionMode === 'manual' ? (
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] text-purple-400 uppercase font-black">关联币种池 ({labStrategy.enabledCoins.length})</label>
                                    <div className="flex flex-wrap gap-2 p-2 bg-black/40 border border-okx-border rounded-xl min-h-[38px]">
                                        {labStrategy.enabledCoins.map(coin => (
                                            <span key={coin} className="flex items-center gap-1 bg-okx-primary/20 text-okx-primary px-2 py-0.5 rounded text-[10px] font-bold border border-okx-primary/30">
                                                {coin}
                                                <button onClick={() => updateLab({ enabledCoins: labStrategy.enabledCoins.filter(c => c !== coin) })} className="hover:text-white"><X size={10}/></button>
                                            </span>
                                        ))}
                                        <div className="relative flex-1 min-w-[80px]">
                                            <input 
                                                placeholder="搜索并加入..."
                                                value={coinSearch}
                                                onChange={e => setCoinSearch(e.target.value.toUpperCase())}
                                                className="w-full bg-transparent border-none text-[10px] text-white outline-none"
                                            />
                                            {coinSearch && (
                                                <div className="absolute top-full left-0 w-full bg-okx-card border border-okx-border rounded-lg mt-1 z-50 max-h-32 overflow-y-auto shadow-2xl">
                                                    {Object.keys(allInstruments)
                                                        .filter(c => c.includes(coinSearch) && !labStrategy.enabledCoins.includes(c))
                                                        .map(c => (
                                                            <div key={c} onClick={() => { updateLab({ enabledCoins: [...labStrategy.enabledCoins, c] }); setCoinSearch(''); }} className="px-3 py-1.5 hover:bg-white/5 cursor-pointer text-[10px]">{c}</div>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] text-purple-400 uppercase font-black">新币判定周期 (天)</label>
                                    <input 
                                        type="number"
                                        value={labStrategy.newCoinDays}
                                        onChange={e => updateLab({ newCoinDays: parseInt(e.target.value) })}
                                        className="w-full bg-black/40 border border-okx-border rounded-xl px-3 py-2 text-xs text-white"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] text-okx-subtext uppercase font-black">AI 推演逻辑 (Prompt)</label>
                                <textarea 
                                    value={labStrategy.systemPrompt}
                                    onChange={e => updateLab({ systemPrompt: e.target.value })}
                                    rows={3}
                                    className="w-full bg-black/40 border border-okx-border rounded-xl px-3 py-2 text-[10px] font-mono text-gray-300"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 col-span-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-okx-subtext">杠杆倍数</label>
                                    <input value={labStrategy.leverage} onChange={e => updateLab({ leverage: e.target.value })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-okx-subtext">入场比例 (%)</label>
                                    <input type="number" value={labStrategy.initialRisk * 100} onChange={e => updateLab({ initialRisk: parseFloat(e.target.value)/100 })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-okx-subtext">止损 (ROI %)</label>
                                    <input type="number" value={labStrategy.initialStopLossRoi * 100} onChange={e => updateLab({ initialStopLossRoi: parseFloat(e.target.value)/100 })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-okx-subtext">保本触发 (%)</label>
                                    <input type="number" value={labStrategy.beTriggerRoi * 100} onChange={e => updateLab({ beTriggerRoi: parseFloat(e.target.value)/100 })} className="w-full bg-black/40 border border-okx-border rounded-lg px-3 py-1.5 text-xs text-white" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {result ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <h3 className="text-xs font-black text-okx-primary uppercase tracking-widest">推演结论报告 [币种: {config.coin}]</h3>
                                <div className="flex items-center gap-2 text-[10px] text-okx-subtext mt-1">
                                    <Calendar size={10} />
                                    {new Date(config.startTime).toLocaleDateString()} — {new Date(config.endTime).toLocaleDateString()}
                                </div>
                            </div>
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
                        <p className="text-sm">实验室已就绪。请设定推演周期并选择测试靶点</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                            <TrendingUp size={64} className="text-okx-primary animate-pulse" />
                            <Loader2 size={32} className="text-white animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold text-white">时空复刻中...</p>
                            <p className="text-xs text-okx-subtext mt-1">正在模拟该周期内的逻辑表现</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default BacktestModal;
