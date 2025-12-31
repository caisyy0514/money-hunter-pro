
import React, { useEffect, useState } from 'react';
import CandleChart from '../components/CandleChart';
import SettingsModal from '../components/SettingsModal';
import HistoryModal from '../components/HistoryModal';
import DecisionReport from '../components/DecisionReport';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, PositionData } from '../types';
import { Settings, Play, Pause, Activity, Terminal, History, Wallet, TrendingUp, AlertTriangle, ExternalLink, ShieldCheck, Crosshair, DollarSign, Layers, X, Coins, Zap } from 'lucide-react';
import { DEFAULT_CONFIG, COIN_CONFIG, TAKER_FEE_RATE } from '../constants';

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

  // Fetch Status
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

    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleStrategy = async () => {
    try {
      await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: !isRunning })
      });
      setIsRunning(!isRunning);
    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async (newConfig: AppConfig) => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      setConfig(newConfig);
      setIsSettingsOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const currentCoinData = marketData ? marketData[activeCoin] : null;
  const currentDecision = decisions[activeCoin] || null;

  const renderPositionCard = (pos: PositionData) => {
    const isLong = pos.posSide === 'long';
    const upl = parseFloat(pos.upl);
    
    const coinKey = Object.keys(COIN_CONFIG).find(key => COIN_CONFIG[key].instId === pos.instId);
    const coinConf = coinKey ? COIN_CONFIG[coinKey] : null;
    const contractVal = coinConf ? coinConf.contractVal : 0;
    
    const posMarketData = coinKey && marketData ? marketData[coinKey] : null;
    const currentPriceStr = posMarketData?.ticker?.last || "0";
    const price = parseFloat(currentPriceStr);

    const sizeCoin = (parseFloat(pos.pos) * contractVal).toFixed(2);
    const margin = parseFloat(pos.margin).toFixed(2);
    const avgPx = parseFloat(pos.avgPx);
    
    const sizeVal = parseFloat(pos.pos) * contractVal;
    const openFee = sizeVal * avgPx * TAKER_FEE_RATE;
    const closeFee = sizeVal * price * TAKER_FEE_RATE;
    const netPnL = upl - (openFee + closeFee);
    
    let bePxVal = parseFloat(pos.breakEvenPx || "0");
    let isEstimated = false;

    if (bePxVal <= 0 && avgPx > 0) {
        isEstimated = true;
        if (isLong) {
            bePxVal = avgPx * (1 + TAKER_FEE_RATE) / (1 - TAKER_FEE_RATE);
        } else {
            bePxVal = avgPx * (1 - TAKER_FEE_RATE) / (1 + TAKER_FEE_RATE);
        }
    }
    const bePxStr = bePxVal > 0 ? bePxVal.toFixed(2) : '--';

    return (
      <div key={pos.instId + pos.posSide} className="bg-[#121214] border border-okx-border rounded-lg p-4 shadow-sm hover:border-okx-primary/50 transition-colors">
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-800">
           <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase ${isLong ? 'bg-okx-up/20 text-okx-up' : 'bg-okx-down/20 text-okx-down'}`}>
                {pos.posSide}
              </span>
              <span className="font-bold text-white text-sm">{coinConf?.displayName || pos.instId}</span>
              <span className="text-xs text-okx-subtext bg-gray-800 px-1.5 rounded">{pos.mgnMode}</span>
           </div>
           <div className={`text-sm font-mono font-bold ${upl >= 0 ? 'text-okx-up' : 'text-okx-down'}`}>
              {upl > 0 ? '+' : ''}{upl} U
           </div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
           <div className="space-y-1">
              <div className="text-okx-subtext flex items-center gap-1">
                 <Layers size={10} /> 持仓规模
              </div>
              <div className="text-gray-200 font-mono">
                 {pos.pos} 张 <span className="text-gray-500">({sizeCoin} {coinConf?.displayName})</span>
              </div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext flex items-center justify-end gap-1">
                 <DollarSign size={10} /> 保证金 (Margin)
              </div>
              <div className="text-gray-200 font-mono">{margin} U</div>
           </div>

           <div className="space-y-1">
              <div className="text-okx-subtext">持仓均价 (Avg)</div>
              <div className="text-white font-mono">{pos.avgPx}</div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext text-blue-400">最新市价 (Last)</div>
              <div className="text-blue-400 font-mono font-bold">{price.toFixed(4)}</div>
           </div>

           <div className="space-y-1">
              <div className="text-yellow-500/90 flex items-center gap-1 font-bold" title={isEstimated ? "本地估算值" : "交易所数据"}>
                 <AlertTriangle size={10} /> 盈亏平衡 (BE)
              </div>
              <div className="text-yellow-500 font-mono font-bold">
                  {bePxStr} {isEstimated && <span className="text-[9px] font-normal opacity-70">*</span>}
              </div>
           </div>
           <div className="space-y-1 text-right">
              <div className="text-okx-subtext flex items-center justify-end gap-1 font-bold">
                 <TrendingUp size={10} /> 净利润 (Net)
              </div>
              <div className={`font-mono font-bold ${netPnL >= 0 ? 'text-okx-up' : 'text-okx-down'}`}>
                 {netPnL > 0 ? '+' : ''}{netPnL.toFixed(2)} U
              </div>
           </div>

           <div className="col-span-2 h-px bg-gray-800/50 my-1"></div>

           <div className="space-y-1">
              <div className="text-okx-subtext flex items-center gap-1">
                 <ShieldCheck size={10} /> 止损触发 (SL)
              </div>
              <div className="text-orange-400 font-mono">{pos.slTriggerPx || '未设置'}</div>
           </div>

           <div className="space-y-1 text-right">
              <div className="text-okx-subtext flex items-center justify-end gap-1">
                 <Crosshair size={10} /> 止盈触发 (TP)
              </div>
              <div className="text-green-400 font-mono">{pos.tpTriggerPx || '未设置'}</div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-okx-bg text-okx-text font-sans selection:bg-okx-primary selection:text-white flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 border-b border-okx-border bg-okx-card/50 backdrop-blur-md z-40">
        <div className="max-w-[1920px] mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full transition-colors duration-500 ${isRunning ? 'bg-okx-up animate-pulse' : 'bg-okx-subtext'}`}></div>
            <h1 className="font-bold text-lg tracking-tight flex items-center gap-2">
              EMA 3in1
              <span className="text-xs font-normal text-okx-subtext px-2 py-0.5 bg-okx-border rounded-full">Pro</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
             <div className="hidden md:flex items-center gap-6 mr-6 text-xs font-mono text-okx-subtext bg-okx-bg/30 px-3 py-1.5 rounded-lg border border-okx-border/50">
                <div className="flex items-center gap-2">
                   <Wallet size={14} className="text-gray-400"/>
                   权益: <span className="text-white font-bold">{accountData?.balance.totalEq || '0.00'}</span>
                </div>
             </div>

            <button onClick={() => setIsHistoryOpen(true)} className="p-2 hover:bg-okx-border rounded-lg text-okx-subtext hover:text-white transition-colors">
              <History size={18} />
            </button>
            <button 
              onClick={toggleStrategy}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-lg ${
                isRunning 
                  ? 'bg-okx-down/10 text-okx-down border border-okx-down/20' 
                  : 'bg-okx-up text-okx-bg'
              }`}
            >
              {isRunning ? <Pause size={14} /> : <Play size={14} />}
              {isRunning ? '停止' : '启动'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-okx-border rounded-lg text-okx-subtext hover:text-white transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto lg:overflow-hidden p-4">
        <div className="max-w-[1920px] mx-auto w-full lg:h-full h-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
        
          <div className="lg:col-span-8 flex flex-col gap-4 lg:h-full h-auto min-h-0">
            <div className="flex gap-2 shrink-0 overflow-x-auto pb-1">
                {Object.keys(COIN_CONFIG).map(coin => (
                    <button
                        key={coin}
                        onClick={() => setActiveCoin(coin)}
                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 border whitespace-nowrap ${
                            activeCoin === coin 
                            ? 'bg-okx-primary text-white border-okx-primary' 
                            : 'bg-okx-card text-okx-subtext border-okx-border'
                        }`}
                    >
                        <Coins size={12} /> {coin}
                    </button>
                ))}
            </div>

            <div className="lg:h-[60%] h-[400px] bg-okx-card rounded-xl border border-okx-border overflow-hidden relative group shadow-lg shrink-0">
               {currentCoinData?.candles3m && currentCoinData.candles3m.length > 0 ? (
                  <CandleChart data={currentCoinData.candles3m} />
               ) : (
                  <div className="w-full h-full flex items-center justify-center text-okx-subtext">
                    <Activity className="animate-pulse mr-2" /> 等待 {activeCoin} ...
                  </div>
               )}
               <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-4 py-2 rounded-lg border border-white/10 text-xs font-mono shadow-xl pointer-events-none">
                  <div className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                    {currentCoinData?.ticker?.last || '0.00'}
                  </div>
               </div>
            </div>

            <div className="lg:h-[40%] h-[300px] bg-okx-card rounded-xl border border-okx-border flex flex-col shadow-lg overflow-hidden shrink-0">
              <div className="px-4 py-2.5 border-b border-okx-border bg-okx-bg/50 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-okx-subtext flex items-center gap-2">
                  <Terminal size={14}/> System Logs
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 custom-scrollbar bg-[#0c0c0e]">
                {logs.slice().reverse().map((log) => (
                  <div key={log.id} className="flex gap-3 items-start border-b border-white/[0.03] last:border-0 pb-2 hover:bg-white/[0.02] transition-colors group">
                    <span className="text-gray-600 shrink-0 select-none w-[70px]">
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                    </span>
                    <span className={`font-black shrink-0 w-[60px] text-center rounded-[2px] text-[10px] py-0.5 ${
                      log.type === 'ERROR' ? 'bg-red-500/10 text-okx-down border border-red-500/20' :
                      log.type === 'SUCCESS' ? 'bg-emerald-500/10 text-okx-up border border-emerald-500/20' :
                      log.type === 'WARNING' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                      log.type === 'TRADE' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                    }`}>
                      [{log.type}]
                    </span>
                    <span className="text-gray-200 break-words flex-1 leading-relaxed">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4 lg:h-full h-auto min-h-0">
              <div className="lg:flex-1 h-auto bg-okx-card rounded-xl border border-okx-border shadow-lg overflow-hidden flex flex-col min-h-0">
                  <div className="px-4 py-3 border-b border-okx-border bg-okx-bg/30">
                      <div className="flex items-center gap-2 font-bold text-white text-sm">
                          <Wallet size={16} /> 持仓 ({accountData?.positions.length || 0})
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                     {accountData && accountData.positions.length > 0 ? (
                         accountData.positions.map(p => renderPositionCard(p))
                     ) : (
                         <div className="p-4 text-center text-okx-subtext text-xs">暂无持仓</div>
                     )}
                  </div>
              </div>

              <div className="h-auto bg-okx-card rounded-xl border border-okx-border flex flex-col overflow-hidden shadow-lg shrink-0">
                  <div className="p-3 border-b border-okx-border flex justify-between items-center">
                      <h2 className="font-bold text-white text-sm flex items-center gap-2">
                          <Activity size={16} className="text-purple-500" /> {activeCoin} 决策
                      </h2>
                  </div>
                  <div className="p-4 bg-[#121214]">
                      {currentDecision ? (() => {
                          const coinConf = COIN_CONFIG[activeCoin];
                          const price = parseFloat(currentCoinData?.ticker?.last || '0');
                          const lev = parseFloat(currentDecision.leverage || '20');
                          const sz = parseFloat(currentDecision.size || '0');
                          const val = sz * (coinConf?.contractVal || 0) * price;
                          const margin = lev > 0 ? val / lev : 0;

                          return (
                          <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                  <span className={`px-4 py-1.5 rounded text-sm font-bold ${
                                      currentDecision.action === 'BUY' ? 'bg-okx-up text-black' :
                                      currentDecision.action === 'SELL' ? 'bg-okx-down text-white' :
                                      'bg-gray-700 text-gray-300'
                                  }`}>
                                      {currentDecision.action}
                                  </span>
                                  <div className="text-right">
                                      <div className="text-[10px] text-okx-subtext">置信度</div>
                                      <div className="text-purple-400 font-bold font-mono">{currentDecision.trading_decision?.confidence}</div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50">
                                    <div className="text-okx-subtext mb-0.5 flex items-center gap-1"><Layers size={10}/> 数量 (Size)</div>
                                    <div className="font-mono text-white tracking-wider flex items-baseline gap-1">
                                        {sz} 张 
                                        {val > 0 && <span className="text-[9px] text-gray-500">({val.toFixed(0)}U)</span>}
                                    </div>
                                </div>
                                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50 text-right">
                                    <div className="text-okx-subtext mb-0.5 flex items-center justify-end gap-1"><Zap size={10}/> 杠杆 (Lev)</div>
                                    <div className="font-mono text-white tracking-wider">{lev}x</div>
                                </div>
                                
                                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50">
                                    <div className="text-okx-subtext mb-0.5 flex items-center gap-1"><DollarSign size={10}/> 保证金 (Est)</div>
                                    <div className="font-mono text-yellow-500 tracking-wider">{margin.toFixed(2)} U</div>
                                </div>
                                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50 text-right">
                                    <div className="text-okx-subtext mb-0.5 flex items-center justify-end gap-1"><TrendingUp size={10}/> 市价 (Price)</div>
                                    <div className="font-mono text-blue-400 tracking-wider">{price.toFixed(2)}</div>
                                </div>

                                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50">
                                    <div className="text-okx-subtext mb-0.5 flex items-center gap-1"><ShieldCheck size={10}/> 止损 (SL)</div>
                                    <div className="font-mono text-orange-400 tracking-wider">{currentDecision.trading_decision?.stop_loss || '--'}</div>
                                </div>
                                <div className="bg-gray-800/30 p-2 rounded border border-gray-700/50 text-right">
                                    <div className="text-okx-subtext mb-0.5 flex items-center justify-end gap-1"><Crosshair size={10}/> 止盈 (TP)</div>
                                    <div className="font-mono text-green-400 tracking-wider">{currentDecision.trading_decision?.profit_target || '--'}</div>
                                </div>
                              </div>

                              <button 
                                onClick={() => setIsFullReportOpen(true)}
                                className="w-full py-2 bg-gray-800 text-xs text-okx-subtext rounded border border-gray-700"
                              >
                                  <ExternalLink size={12} className="inline mr-1" /> 查看报告
                              </button>
                          </div>
                      )})() : (
                          <div className="py-6 text-center text-xs text-okx-subtext">连接中...</div>
                      )}
                  </div>
              </div>
          </div>
        </div>
      </main>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        config={config}
        onSave={saveConfig}
      />
      
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      {isFullReportOpen && currentDecision && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
              <div className="bg-okx-card w-full max-w-4xl max-h-[85vh] rounded-xl border border-okx-border flex flex-col">
                  <div className="p-4 border-b border-okx-border flex justify-between items-center">
                      <h3 className="text-lg font-bold text-white">{activeCoin} 报告</h3>
                      <button onClick={() => setIsFullReportOpen(false)}><X size={24} /></button>
                  </div>
                  <div className="flex-1 overflow-hidden p-0 min-h-0">
                      <DecisionReport decision={currentDecision} />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
