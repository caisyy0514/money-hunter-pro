
import React, { useState } from 'react';
import { X, Play, Loader2, TrendingUp, BarChart3, History, Download } from 'lucide-react';
import { BacktestConfig, BacktestResult } from '../types';
import BacktestReport from './BacktestReport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  enabledCoins: string[];
}

const BacktestModal: React.FC<Props> = ({ isOpen, onClose, enabledCoins }) => {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<BacktestConfig>({
    startTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
    endTime: Date.now(),
    initialBalance: 10000,
    coin: 'ETH'
  });
  const [result, setResult] = useState<BacktestResult | null>(null);

  const runBacktest = async () => {
    setLoading(true);
    setResult(null);
    try {
        const res = await fetch('/api/backtest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await res.json();
        setResult(data);
    } catch (e) {
        alert("回测失败: " + e);
    } finally {
        setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-okx-bg border border-okx-border rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-okx-border flex justify-between items-center bg-okx-card">
          <div className="flex items-center gap-3">
             <History className="text-okx-primary" />
             <h2 className="text-xl font-bold text-white">策略历史回测系统</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-6 bg-black/40 border-b border-okx-border grid grid-cols-4 gap-6 shrink-0">
                <div className="space-y-2">
                    <label className="text-[10px] text-okx-subtext uppercase font-bold">选择币种</label>
                    <select 
                        value={config.coin} 
                        onChange={e => setConfig({...config, coin: e.target.value})}
                        className="w-full bg-okx-bg border border-okx-border rounded-xl px-4 py-2 text-sm text-white focus:ring-1 ring-okx-primary outline-none"
                    >
                        {enabledCoins.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="ETH">ETH</option>
                        <option value="SOL">SOL</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] text-okx-subtext uppercase font-bold">初始资金 (USDT)</label>
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
                <div className="flex items-end">
                    <button 
                        onClick={runBacktest}
                        disabled={loading}
                        className="w-full bg-okx-primary hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-okx-primary/20"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                        {loading ? '数据同步并推演中...' : '开始时空回溯'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {result ? (
                    <BacktestReport result={result} />
                ) : !loading ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 gap-4">
                        <BarChart3 size={80} strokeWidth={1} />
                        <p className="text-sm">配置上方参数，开启 100% 逻辑复刻回测</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                            <TrendingUp size={64} className="text-okx-primary animate-pulse" />
                            <Loader2 size={32} className="text-white animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-lg font-bold text-white">正在拉取 OKX 历史实盘 K 线...</p>
                            <p className="text-xs text-okx-subtext">预计处理 5000+ 条 3m 数据切片，请稍后</p>
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
