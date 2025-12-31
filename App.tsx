
import React, { useEffect, useState, useMemo } from 'react';
import CandleChart from './components/CandleChart';
import SettingsModal from './components/SettingsModal';
import HistoryModal from './components/HistoryModal';
import DecisionReport from './components/DecisionReport';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, PositionData } from './types';
import { Settings, Play, Pause, Activity, Terminal, History, Wallet, TrendingUp, AlertTriangle, ExternalLink, ShieldCheck, Crosshair, DollarSign, Layers, X, Coins, Zap, ChevronDown, Rocket, Loader2 } from 'lucide-react';
import { DEFAULT_CONFIG, COIN_CONFIG, TAKER_FEE_RATE } from './constants';

const App: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketDataCollection | null>(null);
  const [accountData, setAccountData] = useState<AccountContext | null>(null);
  const [decisions, setDecisions] = useState<Record<string, AIDecision>>({});
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [activeCoin, setActiveCoin] = useState<string>('ETH');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);

  // Poll volatile state (Market, Account, Logs)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data) {
            setMarketData(data.marketData);
            setAccountData(data.accountData);
            setDecisions(data.latestDecisions || {});
            setLogs(data.logs || []);
            setIsRunning(data.isRunning);
            // DO NOT setConfig(data.config) here. Overwriting local state with redacted data causes crashes.
            setIsInitialized(true);
        }
      } catch (e) {
        console.error("Fetch status failed", e);
      }
    };
    
    fetchStatus(); // Initial fetch
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

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
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    });
    setConfig(newConfig);
    setIsSettingsOpen(false);
  };

  // Memoized derived data for stability
  const currentCoinData = useMemo(() => marketData ? marketData[activeCoin] : null, [marketData, activeCoin]);
  const currentDecision = useMemo(() => decisions[activeCoin] || null, [decisions, activeCoin]);
  
  const activeStrategy = useMemo(() => {
      if (!config.strategies || config.strategies.length === 0) return DEFAULT_CONFIG.strategies[0];
      return config.strategies.find(s => s.id === config.activeStrategyId) || config.strategies[0];
  }, [config]);

  // Handle crash when strategy coins change
  useEffect(() => {
    if (activeStrategy && !activeStrategy.enabledCoins.includes(activeCoin)) {
        if (activeStrategy.enabledCoins.length > 0) {
            setActiveCoin(activeStrategy.enabledCoins[0]);
        }
    }
  }, [activeStrategy, activeCoin]);

  const renderPositionCard = (pos: PositionData) => {
    const isLong = pos.posSide === 'long';
    return (
      <div key={pos.instId + pos.posSide} className="bg-[#121214] border border-okx-border rounded-xl p-4 shadow-sm hover:border-okx-primary/30 transition-all group">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
           <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-tighter ${isLong ? 'bg-okx-up/10 text-okx-up' : 'bg-okx-down/10 text-okx-down'}`}>
                {pos.posSide} {pos.leverage}x
              </span>
              <span className="font-bold text-white text-sm">{pos.instId.split('-')[0]}</span>
           </div>
           <div className={`text-sm font-mono font-bold ${parseFloat(pos.upl) >= 0 ? 'text-okx-up' : 'text-okx-down'}`}>
              {parseFloat(pos.upl) > 0 ? '+' : ''}{pos.upl} U
           </div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 text-[11px] font-mono">
           <div className="space-y-1">
              <div className="text-okx-subtext flex items-center gap-1">数量</div>
              <div className="text-gray-200">{pos.pos} <span className="text-[10px] opacity-50">Contracts</span></div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext flex items-center justify-end gap-1">保证金</div>
              <div className="text-gray-200">{parseFloat(pos.margin).toFixed(2)} U</div>
           </div>
           <div className="space-y-1">
              <div className="text-okx-subtext">均价</div>
              <div className="text-white">{pos.avgPx}</div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext">市价</div>
              <div className="text-blue-400">{currentCoinData?.ticker.last || '--'}</div>
           </div>
        </div>
      </div>
    );
  };

  if (!isInitialized) {
      return (
          <div className="h-screen bg-okx-bg flex flex-col items-center justify-center gap-4">
              <div className="relative">
                  <Activity size={64} className="text-okx-primary animate-pulse opacity-20" />
                  <Loader2 size={32} className="text-okx-primary animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                  <p className="text-white font-black text-xl italic tracking-tighter">MONEY HUNTER <span className="text-okx-primary not-italic">PRO</span></p>
                  <p className="text-okx-subtext text-xs mt-1 uppercase tracking-widest font-bold">Synchronizing Terminal...</p>
              </div>
          </div>
      );
  }

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
               <span className="text-xs font-bold text-okx-subtext">策略:</span>
               <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="text-xs font-black text-white flex items-center gap-1 hover:text-okx-primary transition-colors"
               >
                  {activeStrategy.name} <ChevronDown size={12} />
               </button>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex gap-6 text-[11px] font-mono border-r border-okx-border pr-6">
                <div>
                    <div className="text-okx-subtext">账户净值</div>
                    <div className="text-white font-bold">{accountData?.balance.totalEq || '0.00'} U</div>
                </div>
                <div>
                    <div className="text-okx-subtext">频率</div>
                    <div className="text-okx-primary font-bold">{(accountData?.positions.length || 0) > 0 ? activeStrategy.holdingInterval : activeStrategy.emptyInterval}s</div>
                </div>
            </div>

            <button onClick={() => setIsHistoryOpen(true)} className="p-2 hover:bg-okx-border rounded-lg text-okx-subtext"><History size={20} /></button>
            <button 
              onClick={toggleStrategy}
              className={`flex items-center gap-2 px-6 py-2 rounded-full font-black text-xs transition-all ${isRunning ? 'bg-okx-down/10 text-okx-down border border-okx-down/20' : 'bg-okx-up text-black'}`}
            >
              {isRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {isRunning ? '系统运行中' : '启动交易'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-okx-border rounded-lg"><Settings size={20} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-hidden">
        <div className="max-w-[1920px] mx-auto h-full grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2 pb-1 shrink-0">
                {activeStrategy.enabledCoins.map(coin => (
                    <button key={coin} onClick={() => setActiveCoin(coin)} className={`px-5 py-2 rounded-full font-bold text-xs transition-all border ${activeCoin === coin ? 'bg-okx-primary border-okx-primary text-white shadow-lg' : 'bg-[#18181b] border-okx-border text-okx-subtext'}`}>
                        {coin}
                    </button>
                ))}
            </div>

            <div className="flex-1 bg-[#121214] rounded-2xl border border-okx-border relative overflow-hidden">
                {currentCoinData ? <CandleChart data={currentCoinData.candles3m} /> : <div className="h-full flex items-center justify-center opacity-20"><Activity size={48} className="animate-spin" /></div>}
            </div>

            <div className="h-64 bg-[#121214] rounded-2xl border border-okx-border overflow-hidden flex flex-col">
              <div className="p-3 border-b border-okx-border bg-black/20 flex items-center gap-2 text-xs font-black text-okx-subtext"><Terminal size={14}/> 系统流水</div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1.5 custom-scrollbar">
                {logs.slice().reverse().map(log => (
                    <div key={log.id} className="flex gap-4 opacity-80 hover:opacity-100">
                        <span className="text-gray-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={log.type === 'ERROR' ? 'text-okx-down' : log.type === 'SUCCESS' ? 'text-okx-up' : 'text-okx-subtext'}>{log.message}</span>
                    </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 overflow-hidden">
             <div className="flex-1 bg-[#121214] rounded-2xl border border-okx-border flex flex-col overflow-hidden shadow-xl">
                <div className="p-4 border-b border-okx-border font-bold text-sm bg-black/10">账户持仓</div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {accountData?.positions.map(p => renderPositionCard(p))}
                    {(!accountData || accountData.positions.length === 0) && <div className="text-center py-20 text-okx-subtext text-xs opacity-50 italic">当前账户无活跃持仓</div>}
                </div>
             </div>

             <div className="bg-[#121214] rounded-2xl border border-okx-border p-6 space-y-4 shadow-xl">
                <div className="flex justify-between items-center">
                    <span className="font-black text-sm uppercase tracking-widest">{activeCoin} 决策推演</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-okx-primary/20 text-okx-primary font-black">PRO ANALYSIS</span>
                </div>
                {currentDecision ? (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-xl font-black text-xl text-center border-2 ${currentDecision.action === 'BUY' ? 'bg-okx-up/10 border-okx-up text-okx-up' : currentDecision.action === 'SELL' ? 'bg-okx-down/10 border-okx-down text-okx-down' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
                            {currentDecision.action}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[10px] font-mono">
                            <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                <div className="text-okx-subtext">置信评分</div>
                                <div className="text-white text-sm font-bold">{currentDecision.trading_decision.confidence}</div>
                            </div>
                            <div className="p-3 bg-black/20 rounded-lg border border-white/5 text-right">
                                <div className="text-okx-subtext">信号源</div>
                                <div className="text-purple-400 text-sm font-bold uppercase">EMA Hybrid</div>
                            </div>
                        </div>
                        <button onClick={() => setIsFullReportOpen(true)} className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-center gap-2">
                            <ExternalLink size={14} /> 查看深度报告
                        </button>
                    </div>
                ) : <div className="text-center py-10 text-okx-subtext text-xs italic">数据流同步中，请稍候...</div>}
             </div>
          </div>
        </div>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} config={config} onSave={saveConfig} />
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      {isFullReportOpen && currentDecision && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-[#121214] w-full max-w-4xl max-h-[85vh] rounded-2xl border border-okx-border flex flex-col overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-okx-border flex justify-between items-center bg-black/20">
                    <h3 className="font-black text-white flex items-center gap-3">
                        <div className="p-2 bg-okx-primary/20 rounded-lg"><Activity className="text-okx-primary" size={18}/></div>
                        {activeCoin} 决策全报告
                    </h3>
                    <button onClick={() => setIsFullReportOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar"><DecisionReport decision={currentDecision} /></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
