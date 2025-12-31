
import React, { useEffect, useState } from 'react';
import CandleChart from './components/CandleChart';
import SettingsModal from './components/SettingsModal';
import HistoryModal from './components/HistoryModal';
import DecisionReport from './components/DecisionReport';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, PositionData } from './types';
import { Settings, Play, Pause, Activity, Terminal, History, Wallet, TrendingUp, AlertTriangle, ExternalLink, ShieldCheck, Crosshair, DollarSign, Layers, X, Coins, Zap, ChevronDown, Rocket } from 'lucide-react';
import { DEFAULT_CONFIG, COIN_CONFIG, TAKER_FEE_RATE } from './constants';

const App: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketDataCollection | null>(null);
  const [accountData, setAccountData] = useState<AccountContext | null>(null);
  const [decisions, setDecisions] = useState<Record<string, AIDecision>>({});
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  const [activeCoin, setActiveCoin] = useState<string>('ETH');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFullReportOpen, setIsFullReportOpen] = useState(false);

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
            setConfig(data.config);
        }
      } catch (e) {
        console.error("Fetch status failed", e);
      }
    };
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleStrategy = async () => {
    const res = await fetch('/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ running: !isRunning })
    });
    setIsRunning(!isRunning);
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

  const currentCoinData = marketData ? marketData[activeCoin] : null;
  const currentDecision = decisions[activeCoin] || null;
  const activeStrategy = config.strategies.find(s => s.id === config.activeStrategyId) || config.strategies[0];

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
               <span className="text-xs font-bold text-okx-subtext">当前方案:</span>
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
                    <div className="text-okx-subtext">活跃频率</div>
                    <div className="text-okx-primary font-bold">{(accountData?.positions.length || 0) > 0 ? activeStrategy.holdingInterval : activeStrategy.emptyInterval}s</div>
                </div>
            </div>

            <button onClick={() => setIsHistoryOpen(true)} className="p-2 hover:bg-okx-border rounded-lg text-okx-subtext"><History size={20} /></button>
            <button 
              onClick={toggleStrategy}
              className={`flex items-center gap-2 px-6 py-2 rounded-full font-black text-xs transition-all ${isRunning ? 'bg-okx-down/10 text-okx-down border border-okx-down/20' : 'bg-okx-up text-black'}`}
            >
              {isRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {isRunning ? '停止系统' : '启动引擎'}
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
              <div className="p-3 border-b border-okx-border bg-black/20 flex items-center gap-2 text-xs font-black text-okx-subtext"><Terminal size={14}/> 实时流水</div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1.5">
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
             <div className="flex-1 bg-[#121214] rounded-2xl border border-okx-border flex flex-col overflow-hidden">
                <div className="p-4 border-b border-okx-border font-bold text-sm">账户持仓</div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {accountData?.positions.map(p => renderPositionCard(p))}
                    {(!accountData || accountData.positions.length === 0) && <div className="text-center py-20 text-okx-subtext text-xs opacity-50">无活跃仓位</div>}
                </div>
             </div>

             <div className="bg-[#121214] rounded-2xl border border-okx-border p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <span className="font-black text-sm">{activeCoin} 决策推演</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-okx-primary/10 text-okx-primary">AI MONITORING</span>
                </div>
                {currentDecision ? (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-xl font-black text-lg text-center ${currentDecision.action === 'BUY' ? 'bg-okx-up text-black' : currentDecision.action === 'SELL' ? 'bg-okx-down text-white' : 'bg-gray-800 text-gray-400'}`}>
                            {currentDecision.action}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[10px] font-mono">
                            <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                <div className="text-okx-subtext">置信度</div>
                                <div className="text-white text-sm font-bold">{currentDecision.trading_decision.confidence}</div>
                            </div>
                            <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                <div className="text-okx-subtext">扫描频率</div>
                                <div className="text-okx-up text-sm font-bold">{(accountData?.positions.length || 0) > 0 ? activeStrategy.holdingInterval : activeStrategy.emptyInterval}s</div>
                            </div>
                        </div>
                        <button onClick={() => setIsFullReportOpen(true)} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-all">查看推演报告</button>
                    </div>
                ) : <div className="text-center py-10 text-okx-subtext text-xs italic">正在获取 AI 建议...</div>}
             </div>
          </div>
        </div>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} config={config} onSave={saveConfig} />
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      {isFullReportOpen && currentDecision && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
              <div className="bg-[#121214] w-full max-w-4xl max-h-[85vh] rounded-2xl border border-okx-border flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-okx-border flex justify-between items-center"><h3 className="font-bold">{activeCoin} 决策全报告</h3><button onClick={() => setIsFullReportOpen(false)}><X size={24} /></button></div>
                  <div className="flex-1 overflow-y-auto"><DecisionReport decision={currentDecision} /></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
