
import React, { useState, useRef, useEffect } from 'react';
import { AppConfig, StrategyProfile, ChatMessage } from '../types';
import { X, Save, Plus, Trash2, Settings2, Shield, Clock, Code, Search, Sparkles, Send, Copy, Coins, Check } from 'lucide-react';
import { COIN_CONFIG } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, config, onSave }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [coinSearch, setCoinSearch] = useState('');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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

  const toggleCoin = (coin: string) => {
      const enabled = currentStrategy.enabledCoins;
      const newEnabled = enabled.includes(coin)
        ? enabled.filter(c => c !== coin)
        : [...enabled, coin];
      updateStrategy(currentStrategy.id, { enabledCoins: newEnabled });
  };

  const filteredCoinList = Object.keys(COIN_CONFIG).filter(coin => 
      coin.toLowerCase().includes(coinSearch.toLowerCase())
  );

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
          if (data.reply) {
              setChatHistory([...newHistory, { role: 'assistant', content: data.reply }]);
          } else if (data.error) {
              setChatHistory([...newHistory, { role: 'assistant', content: `Error: ${data.error}` }]);
          }
      } catch (e) {
          setChatHistory([...newHistory, { role: 'assistant', content: "网络连接失败，请检查 API Key 后重试。" }]);
      } finally {
          setIsChatLoading(false);
      }
  };

  const applyPrompt = (content: string) => {
      // Regex to extract code block if present
      const codeBlockMatch = content.match(/```(?:prompt|text|markdown)?\n?([\s\S]*?)```/);
      const prompt = codeBlockMatch ? codeBlockMatch[1].trim() : content;
      updateStrategy(currentStrategy.id, { systemPrompt: prompt });
      setShowAIAssistant(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-md">
      <div className="bg-[#121214] border border-okx-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-[#18181b]">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings2 className="text-okx-primary" /> 交易中枢配置
          </h2>
          <button onClick={onClose} className="text-okx-subtext hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 策略列表 (Sidebar) */}
          <div className="w-64 border-r border-okx-border bg-[#09090b] flex flex-col shrink-0">
             <div className="p-4 border-b border-okx-border flex justify-between items-center">
                <span className="text-xs font-bold text-okx-subtext uppercase">策略方案</span>
                <button onClick={addStrategy} className="text-okx-primary hover:bg-okx-primary/10 p-1 rounded transition-colors">
                    <Plus size={16} />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
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

          {/* 编辑区 (Content) */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#121214] custom-scrollbar">
             {/* 基础 API 配置 */}
             <section className="space-y-4">
                <h3 className="text-xs font-bold text-okx-primary uppercase flex items-center gap-2 tracking-widest">
                    <Shield size={14} /> 账户与 API
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">OKX API Key</label>
                        <input value={localConfig.okxApiKey} onChange={e => setLocalConfig({...localConfig, okxApiKey: e.target.value})} className="w-full bg-[#09090b] border border-okx-border rounded px-3 py-2 text-white focus:border-okx-primary outline-none text-xs" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-okx-subtext uppercase font-bold">DeepSeek API Key</label>
                        <input type="password" value={localConfig.deepseekApiKey} onChange={e => setLocalConfig({...localConfig, deepseekApiKey: e.target.value})} className="w-full bg-[#09090b] border border-okx-border rounded px-3 py-2 text-white focus:border-okx-primary outline-none text-xs" />
                    </div>
                </div>
             </section>

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
                </div>
             </section>

             {/* 币种配置 (Enhanced) */}
             <section className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2 tracking-widest">
                        <Coins size={14} /> 资产池配置
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-okx-subtext" size={14} />
                        <input 
                            placeholder="搜索币种..."
                            value={coinSearch}
                            onChange={e => setCoinSearch(e.target.value)}
                            className="bg-[#09090b] border border-okx-border rounded-full pl-8 pr-3 py-1 text-xs text-white focus:border-okx-primary outline-none w-32 focus:w-48 transition-all"
                        />
                    </div>
                </div>
                
                <div className="bg-[#09090b] p-4 rounded-xl border border-okx-border/30 flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredCoinList.map(coin => {
                        const isEnabled = currentStrategy.enabledCoins.includes(coin);
                        return (
                            <button
                                key={coin}
                                onClick={() => toggleCoin(coin)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                    isEnabled 
                                    ? 'bg-okx-primary/20 border-okx-primary text-white shadow-lg' 
                                    : 'bg-white/5 border-transparent text-okx-subtext hover:border-white/10'
                                }`}
                            >
                                {coin}
                                {isEnabled && <Check size={12} />}
                            </button>
                        );
                    })}
                    {filteredCoinList.length === 0 && <div className="text-center w-full py-4 text-okx-subtext text-xs italic">未找到匹配币种</div>}
                </div>
             </section>

             <section className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-purple-400 uppercase flex items-center gap-2 tracking-widest">
                        <Code size={14} /> AI 系统提示词
                    </h3>
                    <button 
                        onClick={() => setShowAIAssistant(!showAIAssistant)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black transition-all ${
                            showAIAssistant 
                            ? 'bg-purple-600 text-white shadow-lg' 
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20'
                        }`}
                    >
                        <Sparkles size={12} /> 策略实验室
                    </button>
                </div>

                {showAIAssistant && (
                    <div className="bg-[#0c0c0e] border border-purple-500/20 rounded-xl overflow-hidden flex flex-col h-80 shadow-2xl animate-in slide-in-from-top-2 duration-300">
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {chatHistory.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                                    <Sparkles className="text-purple-500 opacity-50" size={32} />
                                    <p className="text-xs text-okx-subtext leading-relaxed">
                                        欢迎来到策略实验室！<br/>用白话描述您的交易想法，DeepSeek 将为您转化。
                                    </p>
                                </div>
                            )}
                            {chatHistory.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                                        msg.role === 'user' 
                                        ? 'bg-okx-primary text-white rounded-tr-none' 
                                        : 'bg-white/5 text-gray-200 border border-white/5 rounded-tl-none'
                                    }`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                        {msg.role === 'assistant' && msg.content.includes('```') && (
                                            <button 
                                                onClick={() => applyPrompt(msg.content)}
                                                className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold transition-all w-full justify-center"
                                            >
                                                <Copy size={12} /> 应用至当前策略
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isChatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 p-3 rounded-2xl animate-pulse flex gap-1">
                                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce delay-75"></div>
                                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce delay-150"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-3 bg-black/40 border-t border-white/5 flex gap-2">
                            <input 
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                                placeholder="输入您的策略灵感..."
                                className="flex-1 bg-transparent border border-white/10 rounded-lg px-4 py-2 text-xs text-white outline-none focus:border-purple-500/50"
                            />
                            <button 
                                onClick={handleChatSend}
                                className="bg-purple-600 hover:bg-purple-500 p-2 rounded-lg text-white transition-all active:scale-95"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                )}

                <textarea 
                    value={currentStrategy.systemPrompt}
                    onChange={e => updateStrategy(currentStrategy.id, { systemPrompt: e.target.value })}
                    rows={8}
                    className="w-full bg-[#09090b] border border-okx-border rounded-xl px-4 py-3 text-sm text-gray-200 focus:border-okx-primary outline-none font-mono leading-relaxed custom-scrollbar"
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
           <div className="flex gap-3">
               <button onClick={onClose} className="px-6 py-2.5 rounded-full font-bold text-xs text-okx-subtext hover:text-white transition-colors">
                   取消
               </button>
               <button 
                 onClick={() => onSave(localConfig)}
                 className="bg-okx-primary hover:bg-blue-600 text-white px-8 py-2.5 rounded-full font-bold transition-all shadow-lg shadow-okx-primary/30 flex items-center gap-2"
               >
                 <Save size={18} /> 应用设置并重启
               </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
