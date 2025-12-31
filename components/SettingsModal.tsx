
import React, { useState } from 'react';
import { AppConfig, StrategyProfile } from '../types';
import { X, Save, Plus, Trash2, Edit3, Settings2, Shield, Zap, Clock, Code } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, config, onSave }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      name: "新策略 " + (localConfig.strategies.length + 1)
    };
    setLocalConfig({ ...localConfig, strategies: [...localConfig.strategies, newS] });
  };

  const deleteStrategy = (id: string) => {
    if (localConfig.strategies.length <= 1) return;
    const filtered = localConfig.strategies.filter(s => s.id !== id);
    setLocalConfig({ 
        ...localConfig, 
        strategies: filtered,
        activeStrategyId: localConfig.activeStrategyId === id ? filtered[0].id : localConfig.activeStrategyId 
    });
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-md">
      <div className="bg-[#121214] border border-okx-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-[#18181b]">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings2 className="text-okx-primary" /> 交易中枢配置
          </h2>
          <button onClick={onClose} className="text-okx-subtext hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 策略列表 */}
          <div className="w-64 border-r border-okx-border bg-[#09090b] flex flex-col shrink-0">
             <div className="p-4 border-b border-okx-border flex justify-between items-center">
                <span className="text-xs font-bold text-okx-subtext uppercase">策略方案</span>
                <button onClick={addStrategy} className="text-okx-primary hover:bg-okx-primary/10 p-1 rounded transition-colors">
                    <Plus size={16} />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {localConfig.strategies.map(s => (
                    <div 
                        key={s.id} 
                        onClick={() => setLocalConfig({...localConfig, activeStrategyId: s.id})}
                        className={`group p-3 rounded-lg cursor-pointer flex items-center justify-between transition-all ${localConfig.activeStrategyId === s.id ? 'bg-okx-primary text-white shadow-lg shadow-okx-primary/20' : 'text-okx-subtext hover:bg-white/5'}`}
                    >
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        {localConfig.strategies.length > 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteStrategy(s.id); }}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ))}
             </div>
          </div>

          {/* 编辑区 */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#121214]">
             <section className="space-y-4">
                <h3 className="text-xs font-bold text-okx-primary uppercase flex items-center gap-2 tracking-widest">
                    <Shield size={14} /> 核心参数
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-okx-subtext">策略名称</label>
                        <input 
                            value={currentStrategy.name}
                            onChange={e => updateStrategy(currentStrategy.id, { name: e.target.value })}
                            className="w-full bg-[#09090b] border border-okx-border rounded px-3 py-2 text-white focus:border-okx-primary outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-okx-subtext">杠杆倍数</label>
                        <input 
                            type="number"
                            value={currentStrategy.leverage}
                            onChange={e => updateStrategy(currentStrategy.id, { leverage: e.target.value })}
                            className="w-full bg-[#09090b] border border-okx-border rounded px-3 py-2 text-white focus:border-okx-primary outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-okx-subtext">初始头寸 (权益 %)</label>
                        <input 
                            type="number"
                            value={currentStrategy.initialRisk * 100}
                            onChange={e => updateStrategy(currentStrategy.id, { initialRisk: parseFloat(e.target.value) / 100 })}
                            className="w-full bg-[#09090b] border border-okx-border rounded px-3 py-2 text-white focus:border-okx-primary outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-okx-subtext">保本激活 ROI (%)</label>
                        <input 
                            type="number"
                            value={currentStrategy.beTriggerRoi * 100}
                            onChange={e => updateStrategy(currentStrategy.id, { beTriggerRoi: parseFloat(e.target.value) / 100 })}
                            className="w-full bg-[#09090b] border border-okx-border rounded px-3 py-2 text-white focus:border-okx-primary outline-none"
                        />
                    </div>
                </div>
             </section>

             <section className="space-y-4">
                <h3 className="text-xs font-bold text-okx-up uppercase flex items-center gap-2 tracking-widest">
                    <Clock size={14} /> 动态频率配置
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-[#09090b] p-4 rounded-xl border border-okx-border/30 shadow-inner">
                    <div className="space-y-1">
                        <label className="text-xs text-okx-subtext flex justify-between">
                            空仓扫描周期 <span>{currentStrategy.emptyInterval}s</span>
                        </label>
                        <input 
                            type="range" min="5" max="300" step="5"
                            value={currentStrategy.emptyInterval}
                            onChange={e => updateStrategy(currentStrategy.id, { emptyInterval: parseInt(e.target.value) })}
                            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-okx-primary"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-okx-subtext flex justify-between">
                            持仓监控频率 <span>{currentStrategy.holdingInterval}s</span>
                        </label>
                        <input 
                            type="range" min="2" max="60" step="1"
                            value={currentStrategy.holdingInterval}
                            onChange={e => updateStrategy(currentStrategy.id, { holdingInterval: parseInt(e.target.value) })}
                            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-okx-up"
                        />
                    </div>
                </div>
             </section>

             <section className="space-y-4">
                <h3 className="text-xs font-bold text-purple-400 uppercase flex items-center gap-2 tracking-widest">
                    <Code size={14} /> AI 核心提示词 (DeepSeek System Prompt)
                </h3>
                <textarea 
                    value={currentStrategy.systemPrompt}
                    onChange={e => updateStrategy(currentStrategy.id, { systemPrompt: e.target.value })}
                    rows={6}
                    className="w-full bg-[#09090b] border border-okx-border rounded-xl px-4 py-3 text-sm text-gray-200 focus:border-okx-primary outline-none font-mono leading-relaxed"
                    placeholder="请输入控制 AI 决策逻辑的指令..."
                />
             </section>
          </div>
        </div>

        <div className="p-6 border-t border-okx-border flex justify-between items-center bg-[#18181b]">
           <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" checked={localConfig.isSimulation}
                        onChange={e => setLocalConfig({...localConfig, isSimulation: e.target.checked})}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-okx-primary focus:ring-0"
                    />
                    <span className="text-xs text-okx-subtext">模拟环境</span>
                </div>
           </div>
           <button 
             onClick={() => onSave(localConfig)}
             className="bg-okx-primary hover:bg-blue-600 text-white px-8 py-2.5 rounded-full font-bold transition-all shadow-lg shadow-okx-primary/30 flex items-center gap-2"
           >
             <Save size={18} /> 应用并重启引擎
           </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
