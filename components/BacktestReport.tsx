
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { BacktestResult } from '../types';
import { Shield, Target, Zap, Activity, Award, TrendingDown, DollarSign } from 'lucide-react';

interface Props {
  result: BacktestResult;
}

const BacktestReport: React.FC<Props> = ({ result }) => {
  const stats = [
    { label: '总收益率', value: `${((result.totalProfit / (result.finalBalance - result.totalProfit)) * 100).toFixed(2)}%`, icon: Award, color: 'text-emerald-400' },
    { label: '最大回撤', value: `${(result.maxDrawdown * 100).toFixed(2)}%`, icon: TrendingDown, color: 'text-red-400' },
    { label: '夏普比率', value: result.sharpeRatio.toFixed(2), icon: Shield, color: 'text-blue-400' },
    { label: '胜率', value: `${(result.winRate * 100).toFixed(1)}%`, icon: Target, color: 'text-purple-400' },
    { label: '盈亏比', value: result.profitFactor.toFixed(2), icon: Zap, color: 'text-yellow-400' },
    { label: '总成交', value: result.totalTrades, icon: Activity, color: 'text-okx-subtext' },
  ];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* 核心看板 */}
      <div className="grid grid-cols-6 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-okx-card border border-okx-border p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
                <s.icon size={16} className={s.color} />
                <span className="text-[10px] text-okx-subtext font-bold uppercase tracking-widest">{s.label}</span>
            </div>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 净值曲线图 */}
      <div className="bg-okx-card border border-okx-border rounded-3xl p-6 h-[400px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-sm flex items-center gap-2"><Activity size={16} className="text-okx-primary" /> 账户净值演变曲线 (USDT)</h3>
            <div className="flex gap-4 text-[10px] font-mono">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-okx-primary"></div> Equity</span>
            </div>
        </div>
        <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.equityCurve}>
                    <defs>
                        <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                        dataKey="timestamp" 
                        hide
                    />
                    <YAxis 
                        domain={['auto', 'auto']} 
                        orientation="right" 
                        tick={{fontSize: 10, fill: '#71717a'}} 
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip 
                        contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px'}}
                        labelFormatter={(ts) => new Date(ts).toLocaleString()}
                    />
                    <Area type="monotone" dataKey="equity" stroke="#2563eb" fillOpacity={1} fill="url(#colorEq)" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* 详细指标与周期分析 */}
      <div className="grid grid-cols-2 gap-6">
         <div className="bg-okx-card border border-okx-border rounded-3xl p-6 space-y-4">
            <h3 className="font-bold text-sm">周期表现预估</h3>
            <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                    <span className="text-xs text-okx-subtext">预计周收益率</span>
                    <span className="text-sm font-bold text-emerald-400">+{result.weeklyRoi * 100}%</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                    <span className="text-xs text-okx-subtext">预计月收益率</span>
                    <span className="text-sm font-bold text-emerald-400">+{result.monthlyRoi * 100}%</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                    <span className="text-xs text-okx-subtext">平均盈利 / 平均亏损</span>
                    <div className="text-right">
                        <div className="text-xs font-bold"><span className="text-emerald-400">+{result.avgProfit.toFixed(1)}</span> / <span className="text-red-400">-{result.avgLoss.toFixed(1)}</span></div>
                    </div>
                </div>
            </div>
         </div>
         
         <div className="bg-okx-card border border-okx-border rounded-3xl p-6 flex flex-col">
            <h3 className="font-bold text-sm mb-4">关键成交记录</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 max-h-[200px]">
                {/* Fix: removed redundant .filter(t => t.type !== 'HOLD') as 'HOLD' is not a valid trade type in BacktestTrade */}
                {result.trades.slice(-20).reverse().map((t, i) => (
                    <div key={i} className="flex justify-between items-center p-2 text-[10px] border-b border-white/5 font-mono">
                        <div className="flex items-center gap-2">
                            <span className={t.type === 'BUY' ? 'text-okx-up' : t.type === 'SELL' ? 'text-okx-down' : 'text-blue-400'}>{t.type}</span>
                            <span className="text-okx-subtext">{new Date(t.timestamp).toLocaleDateString()}</span>
                        </div>
                        <div className="flex gap-4">
                            <span>@{t.price}</span>
                            {t.profit && <span className={t.profit > 0 ? 'text-emerald-400' : 'text-red-400'}>{t.profit > 0 ? '+' : ''}{t.profit.toFixed(1)}</span>}
                        </div>
                    </div>
                ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default BacktestReport;
