
import React, { useState, useEffect } from 'react';
import { AppConfig, StrategyProfile, InstrumentInfo } from '../types';
import { X, Save, Plus, Settings2, Sparkles, Key, Target } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, config, onSave }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [allInstruments, setAllInstruments] = useState<Record<string, InstrumentInfo>>({});

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
      name: "新策略 " + (localConfig.strategies.length + 1),
    };
    setLocalConfig({ ...localConfig, strategies: [...localConfig.strategies, newS] });
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-xl">
      <div className="bg-okx-bg border border-okx-border rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-okx-card">
          <div className="flex items-center gap-3">
             <Settings2 className="text-okx-primary" />
             <h2 className="text-xl font-bold text-white">指挥部设置</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-okx-border bg-black/40 p-4 space-y-2 shrink-0 overflow-y-auto">
             <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-okx-subtext uppercase">策略列表</span>
                <button onClick={addStrategy} className="text-okx-primary"><Plus size={18} /></button>
             </div>
             {localConfig.strategies.map(s => (
                <div 
                    key={s.id} 
                    onClick={() => setLocalConfig({...localConfig, activeStrategyId: s.id})}
                    className={`p-3 rounded-xl cursor-pointer text-xs font-bold border ${localConfig.activeStrategyId === s.id ? 'bg-okx-primary border-okx-primary text-white' : 'bg-white/5 border-transparent text-okx-subtext'}`}
                >
                    {s.name}
                </div>
             ))}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
             <section className="space-y-4">
                <h3 className="text-xs font-black text-okx-primary flex items-center gap-2"><Key size={14} /> 连接凭证</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase">DeepSeek API Key</label>
                        <input type="password" value={localConfig.deepseekApiKey} onChange={e => setLocalConfig({...localConfig, deepseekApiKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase">OKX API Key</label>
                        <input value={localConfig.okxApiKey} onChange={e => setLocalConfig({...localConfig, okxApiKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-2 text-sm text-white" />
                    </div>
                </div>
             </section>

             <section className="space-y-4">
                <h3 className="text-xs font-black text-emerald-400 flex items-center gap-2"><Target size={14} /> 核心参数</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase">最大仓位 (Slot)</label>
                        <input type="number" value={currentStrategy.maxPositions} onChange={e => updateStrategy(currentStrategy.id, { maxPositions: parseInt(e.target.value) })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase">移动止损 (%)</label>
                        <input type="number" step="0.1" value={currentStrategy.trailingCallback * 100} onChange={e => updateStrategy(currentStrategy.id, { trailingCallback: parseFloat(e.target.value) / 100 })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase">杠杆</label>
                        <input value={currentStrategy.leverage} onChange={e => updateStrategy(currentStrategy.id, { leverage: e.target.value })} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-2 text-sm text-white" />
                    </div>
                </div>
             </section>

             <section className="space-y-4">
                <h3 className="text-xs font-black text-purple-400 flex items-center gap-2"><Sparkles size={14} /> AI 战术指令 (Prompt)</h3>
                <textarea 
                    value={currentStrategy.systemPrompt}
                    onChange={e => updateStrategy(currentStrategy.id, { systemPrompt: e.target.value })}
                    rows={8}
                    className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-xs text-gray-100 font-mono"
                />
             </section>
          </div>
        </div>

        <div className="p-6 border-t border-okx-border flex justify-between items-center bg-okx-card">
           <label className="flex items-center gap-2 cursor-pointer">
               <input type="checkbox" checked={localConfig.isSimulation} onChange={e => setLocalConfig({...localConfig, isSimulation: e.target.checked})} className="w-4 h-4 rounded border-okx-border bg-black" />
               <span className="text-xs text-okx-subtext">模拟交易模式</span>
           </label>
           <button onClick={() => onSave(localConfig)} className="bg-okx-primary text-white px-8 py-2 rounded-xl font-bold text-xs"><Save size={16} className="inline mr-2" /> 保存配置</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
