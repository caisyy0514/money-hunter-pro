
import React, { useEffect, useState, useMemo } from 'react';
import CandleChart from './components/CandleChart';
import SettingsModal from './components/SettingsModal';
import HistoryModal from './components/HistoryModal';
import DecisionReport from './components/DecisionReport';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, PositionData } from './types';
import { Settings, Play, Pause, Activity, Terminal, Shield, Rocket, ExternalLink, X, ChevronDown, Loader2, Gauge } from 'lucide-react';
import { DEFAULT_CONFIG, TAKER_FEE_RATE } from './constants';

const App: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketDataCollection | null>(null);
  const [accountData, setAccountData] = useState<AccountContext | null>(null);
  const [decisions, setDecisions] = useState<Record<string, AIDecision>>({});
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [activeCoin, setActiveCoin] = useState<string>('PEPE');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const cfg = await res.json();
                setConfig(cfg);
            }
        } catch (e) {
            console.error("Init failed", e);
        }
    };
    init();
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data) {
            setMarketData(prev => data.marketData || prev);
            setAccountData(prev => data.accountData || prev);
            setDecisions(data.latestDecisions || {});
            setLogs(data.logs || []);
            setIsRunning(data.isRunning);
            if (!isInitialized) setIsInitialized(true);
        }
      } catch (e) { console.error(e); }
    };
    fetchStatus(); 
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [isInitialized]);

  const activeStrategy = useMemo(() => {
      if (!config || !config.strategies) return DEFAULT_CONFIG.strategies[0];
      return config.strategies.find(s => s.id === config.activeStrategyId) || config.strategies[0];
  }, [config]);

  const coinList = useMemo(() => {
      if (!marketData) return [];
      return Object.keys(marketData);
  }, [marketData]);

  useEffect(() => {
    if (coinList.length > 0 && !coinList.includes(activeCoin)) {
        setActiveCoin(coinList[0]);
    }
  }, [coinList, activeCoin]);

  const toggleStrategy = async () => {
    const nextState = !isRunning;
    const res = await fetch('/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ running: nextState })
    });
    if (res.ok) setIsRunning(nextState);
  };

  const saveConfig = async (newConfig: AppConfig) => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    });
    if (res.ok) {
        setConfig(newConfig);
        setIsSettingsOpen(false);
    }
  };

  // 辅助函数：安全地获取推理文本的首个单词/短语
  const getSafeReasoningLabel = (decision: AIDecision) => {
      const reasoning = decision.reasoning;
      if (typeof reasoning !== 'string') return "LOGIC";
      return reasoning.split(' ')[0] || "LOGIC";
  };

  const renderPositionCard = (pos: PositionData) => {
    const isLong = pos.posSide === 'long';
    const coinName = pos.instId.split('-')[0];
    const ticker = marketData?.[coinName]?.ticker;
    const netRoi = parseFloat(pos.uplRatio) - (TAKER_FEE_RATE * 2);
    const isProtected = netRoi >= activeStrategy.beTriggerRoi;
    
    return (
      <div key={`${pos.instId}-${pos.posSide}`} className="bg-[#121214] border border-okx-border rounded-xl p-4 shadow-sm hover:border-okx-primary/30 transition-all group overflow-hidden relative">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
           <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase ${isLong ? 'bg-okx-up/10 text-okx-up' : 'bg-okx-down/10 text-okx-down'}`}>
                {String(pos.posSide)} {String(pos.leverage)}x
              </span>
              <span className="font-bold text-white text-sm">{coinName}</span>
              {isProtected && <span className="bg-emerald-500/20 text-emerald-400 p-1 rounded-full"><Shield size={12}/></span>}
           </div>
           <div className={`text-sm font-mono font-bold ${netRoi >= 0 ? 'text-okx-up' : 'text-okx-down'}`}>
              {(netRoi * 100).toFixed(2)}%
           </div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 text-[11px] font-mono relative z-10">
           <div className="space-y-1">
              <div className="text-okx-subtext">数量</div>
              <div className="text-gray-200">{String(pos.pos)} <span className="text-[10px] opacity-40">张</span></div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext">保证金</div>
              <div className="text-gray-200">{parseFloat(pos.margin).toFixed(2)} U</div>
           </div>
           <div className="space-y-1">
              <div className="text-okx-subtext">开仓价</div>
              <div className="text-white">{String(pos.avgPx)}</div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext">最新价</div>
              <div className="text-blue-400">{ticker?.last || '--'}</div>
           </div>
        </div>
        <div className="absolute top-0 right-0 p-2 opacity-5">
            <Rocket size={48} />
        </div>
      </div>
    );
  };

  if (!isInitialized) {
      return (
          <div className="h-screen bg-okx-bg flex flex-col items-center justify-center gap-4">
              <div className="relative"><Activity size={64} className="text-okx-primary animate-pulse opacity-20" /><Loader2 size={32} className="text-okx-primary animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" /></div>
              <div className="text-center">
                  <p className="text-white font-black text-xl italic tracking-tighter">HUNTER <span className="text-okx-primary not-italic">PRO</span></p>
                  <p className="text-okx-subtext text-xs mt-1 uppercase tracking-widest font-bold">同步战术核心...</p>
              </div>
          </div>
      );
  }

  const currentSlots = accountData?.positions.length || 0;
  const slotProgress = (currentSlots / activeStrategy.maxPositions) * 100;

  return (
    <div className="h-screen bg-okx-bg text-okx-text flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 border-b border-okx-border bg-[#121214] z-40 px-6">
        <div className="max-w-[1920px] mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="font-black text-xl flex items-center gap-2 italic tracking-tighter">
              HUNTER <span className="text-okx-primary not-italic">PRO</span>
            </h1>
            <div className="flex items-center bg-[#09090b] border border-okx-border rounded-full px-4 py-1.5 gap-3">
               <Rocket size={14} className="text-purple-500" />
               <span className="text-xs font-bold text-okx-subtext">模式:</span>
               <button onClick={() => setIsSettingsOpen(true)} className="text-xs font-black text-white flex items-center gap-1 hover:text-okx-primary transition-colors">
                  {String(activeStrategy.name)} <ChevronDown size={12} />
               </button>
            </div>
            
            <div className="hidden xl:flex items-center gap-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                <span className="text-[10px] font-black text-okx-subtext uppercase tracking-widest">持仓槽位</span>
                <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-okx-primary transition-all duration-500" style={{ width: `${slotProgress}%` }}></div>
                </div>
                <span className="text-[10px] font-bold text-white">{currentSlots} / {activeStrategy.maxPositions}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex gap-6 text-[11px] font-mono border-r border-okx-border pr-6">
                <div><div className="text-okx-subtext">资产权益</div><div className="text-white font-bold">{accountData?.balance?.totalEq || '0.00'} U</div></div>
                <div><div className="text-okx-subtext">候选池</div><div className="text-okx-primary font-bold">{coinList.length}</div></div>
            </div>
            <button onClick={toggleStrategy} className={`flex items-center gap-2 px-6 py-2 rounded-full font-black text-xs transition-all ${isRunning ? 'bg-okx-down/10 text-okx-down border border-okx-down/20' : 'bg-okx-up text-black'}`}>
              {isRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {isRunning ? '任务执行中' : '启动猎手'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-okx-border rounded-lg"><Settings size={20} /></button>
            <button onClick={() => setIsHistoryOpen(true)} className="p-2 hover:bg-okx-border rounded-lg"><Shield size={20} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-hidden">
        <div className="max-w-[1920px] mx-auto h-full grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2 pb-1 shrink-0 overflow-x-auto custom-scrollbar">
                {coinList.map(coin => (
                    <button key={coin} onClick={() => setActiveCoin(coin)} className={`px-5 py-2 rounded-full font-bold text-xs transition-all border shrink-0 ${activeCoin === coin ? 'bg-okx-primary border-okx-primary text-white shadow-lg' : 'bg-[#18181b] border-okx-border text-okx-subtext hover:border-white/10'}`}>
                        {String(coin)}
                    </button>
                ))}
            </div>
            <div className="flex-1 bg-[#121214] rounded-2xl border border-okx-border relative overflow-hidden shadow-2xl">
                {marketData?.[activeCoin] ? <CandleChart data={marketData[activeCoin].candles3m} /> : <div className="h-full flex items-center justify-center opacity-20"><Activity size={48} className="animate-spin" /></div>}
            </div>
            <div className="h-64 bg-[#121214] rounded-2xl border border-okx-border overflow-hidden flex flex-col shadow-inner">
              <div className="p-3 border-b border-okx-border bg-black/20 flex items-center gap-2 text-xs font-black text-okx-subtext"><Terminal size={14}/> 战术终端</div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1.5 custom-scrollbar bg-black/10">
                {logs.length === 0 ? <div className="text-gray-700 italic">初始化中...</div> : logs.slice().reverse().map(log => (
                    <div key={log.id} className="flex gap-4 opacity-80 hover:opacity-100 transition-opacity">
                        <span className="text-gray-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={log.type === 'ERROR' ? 'text-okx-down' : log.type === 'SUCCESS' ? 'text-emerald-400' : log.type === 'TRADE' ? 'text-blue-400 font-bold' : 'text-okx-subtext'}>{String(log.message)}</span>
                    </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 overflow-hidden">
             <div className="flex-1 bg-[#121214] rounded-2xl border border-okx-border flex flex-col overflow-hidden shadow-xl">
                <div className="p-4 border-b border-okx-border font-black text-xs uppercase tracking-widest bg-black/10 flex justify-between"><span>实战持仓 (SLOTS)</span><span>{currentSlots} / {activeStrategy.maxPositions}</span></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {accountData && accountData.positions.length > 0 ? accountData.positions.map(p => renderPositionCard(p)) : (
                        <div className="text-center py-20 text-okx-subtext text-xs opacity-50 italic">侦测范围内暂无目标持仓</div>
                    )}
                </div>
             </div>
             <div className="bg-[#121214] rounded-2xl border border-okx-border p-6 space-y-4 shadow-xl">
                <div className="flex justify-between items-center"><span className="font-black text-sm uppercase tracking-widest">{String(activeCoin)} 侦察报告</span><span className="text-[9px] px-2 py-0.5 rounded-full bg-okx-primary/20 text-okx-primary font-black uppercase">AI Analysis</span></div>
                {decisions[activeCoin] ? (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-xl font-black text-xl text-center border-2 transition-colors ${decisions[activeCoin].action === 'BUY' ? 'bg-okx-up/10 border-okx-up text-okx-up' : decisions[activeCoin].action === 'SELL' ? 'bg-okx-down/10 border-okx-down text-okx-down' : 'bg-white/5 border-white/5 text-gray-500'}`}>
                            {decisions[activeCoin].action === 'HOLD' ? '等待时机' : String(decisions[activeCoin].action)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[10px] font-mono">
                            <div className="p-3 bg-black/20 rounded-lg border border-white/5"><div className="text-okx-subtext">信心值</div><div className="text-white text-sm font-bold">{String(decisions[activeCoin].trading_decision.confidence)}</div></div>
                            <div className="p-3 bg-black/20 rounded-lg border border-white/5 text-right"><div className="text-okx-subtext">预判逻辑</div><div className="text-purple-400 text-sm font-bold uppercase truncate">{getSafeReasoningLabel(decisions[activeCoin])}</div></div>
                        </div>
                        <button onClick={() => setIsFullReportOpen(true)} className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-center gap-2"><ExternalLink size={14} /> 深度战术推演</button>
                    </div>
                ) : <div className="text-center py-10 text-okx-subtext text-xs italic">情报搜集中...</div>}
             </div>
          </div>
        </div>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} config={config} onSave={saveConfig} />
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      {isFullReportOpen && decisions[activeCoin] && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-[#121214] w-full max-w-4xl max-h-[85vh] rounded-2xl border border-okx-border flex flex-col overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-okx-border flex justify-between items-center bg-black/20"><h3 className="font-black text-white flex items-center gap-3"><Gauge className="text-okx-primary" size={18}/> {String(activeCoin)} 战术全景报告</h3><button onClick={() => setIsFullReportOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar"><DecisionReport decision={decisions[activeCoin]} /></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
