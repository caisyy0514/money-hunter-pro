
import React from 'react';
import { AIDecision } from '../types';
import { Activity, Flame, TrendingUp, Zap, Target, AlertCircle } from 'lucide-react';

interface Props {
  decision: AIDecision | null | undefined;
}

const DecisionReport: React.FC<Props> = ({ decision }) => {
  if (!decision) {
      return (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center h-full">
              <AlertCircle className="mb-2 opacity-50" size={32} />
              <p>暂无决策数据</p>
          </div>
      );
  }

  // 强化版渲染函数，确保不会有裸对象进入 JSX 子节点
  const safeRender = (content: any, isPre: boolean = false) => {
    if (content === null || content === undefined) return <span className="text-gray-600 italic">--</span>;
    
    let stringContent = "";
    if (typeof content === 'string') {
        stringContent = content;
    } else if (typeof content === 'number' || typeof content === 'boolean') {
        stringContent = String(content);
    } else if (typeof content === 'object') {
        try {
            // 如果 AI 返回了 JSON 对象，将其格式化为字符串
            stringContent = JSON.stringify(content, null, 2);
        } catch (e) {
            stringContent = "[解析数据出错]";
        }
    } else {
        stringContent = "未知数据类型";
    }

    if (isPre) {
        return <div className="whitespace-pre-wrap break-words">{stringContent}</div>;
    }
    return <span className="break-words">{stringContent}</span>;
  };

  return (
    <div className="p-6 space-y-6 font-mono text-sm leading-relaxed text-gray-300">
        <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-purple-400 font-bold uppercase tracking-wider text-xs">
                <Activity size={14}/> 01. 资金阶段分析
            </h4>
            <div className="p-4 bg-gray-900/50 border border-purple-500/20 rounded-lg shadow-inner">
                {safeRender(decision.stage_analysis)}
            </div>
        </div>

        <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-orange-400 font-bold uppercase tracking-wider text-xs">
                <Flame size={14}/> 02. 实时热点情报
            </h4>
            <div className="p-4 bg-gray-900/50 border border-orange-500/20 rounded-lg text-orange-50">
                {safeRender(decision.hot_events_overview)}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                    <h4 className="flex items-center gap-2 text-blue-400 font-bold uppercase tracking-wider text-xs">
                    <TrendingUp size={14}/> 03. 市场整体评估
                    </h4>
                    <div className="p-4 bg-gray-900/50 border border-blue-500/20 rounded-lg h-full">
                        {safeRender(decision.market_assessment, true)}
                    </div>
            </div>
            <div className="space-y-2">
                    <h4 className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-wider text-xs">
                    <Zap size={14}/> 04. {safeRender(decision.coin)} 专项分析
                    </h4>
                    <div className="p-4 bg-gray-900/50 border border-indigo-500/20 rounded-lg h-full">
                        {safeRender(decision.coin_analysis, true)}
                    </div>
            </div>
        </div>

        <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-yellow-400 font-bold uppercase tracking-wider text-xs">
                <Target size={14}/> 05. 最终决策推理
            </h4>
            <div className="p-4 bg-gray-900/50 border border-yellow-500/20 rounded-lg border-l-4 border-l-yellow-500">
                {safeRender(decision.reasoning, true)}
            </div>
        </div>

        <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-wider text-xs">
                <AlertCircle size={14}/> 06. 策略失效条件
            </h4>
            <div className="p-3 bg-red-900/10 border border-red-500/20 rounded text-red-300">
                {safeRender(decision.trading_decision?.invalidation_condition)}
            </div>
        </div>
    </div>
  );
};

export default DecisionReport;
