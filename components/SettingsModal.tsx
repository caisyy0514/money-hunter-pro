
import React, { useState, useRef, useEffect } from 'react';
import { AppConfig, StrategyProfile, ChatMessage, InstrumentInfo } from '../types';
import { X, Save, Plus, Trash2, Settings2, Shield, Search, Sparkles, Send, Copy, Coins, Check, Key, Globe, LayoutGrid, List } from 'lucide-react';

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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, showAIAssistant]);

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
      enabledCoins: ["BTC", "ETH"]
    };
    setLocalConfig({ ...localConfig, strategies: [...localConfig.strategies, newS] });
  };

  const toggleCoin = (coin: string) => {
      const enabled = currentStrategy.enabledCoins;
      const newEnabled = enabled.includes(coin) ? enabled.filter(c => c !== coin) : [...enabled, coin];
      updateStrategy(currentStrategy.id, { enabledCoins: newEnabled });
  };

  const filteredCoins = Object.keys(allInstruments).filter(coin => 
      coin.toLowerCase().includes(coinSearch.toLowerCase())
  ).sort((a, b) => {
      const aSelected = currentStrategy.enabledCoins.includes(a);
      const bSelected = currentStrategy.enabledCoins.includes(b);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return a.localeCompare(b);
  });

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
              body: JSON.stringify({ messages: newHistory, apiKey: localConfig.deepseekApiKey })
          });
          const data = await res.json();
          if (data.reply) setChatHistory([...newHistory, { role: 'assistant', content: data.reply }]);
      } catch (e) {
          setChatHistory([...newHistory, { role: 'assistant', content: "连接失败" }]);
      } finally {
          setIsChatLoading(false);
      }
  };

  const applyPrompt = (content: string) => {
      const codeMatch = content.match(/```(?:prompt|text|markdown)?\n?([\s\S]*?)```/);
      const prompt = codeMatch ? codeMatch[1].trim() : content;
      updateStrategy(currentStrategy.id, { systemPrompt: prompt });
      setShowAIAssistant(false);
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-xl">
      <div className="bg-okx-bg border border-okx-border rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-okx-card">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-okx-primary/10 rounded-xl"><Settings2 className="text-okx-primary" /></div>
             <div>
                <h2 className="text-xl font-bold text-white tracking-tight">配置中心</h2>
                <p className="text-[10px] text-okx-subtext uppercase font-black">Strategy & Account Management</p>
             </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r border-okx-border bg-black/40 flex flex-col shrink-0">
             <div className="p-4 flex justify-between items-center border-b border-white/5">
                <span className="text-[10px] font-black text-okx-subtext uppercase tracking-widest">策略库</span>
                <button onClick={addStrategy} className="text-okx-primary hover:bg-okx-primary/10 p-1.5 rounded-lg"><Plus size={18} /></button>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {localConfig.strategies.map(s => (
                    <div 
                        key={s.id} 
                        onClick={() => setLocalConfig({...localConfig, activeStrategyId: s.id})}
                        className={`group p-4 rounded-xl cursor-pointer flex items-center justify-between transition-all border ${localConfig.activeStrategyId === s.id ? 'bg-okx-primary border-okx-primary text-white shadow-xl shadow-okx-primary/20' : 'bg-white/5 border-transparent text-okx-subtext hover:bg-white/10'}`}
                    >
                        <div className="flex flex-col">
                            <span className="text-sm font-bold truncate w-40">{s.name}</span>
                            <span className={`text-[9px] uppercase font-black mt-1 ${localConfig.activeStrategyId === s.id ? 'text-white/70' : 'text-okx-primary'}`}>{s.coinSelectionMode === 'ai' ? 'AI 动态选币' : `${s.enabledCoins.length} 个币种`}</span>
                        </div>
                        {localConfig.strategies.length > 1 && (
                            <button onClick={(e) => { e.stopPropagation(); if(confirm('确定删除？')) {const f = localConfig.strategies.filter(st => st.id !== s.id); setLocalConfig({...localConfig, strategies: f, activeStrategyId: f[0].id}); }}} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                        )}
                    </div>
                ))}
             </div>
          </div>

          {/* Main Form */}
          <div className="flex-1 overflow-y-auto p-10 space-y-12 bg-gradient-to-br from-okx-bg to-okx-card custom-scrollbar">
             {/* Section 1: API */}
             <section className="space-y-6">
                <h3 className="text-xs font-black text-okx-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <Key size={14} /> 交易所连接与凭证
                </h3>
                <div className="grid grid-cols-2 gap-6 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">OKX API Key</label>
                        <input value={localConfig.okxApiKey} onChange={e => setLocalConfig({...localConfig, okxApiKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white focus:border-okx-primary outline-none transition-all" placeholder="Enter API Key" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">OKX Secret Key</label>
                        <input type="password" value={localConfig.okxSecretKey} onChange={e => setLocalConfig({...localConfig, okxSecretKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white focus:border-okx-primary outline-none transition-all" placeholder="Enter Secret Key" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">OKX Passphrase</label>
                        <input type="password" value={localConfig.okxPassphrase} onChange={e => setLocalConfig({...localConfig, okxPassphrase: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white focus:border-okx-primary outline-none transition-all" placeholder="Enter Passphrase" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">DeepSeek API Key</label>
                        <input type="password" value={localConfig.deepseekApiKey} onChange={e => setLocalConfig({...localConfig, deepseekApiKey: e.target.value})} className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white focus:border-okx-primary outline-none transition-all" placeholder="Enter DeepSeek Key" />
                    </div>
                </div>
             </section>

             {/* Section 2: Asset Management */}
             <section className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Globe size={14} /> 资产池与选币模式
                    </h3>
                    <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                        <button onClick={() => updateStrategy(currentStrategy.id, { coinSelectionMode: 'manual' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${currentStrategy.coinSelectionMode === 'manual' ? 'bg-okx-primary text-white shadow-lg' : 'text-okx-subtext'}`}>手动指定</button>
                        <button onClick={() => updateStrategy(currentStrategy.id, { coinSelectionMode: 'ai' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${currentStrategy.coinSelectionMode === 'ai' ? 'bg-okx-primary text-white shadow-lg' : 'text-okx-subtext'}`}>AI 自动筛选</button>
                    </div>
                </div>

                {currentStrategy.coinSelectionMode === 'ai' ? (
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-4">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">AI 选币准则</label>
                        <textarea 
                            value={currentStrategy.aiSelectionCriteria || ''} 
                            onChange={e => updateStrategy(currentStrategy.id, { aiSelectionCriteria: e.target.value })}
                            className="w-full bg-black/60 border border-okx-border rounded-xl px-4 py-3 text-sm text-white focus:border-okx-primary outline-none min-h-[100px]"
                            placeholder="例如：挑选 24 小时成交量前 20 且处于 EMA 向上发散的币种..."
                        />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-okx-subtext" size={16} />
                            <input 
                                placeholder="搜索全量 OKX SWAP 币种 (例如: PEPE, SOL, SUI...)"
                                value={coinSearch}
                                onChange={e => setCoinSearch(e.target.value)}
                                className="w-full bg-black/60 border border-okx-border rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:border-okx-primary outline-none transition-all shadow-inner"
                            />
                        </div>
                        <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl flex flex-wrap gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                            {filteredCoins.map(coin => {
                                const selected = currentStrategy.enabledCoins.includes(coin);
                                return (
                                    <button key={coin} onClick={() => toggleCoin(coin)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${selected ? 'bg-okx-primary border-okx-primary text-white shadow-lg' : 'bg-white/5 border-transparent text-okx-subtext hover:border-white/10'}`}>
                                        {coin} {selected && <Check size={12} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
             </section>

             {/* Section 3: AI Logic */}
             <section className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Sparkles size={14} /> 智能策略大脑
                    </h3>
                    <button onClick={() => setShowAIAssistant(!showAIAssistant)} className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all border ${showAIAssistant ? 'bg-purple-600 border-purple-600 text-white' : 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20'}`}>
                        <Sparkles size={14} /> 策略实验室
                    </button>
                </div>

                {showAIAssistant && (
                    <div className="bg-black/60 border border-purple-500/30 rounded-2xl overflow-hidden flex flex-col h-96 shadow-2xl animate-in slide-in-from-top-4 duration-500">
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {chatHistory.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-10 space-y-4">
                                    <Sparkles className="text-purple-500 animate-pulse" size={48} />
                                    <div>
                                        <p className="text-sm font-bold text-white">策略灵感中心</p>
                                        <p className="text-xs text-okx-subtext mt-1">告诉 AI 你的想法，它将为你编写精准的交易指令和选币逻辑</p>
                                    </div>
                                </div>
                            )}
                            {chatHistory.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-okx-primary text-white rounded-tr-none' : 'bg-white/10 text-gray-200 border border-white/5 rounded-tl-none shadow-xl'}`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                        {msg.role === 'assistant' && msg.content.includes('```') && (
                                            <button onClick={() => applyPrompt(msg.content)} className="mt-4 flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black transition-all w-full justify-center shadow-lg shadow-purple-900/40"><Copy size={14} /> 应用至当前策略</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isChatLoading && <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce delay-150"></div></div>}
                        </div>
                        <div className="p-4 bg-black/40 border-t border-white/5 flex gap-2">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChatSend()} placeholder="例如：帮我写一个基于布林带和 EMA 的趋势策略..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-purple-500/50" />
                            <button onClick={handleChatSend} className="bg-purple-600 hover:bg-purple-500 p-3 rounded-xl text-white transition-all shadow-lg"><Send size={18} /></button>
                        </div>
                    </div>
                )}

                <textarea 
                    value={currentStrategy.systemPrompt}
                    onChange={e => updateStrategy(currentStrategy.id, { systemPrompt: e.target.value })}
                    rows={12}
                    className="w-full bg-black/60 border border-okx-border rounded-2xl px-6 py-4 text-sm text-gray-100 focus:border-okx-primary outline-none font-mono leading-loose shadow-inner custom-scrollbar"
                    placeholder="交易逻辑指令..."
                />
             </section>
          </div>
        </div>

        <div className="p-8 border-t border-okx-border flex justify-between items-center bg-okx-card">
           <div className="flex items-center gap-6">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                        <input type="checkbox" checked={localConfig.isSimulation} onChange={e => setLocalConfig({...localConfig, isSimulation: e.target.checked})} className="sr-only" />
                        <div className={`w-10 h-6 rounded-full transition-colors ${localConfig.isSimulation ? 'bg-emerald-500' : 'bg-gray-700'}`}></div>
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${localConfig.isSimulation ? 'translate-x-4' : ''}`}></div>
                    </div>
                    <span className="text-xs font-bold text-okx-subtext group-hover:text-white">模拟交易模式</span>
                </label>
           </div>
           <div className="flex gap-4">
               <button onClick={onClose} className="px-8 py-3 rounded-xl font-black text-xs text-okx-subtext hover:text-white transition-colors">取消</button>
               <button onClick={() => onSave(localConfig)} className="bg-okx-primary hover:bg-blue-600 text-white px-10 py-3 rounded-xl font-black text-xs transition-all shadow-2xl shadow-okx-primary/40 flex items-center gap-2"><Save size={18} /> 保存并激活策略</button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
