
import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Bar, CartesianGrid, Line, Cell, ReferenceLine } from 'recharts';
import { CandleData } from '../types';

interface Props {
  data: CandleData[];
}

// EMA Calculation Helper
const calculateEMA = (data: any[], period: number) => {
  const k = 2 / (period + 1);
  const result = [];
  let ema = data[0].c;
  result.push(ema);
  
  for (let i = 1; i < data.length; i++) {
    ema = data[i].c * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
};

const CandleChart: React.FC<Props> = ({ data }) => {
  const chartData = useMemo(() => {
    const processed = data.map(d => ({
      timeRaw: parseInt(d.ts),
      time: new Date(parseInt(d.ts)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      o: parseFloat(d.o),
      h: parseFloat(d.h),
      l: parseFloat(d.l),
      c: parseFloat(d.c),
      vol: parseFloat(d.vol),
    }));

    const ema15 = calculateEMA(processed, 15);
    const ema60 = calculateEMA(processed, 60);

    return processed.map((item, i) => ({
      ...item,
      ema15: ema15[i],
      ema60: ema60[i],
      isUp: item.c >= item.o
    }));
  }, [data]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const lows = chartData.map(d => d.l);
    const highs = chartData.map(d => d.h);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min) * 0.1; 
    return [min - padding, max + padding];
  }, [chartData]);

  // OKX Standard Colors
  const UP_COLOR = '#00C076';
  const DOWN_COLOR = '#FF4D4F';

  const CandleStickShape = (props: any) => {
    const { x, width, payload, yAxis } = props;
    if (!yAxis || !yAxis.scale) return null;

    const scale = yAxis.scale;
    const open = scale(payload.o);
    const close = scale(payload.c);
    const high = scale(payload.h);
    const low = scale(payload.l);
    
    const isUp = payload.c >= payload.o;
    const color = isUp ? UP_COLOR : DOWN_COLOR;
    const bodyHeight = Math.max(Math.abs(open - close), 1);
    const bodyY = Math.min(open, close);
    const centerX = x + width / 2;

    return (
      <g>
        <line x1={centerX} y1={high} x2={centerX} y2={low} stroke={color} strokeWidth={1} />
        <rect 
          x={x} 
          y={bodyY} 
          width={width} 
          height={bodyHeight} 
          fill={color} 
          stroke={color} 
        />
      </g>
    );
  };

  const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].c : 0;

  return (
    <div className="w-full h-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2e2e30" strokeDasharray="2 2" vertical={false} opacity={0.5} />
          
          <XAxis 
            dataKey="time" 
            stroke="#52525b" 
            tick={{fontSize: 10, fill: '#71717a'}} 
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          
          <YAxis 
            domain={yDomain} 
            orientation="right" 
            stroke="#52525b" 
            tick={{fontSize: 10, fill: '#71717a'}}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => val.toFixed(1)}
            width={50}
          />

          <YAxis 
            yAxisId="volume" 
            orientation="left" 
            domain={[0, (dataMax: number) => dataMax * 5]} 
            hide 
          />

          <Tooltip 
            cursor={{ stroke: '#52525b', strokeDasharray: '3 3' }}
            contentStyle={{backgroundColor: 'rgba(24, 24, 27, 0.9)', borderColor: '#27272a', borderRadius: '4px', fontSize: '11px', padding: '8px'}}
            itemStyle={{padding: 0}}
            formatter={(value: any, name: string) => {
                if (name === 'ema15') return [value?.toFixed(2), 'EMA15'];
                if (name === 'ema60') return [value?.toFixed(2), 'EMA60'];
                if (name === 'vol') return [parseInt(value).toLocaleString(), 'Vol'];
                if (name === 'High') return [value, 'Price']; 
                return [value, name];
            }}
            labelStyle={{color: '#a1a1aa', marginBottom: '4px'}}
            content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                        <div className="bg-black/90 border border-okx-border p-2 rounded shadow-xl text-xs min-w-[120px]">
                            <div className="text-gray-400 mb-1">{label}</div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">O</span>
                                <span className={data.isUp ? 'text-[#00C076]' : 'text-[#FF4D4F]'}>{data.o}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">H</span>
                                <span className={data.isUp ? 'text-[#00C076]' : 'text-[#FF4D4F]'}>{data.h}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">L</span>
                                <span className={data.isUp ? 'text-[#00C076]' : 'text-[#FF4D4F]'}>{data.l}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">C</span>
                                <span className={data.isUp ? 'text-[#00C076]' : 'text-[#FF4D4F]'}>{data.c}</span>
                            </div>
                            <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-gray-800">
                                <span className="text-yellow-500">EMA15</span>
                                <span>{data.ema15?.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-purple-500">EMA60</span>
                                <span>{data.ema60?.toFixed(1)}</span>
                            </div>
                        </div>
                    );
                }
                return null;
            }}
          />

          <Bar dataKey="vol" yAxisId="volume" barSize={3}>
             {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.isUp ? UP_COLOR : DOWN_COLOR} opacity={0.3} />
             ))}
          </Bar>

          <Bar dataKey="h" shape={(props: any) => <CandleStickShape {...props} />} isAnimationActive={false} />

          <Line type="monotone" dataKey="ema15" stroke="#fbbf24" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="ema60" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />

          {/* Current Price Line */}
          <ReferenceLine y={lastPrice} stroke="rgba(255, 255, 255, 0.4)" strokeDasharray="3 3" label={{ position: 'right',  value: lastPrice, fill: 'white', fontSize: 10 }} />

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CandleChart;
