
import { AIDecision, MarketDataCollection, AccountContext, CandleData, SingleMarketData, StrategyProfile, ChatMessage } from "../types";
import { TAKER_FEE_RATE } from "../constants";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export const generateAssistantResponse = async (apiKey: string, history: ChatMessage[]): Promise<string> => {
    if (!apiKey) throw new Error("Missing DeepSeek API Key");
    
    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "你是一个顶级的加密货币量化策略工程师。提供专业、简洁的战术建议。" },
                    ...history.map(m => ({ role: m.role, content: m.content }))
                ]
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "AI 暂时无法回应";
    } catch (e: any) {
        throw new Error(`DeepSeek Error: ${e.message}`);
    }
};

function analyze1HTrend(candles: CandleData[]) {
    if (candles.length < 60) return { direction: 'NEUTRAL', description: "数据不足" };
    const latest = candles[candles.length - 1];
    if (!latest.ema15 || !latest.ema60) return { direction: 'NEUTRAL', description: "指标计算中" };
    const price = parseFloat(latest.c);
    if (price > latest.ema60 && latest.ema15 > latest.ema60) return { direction: 'UP', description: "1H 上涨趋势" };
    if (price < latest.ema60 && latest.ema15 < latest.ema60) return { direction: 'DOWN', description: "1H 下跌趋势" };
    return { direction: 'NEUTRAL', description: "1H 震荡" };
}

function analyze3mEntry(candles: CandleData[], trend: string, price: number, leverage: number, initialStopLossRoi: number) {
    if (candles.length === 0) return { signal: false, action: 'HOLD', sl: 0, reason: "等待 K 线" };
    const curr = candles[candles.length - 1];
    if (!curr?.ema15) return { signal: false, action: 'HOLD', sl: 0, reason: "指标计算中" };
    
    const isGold = curr.ema15 > curr.ema60;
    // 使用配置的初始止损收益率计算硬止损位
    const hardSL = trend === 'UP' ? price * (1 - initialStopLossRoi/leverage) : price * (1 + initialStopLossRoi/leverage);
    
    if (trend === 'UP' && isGold) return { signal: true, action: 'BUY', sl: hardSL, reason: "3m 金叉共振入场" };
    if (trend === 'DOWN' && !isGold) return { signal: true, action: 'SELL', sl: hardSL, reason: "3m 死叉共振入场" };
    return { signal: false, action: 'HOLD', sl: 0, reason: "等待 3m 信号确认" };
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
    const entry3m = analyze3mEntry(marketData.candles3m, trend1H.direction, currentPrice, parseFloat(strategy.leverage), strategy.initialStopLossRoi);
    const instId = marketData.ticker.instId;
    const pos = accountData.positions.find(p => p.instId === instId);
    const hasPosition = !!pos && parseFloat(pos.pos) !== 0;

    let finalAction: 'BUY' | 'SELL' | 'HOLD' | 'UPDATE_TPSL' | 'CLOSE' = "HOLD";
    let finalReason = entry3m.reason;
    let finalSL = entry3m.sl.toString();

    if (hasPosition) {
        const netRoi = parseFloat(pos!.uplRatio) - (TAKER_FEE_RATE * 2);
        if ((pos!.posSide === 'long' && trend1H.direction === 'DOWN') || (pos!.posSide === 'short' && trend1H.direction === 'UP')) {
            finalAction = "CLOSE";
            finalReason = "1H 趋势反转离场";
        } else if (netRoi >= strategy.beTriggerRoi) {
            finalAction = "HOLD"; 
            finalReason = "持仓中，风控盾牌已启动";
        } else {
            finalAction = "HOLD";
            finalReason = "继续持有，等待目标";
        }
    } else if (entry3m.signal) {
        finalAction = entry3m.action as any;
    }

    return {
        coin: coinKey,
        instId,
        stage_analysis: `1H 趋势: ${trend1H.direction}`,
        market_assessment: `价格: ${currentPrice} | 资金费: ${marketData.fundingRate}`,
        hot_events_overview: `持仓量: ${marketData.openInterest}`,
        coin_analysis: hasPosition ? `当前 ROI: ${pos!.uplRatio}` : "扫描入场机会",
        trading_decision: {
            action: finalAction,
            confidence: "80%",
            position_size: `${strategy.initialRisk * 100}%`,
            leverage: strategy.leverage,
            profit_target: "0",
            stop_loss: finalSL,
            invalidation_condition: "趋势改变"
        },
        reasoning: finalReason,
        action: finalAction,
        size: "1", leverage: strategy.leverage,
        timestamp: Date.now()
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
