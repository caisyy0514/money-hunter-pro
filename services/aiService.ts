
import { AIDecision, MarketDataCollection, AccountContext, CandleData, SingleMarketData, SystemLog, StrategyProfile, ChatMessage } from "../types";
import { TAKER_FEE_RATE } from "../constants";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

const callDeepSeek = async (apiKey: string, messages: any[]) => {
    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: messages,
                temperature: 0.1,
                // Optional: set response_format if specific logic requires it, 
                // but for assistant we want plain text explanation + code block
            })
        });
        const json = await response.json();
        if (json.error) throw new Error(json.error.message);
        return json.choices[0].message.content;
    } catch (e: any) {
        throw new Error(e.message || "DeepSeek 请求失败");
    }
};

/**
 * 意图识别与转化：将用户白话策略转化为高效提示词
 */
export const generateAssistantResponse = async (apiKey: string, history: ChatMessage[]): Promise<string> => {
    const metaPrompt: ChatMessage = {
        role: 'system',
        content: `你是一个顶级的量化交易策略提示词工程师。
你的任务是将用户的交易想法（白话描述）转化为针对交易机器人（由 DeepSeek-V3 驱动）的高质量系统提示词。

生成的提示词应包含：
1. 角色定义：专业的加密货币策略执行官。
2. 核心逻辑：明确入场点（如均线、深度、量价）、出场点、保本移动止损逻辑。
3. 决策约束：仅输出交易决策 JSON。
4. 风险控制：严格止损和条件失效。

请以对话形式引导用户完善策略。当逻辑清晰时，输出一个包含完整 Prompt 的代码块。`
    };

    return await callDeepSeek(apiKey, [metaPrompt, ...history]);
};

export const testConnection = async (apiKey: string): Promise<string> => {
  const res = await fetch(DEEPSEEK_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: "Respond with JSON: {'status': 'OK'}" }],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });
  const json = await res.json();
  return json.choices[0].message.content;
};

function analyze1HTrend(candles: CandleData[]) {
    if (candles.length < 100) return { direction: 'NEUTRAL', description: "数据不足" };
    const latest = candles[candles.length - 1] as any;
    if (!latest.ema15 || !latest.ema60) return { direction: 'NEUTRAL', description: "计算中" };
    const price = parseFloat(latest.c);
    if (price > latest.ema60 && latest.ema15 > latest.ema60) return { direction: 'UP', description: "1H 上涨趋势" };
    if (price < latest.ema60 && latest.ema15 < latest.ema60) return { direction: 'DOWN', description: "1H 下跌趋势" };
    return { direction: 'NEUTRAL', description: "1H 震荡" };
}

function analyze3mEntry(candles: CandleData[], trend: string, price: number, leverage: number) {
    const curr = candles[candles.length - 1] as any;
    if (!curr?.ema15) return { signal: false, action: 'HOLD', sl: 0, reason: "指标缺失" };
    
    const isGold = curr.ema15 > curr.ema60;
    const hardSL = trend === 'UP' ? price * (1 - 0.1/leverage) : price * (1 + 0.1/leverage);
    
    if (trend === 'UP' && isGold) {
        return { signal: true, action: 'BUY', sl: hardSL, reason: "3m 金叉确认" };
    }
    if (trend === 'DOWN' && !isGold) {
        return { signal: true, action: 'SELL', sl: hardSL, reason: "3m 死叉确认" };
    }
    return { signal: false, action: 'HOLD', sl: 0, reason: "等待交叉" };
}

export const analyzeCoin = async (
    coinKey: string,
    apiKey: string,
    marketData: SingleMarketData,
    accountData: AccountContext,
    strategy: StrategyProfile
): Promise<AIDecision> => {
    const currentPrice = parseFloat(marketData.ticker.last);
    const trend1H = analyze1HTrend(marketData.candles1H);
    const entry3m = analyze3mEntry(marketData.candles3m, trend1H.direction, currentPrice, parseFloat(strategy.leverage));
    
    const instId = marketData.ticker.instId;
    const pos = accountData.positions.find(p => p.instId === instId);
    const hasPosition = !!pos && parseFloat(pos.pos) > 0;
    
    const context = {
        strategy: strategy.name,
        coin: coinKey,
        price: currentPrice,
        fundingRate: marketData.fundingRate,
        openInterest: marketData.openInterest,
        topOrderbook: { asks: marketData.orderbook.asks.slice(0, 3), bids: marketData.orderbook.bids.slice(0, 3) },
        trend1H: trend1H.description,
        entrySignal: entry3m.reason,
        currentPosition: pos ? { side: pos.posSide, roi: pos.uplRatio } : "NONE"
    };

    let finalAction = "HOLD";
    let finalReason = entry3m.reason;
    let finalSL = entry3m.sl.toString();

    if (hasPosition) {
        const netRoi = parseFloat(pos!.uplRatio) - (TAKER_FEE_RATE * 2);
        if (netRoi >= strategy.beTriggerRoi) {
            finalAction = "UPDATE_TPSL";
            finalSL = pos!.avgPx; 
            finalReason = "利润达标，执行保本移动止损";
        }
        if ((pos!.posSide === 'long' && trend1H.direction === 'DOWN') || (pos!.posSide === 'short' && trend1H.direction === 'UP')) {
            finalAction = "CLOSE";
            finalReason = "1H 趋势反转，止盈/止损出场";
        }
    } else if (entry3m.signal) {
        finalAction = entry3m.action;
    }

    return {
        coin: coinKey,
        instId,
        stage_analysis: "策略驱动分析",
        market_assessment: `趋势: ${trend1H.description} | 资金: ${marketData.fundingRate}`,
        hot_events_overview: "持仓量: " + marketData.openInterest,
        coin_analysis: hasPosition ? `持仓中: ${pos!.posSide}` : "寻找机会",
        trading_decision: {
            action: finalAction as any,
            confidence: "80%",
            position_size: (strategy.initialRisk * 100).toFixed(0) + "%",
            leverage: strategy.leverage,
            profit_target: "0",
            stop_loss: finalSL,
            invalidation_condition: "趋势改变"
        },
        reasoning: finalReason,
        action: finalAction as any,
        size: "1", 
        leverage: strategy.leverage
    };
};

export const getTradingDecision = async (
    apiKey: string,
    marketData: MarketDataCollection,
    accountData: AccountContext,
    strategy: StrategyProfile
): Promise<AIDecision[]> => {
    const promises = Object.keys(marketData).map(coin => analyzeCoin(coin, apiKey, marketData[coin], accountData, strategy));
    return await Promise.all(promises);
};
