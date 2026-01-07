
import { AIDecision, MarketDataCollection, AccountContext, CandleData, SingleMarketData, StrategyProfile, ChatMessage } from "../types";
import { TAKER_FEE_RATE } from "../constants";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export const generateAssistantResponse = async (apiKey: string, history: ChatMessage[]): Promise<string> => {
    if (!apiKey) return "请先在设置中配置 DeepSeek API Key";
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
                    ...history
                ],
                stream: false
            })
        });
        const json = await response.json();
        return json.choices?.[0]?.message?.content || "AI 暂时无法回应";
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
    const hardSL = trend === 'UP' ? price * (1 - initialStopLossRoi/leverage) : price * (1 + initialStopLossRoi/leverage);
    
    if (trend === 'UP' && isGold) return { signal: true, action: 'BUY', sl: hardSL, reason: "3m 金叉共振入场" };
    if (trend === 'DOWN' && !isGold) return { signal: true, action: 'SELL', sl: hardSL, reason: "3m 死叉共振入场" };
    return { signal: false, action: 'HOLD', sl: 0, reason: "等待 3m 信号确认" };
}

export const analyzeCoin = async (
    apiKey: string,
    coinKey: string,
    marketData: SingleMarketData,
    accountData: AccountContext,
    strategy: StrategyProfile,
    isBacktest: boolean = false
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

    if (isBacktest || !apiKey) {
        return {
            coin: coinKey, instId,
            stage_analysis: `1H Trend: ${trend1H.direction}`,
            market_assessment: `Price: ${currentPrice}`,
            hot_events_overview: "Technical only",
            coin_analysis: hasPosition ? `ROI: ${pos!.uplRatio}` : "Scanning",
            trading_decision: {
                action: finalAction, confidence: "100%", position_size: "10%", leverage: strategy.leverage, profit_target: "0", stop_loss: finalSL, invalidation_condition: "Trend break"
            },
            reasoning: finalReason, action: finalAction, size: "1", leverage: strategy.leverage, timestamp: Date.now()
        };
    }

    try {
        const prompt = `分析 ${coinKey} (${instId}) 的交易机会。
当前价格: ${currentPrice}
1H 趋势: ${trend1H.direction}
3m 信号: ${entry3m.reason}
账户权益: ${accountData.balance.totalEq} USDT
当前持仓: ${hasPosition ? JSON.stringify(pos) : '无'}
规则建议: ${finalAction} (${finalReason})

请根据以上数据，严格按照 JSON 格式返回分析结果，必须包含：stage_analysis, market_assessment, hot_events_overview, coin_analysis, reasoning, action, size, leverage, 以及 trading_decision 对象。`;

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: strategy.systemPrompt },
                    { role: "user", content: prompt }
                ],
                response_format: { type: 'json_object' }
            })
        });

        const json = await response.json();
        const decisionText = json.choices?.[0]?.message?.content || "{}";
        const decision = JSON.parse(decisionText) as AIDecision;
        
        return {
            ...decision,
            coin: coinKey,
            instId,
            timestamp: Date.now()
        };
    } catch (e) {
        console.error("DeepSeek analysis failed, using fallback", e);
        return {
            coin: coinKey, instId,
            stage_analysis: `[Fallback] 1H Trend: ${trend1H.direction}`,
            market_assessment: `Price: ${currentPrice}`,
            hot_events_overview: "AI error",
            coin_analysis: hasPosition ? `ROI: ${pos!.uplRatio}` : "Technical",
            trading_decision: {
                action: finalAction, confidence: "N/A", position_size: "10%", leverage: strategy.leverage, profit_target: "0", stop_loss: finalSL, invalidation_condition: "Technical break"
            },
            reasoning: `Fallback: ${finalReason}`, action: finalAction, size: "1", leverage: strategy.leverage, timestamp: Date.now()
        };
    }
};

export const getTradingDecision = async (
    apiKey: string,
    marketData: MarketDataCollection,
    accountData: AccountContext,
    strategy: StrategyProfile
): Promise<AIDecision[]> => {
    const promises = Object.keys(marketData).map(coin => analyzeCoin(apiKey, coin, marketData[coin], accountData, strategy));
    return await Promise.all(promises);
};
