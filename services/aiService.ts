
import { GoogleGenAI, Type } from "@google/genai";
import { AIDecision, MarketDataCollection, AccountContext, CandleData, SingleMarketData, StrategyProfile, ChatMessage } from "../types";
import { TAKER_FEE_RATE } from "../constants";

// Fix: Always use process.env.API_KEY for initializing GoogleGenAI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// AI Decision Schema definition for structured output
const aiDecisionSchema = {
    type: Type.OBJECT,
    properties: {
        stage_analysis: { type: Type.STRING },
        market_assessment: { type: Type.STRING },
        hot_events_overview: { type: Type.STRING },
        coin_analysis: { type: Type.STRING },
        trading_decision: {
            type: Type.OBJECT,
            properties: {
                action: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD', 'UPDATE_TPSL', 'CLOSE'] },
                confidence: { type: Type.STRING },
                position_size: { type: Type.STRING },
                leverage: { type: Type.STRING },
                profit_target: { type: Type.STRING },
                stop_loss: { type: Type.STRING },
                invalidation_condition: { type: Type.STRING }
            },
            required: ['action', 'confidence', 'position_size', 'leverage', 'profit_target', 'stop_loss', 'invalidation_condition']
        },
        reasoning: { type: Type.STRING },
        action: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD', 'UPDATE_TPSL', 'CLOSE'] },
        size: { type: Type.STRING },
        leverage: { type: Type.STRING }
    },
    required: ['stage_analysis', 'market_assessment', 'hot_events_overview', 'coin_analysis', 'trading_decision', 'reasoning', 'action', 'size', 'leverage']
};

export const generateAssistantResponse = async (history: ChatMessage[]): Promise<string> => {
    try {
        // Fix: Use gemini-3-flash-preview for general chat tasks
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: history.map(m => ({
                role: m.role === 'assistant' ? 'model' : m.role,
                parts: [{ text: m.content }]
            })),
            config: {
                systemInstruction: "你是一个顶级的加密货币量化策略工程师。提供专业、简洁的战术建议。"
            }
        });
        return response.text || "AI 暂时无法回应";
    } catch (e: any) {
        throw new Error(`Gemini Error: ${e.message}`);
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

    // Base technical recommendation
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

    // Optimization: Skip AI calls during backtests to speed up performance
    if (isBacktest) {
        return {
            coin: coinKey, instId,
            stage_analysis: `[Backtest] 1H Trend: ${trend1H.direction}`,
            market_assessment: `Current Price: ${currentPrice}`,
            hot_events_overview: "Backtest mode",
            coin_analysis: hasPosition ? `Current ROI: ${pos!.uplRatio}` : "Technical scan",
            trading_decision: {
                action: finalAction, confidence: "100%", position_size: "10%", leverage: strategy.leverage, profit_target: "0", stop_loss: finalSL, invalidation_condition: "Trend change"
            },
            reasoning: finalReason, action: finalAction, size: "1", leverage: strategy.leverage, timestamp: Date.now()
        };
    }

    try {
        // Fix: Use gemini-3-pro-preview for complex reasoning tasks
        const prompt = `Perform a comprehensive trading analysis for ${coinKey} (${instId}).
Current Ticker: ${JSON.stringify(marketData.ticker)}
1H Trend: ${trend1H.direction}
3m Entry Logic: ${entry3m.reason}
Account Balance: ${accountData.balance.totalEq} USDT
Active Position: ${hasPosition ? JSON.stringify(pos) : 'None'}
Rule-based recommendation: ${finalAction} (${finalReason})`;

        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: prompt,
            config: {
                systemInstruction: strategy.systemPrompt,
                responseMimeType: "application/json",
                responseSchema: aiDecisionSchema
            }
        });

        const decision = JSON.parse(response.text || "{}") as AIDecision;
        return {
            ...decision,
            coin: coinKey,
            instId,
            timestamp: Date.now()
        };
    } catch (e) {
        console.error("Gemini analysis failed, falling back to technical rules", e);
        return {
            coin: coinKey, instId,
            stage_analysis: `[Fallback] 1H Trend: ${trend1H.direction}`,
            market_assessment: `Price: ${currentPrice}`,
            hot_events_overview: "AI service unavailable",
            coin_analysis: hasPosition ? `ROI: ${pos!.uplRatio}` : "Rule-based scan",
            trading_decision: {
                action: finalAction, confidence: "N/A", position_size: "10%", leverage: strategy.leverage, profit_target: "0", stop_loss: finalSL, invalidation_condition: "Technical breakout"
            },
            reasoning: `Service Fallback: ${finalReason}`, action: finalAction, size: "1", leverage: strategy.leverage, timestamp: Date.now()
        };
    }
};

export const getTradingDecision = async (
    marketData: MarketDataCollection,
    accountData: AccountContext,
    strategy: StrategyProfile
): Promise<AIDecision[]> => {
    const promises = Object.keys(marketData).map(coin => analyzeCoin(coin, marketData[coin], accountData, strategy));
    return await Promise.all(promises);
};
