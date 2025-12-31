
import { AIDecision, MarketDataCollection, AccountContext, CandleData, SingleMarketData, StrategyProfile, ChatMessage } from "../types";
import { TAKER_FEE_RATE } from "../constants";
import { GoogleGenAI } from "@google/genai";

// Initialize the Google GenAI client with the mandatory process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAssistantResponse = async (apiKey: string, history: ChatMessage[]): Promise<string> => {
    // Note: The apiKey parameter is kept for signature compatibility but we use the mandatory environment variable.
    const systemInstruction = `你是一个顶级的加密货币量化策略工程师。
你的任务是将用户的需求转化为：
1. 核心交易逻辑（针对决策引擎的提示词）。
2. 选币建议（基于市场特征推荐适合的币种）。

生成的提示词必须包含严格的 JSON 输出约束、移动止损逻辑。
如果用户提到选币，请分析市场环境并建议币种清单。`;

    const contents = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents,
            config: {
                systemInstruction,
                temperature: 0.7,
            },
        });
        return response.text || "未能生成有效响应";
    } catch (e: any) {
        throw new Error(e.message || "Gemini 请求失败");
    }
};

export const getAIPreferredCoins = async (apiKey: string, marketSummary: any, strategy: StrategyProfile): Promise<string[]> => {
    // Note: The apiKey parameter is kept for signature compatibility but we use the mandatory environment variable.
    // Fix: Access strategy.aiSelectionCriteria safely after adding it to the interface
    const prompt = `基于以下市场概况和策略，从全量币种中挑选出最适合交易的 5-10 个币种：
    策略意图: ${strategy.systemPrompt}
    AI 选币标准: ${strategy.aiSelectionCriteria || "默认高波动、高成交量"}
    市场简报: ${JSON.stringify(marketSummary)}
    
    仅输出以逗号分隔的币种代码（如: BTC,ETH,SOL）。`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.1,
            },
        });
        const reply = response.text || "";
        return reply.split(',').map((s: string) => s.trim().toUpperCase());
    } catch (e: any) {
        console.error("Gemini preferred coins selection failed", e);
        return [];
    }
};

function analyze1HTrend(candles: CandleData[]) {
    if (candles.length < 50) return { direction: 'NEUTRAL', description: "数据不足" };
    const latest = candles[candles.length - 1];
    if (!latest.ema15 || !latest.ema60) return { direction: 'NEUTRAL', description: "计算中" };
    const price = parseFloat(latest.c);
    if (price > latest.ema60 && latest.ema15 > latest.ema60) return { direction: 'UP', description: "1H 上涨趋势" };
    if (price < latest.ema60 && latest.ema15 < latest.ema60) return { direction: 'DOWN', description: "1H 下跌趋势" };
    return { direction: 'NEUTRAL', description: "1H 震荡" };
}

function analyze3mEntry(candles: CandleData[], trend: string, price: number, leverage: number) {
    if (candles.length === 0) return { signal: false, action: 'HOLD', sl: 0, reason: "无数据" };
    const curr = candles[candles.length - 1];
    if (!curr?.ema15) return { signal: false, action: 'HOLD', sl: 0, reason: "指标缺失" };
    const isGold = curr.ema15 > curr.ema60;
    const hardSL = trend === 'UP' ? price * (1 - 0.1/leverage) : price * (1 + 0.1/leverage);
    if (trend === 'UP' && isGold) return { signal: true, action: 'BUY', sl: hardSL, reason: "3m 金叉确认" };
    if (trend === 'DOWN' && !isGold) return { signal: true, action: 'SELL', sl: hardSL, reason: "3m 死叉确认" };
    return { signal: false, action: 'HOLD', sl: 0, reason: "等待信号" };
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
    const hasPosition = !!pos && parseFloat(pos.pos) !== 0;

    let finalAction = "HOLD";
    let finalReason = entry3m.reason;
    let finalSL = entry3m.sl.toString();

    if (hasPosition) {
        const netRoi = parseFloat(pos!.uplRatio) - (TAKER_FEE_RATE * 2);
        if (netRoi >= strategy.beTriggerRoi) {
            finalAction = "UPDATE_TPSL";
            finalSL = pos!.avgPx;
            finalReason = "触发保本移动止损";
        }
        if ((pos!.posSide === 'long' && trend1H.direction === 'DOWN') || (pos!.posSide === 'short' && trend1H.direction === 'UP')) {
            finalAction = "CLOSE";
            finalReason = "1H 趋势反向";
        }
    } else if (entry3m.signal) {
        finalAction = entry3m.action;
    }

    return {
        coin: coinKey,
        instId,
        stage_analysis: "技术指标综合分析",
        market_assessment: `1H: ${trend1H.description} | 资金: ${marketData.fundingRate}`,
        hot_events_overview: `持仓: ${marketData.openInterest}`,
        coin_analysis: hasPosition ? `持仓 ROI: ${pos!.uplRatio}` : "等待入场",
        trading_decision: {
            action: finalAction as any,
            confidence: "85%",
            position_size: `${strategy.initialRisk * 100}%`,
            leverage: strategy.leverage,
            profit_target: "0",
            stop_loss: finalSL,
            invalidation_condition: "趋势改变"
        },
        reasoning: finalReason,
        action: finalAction as any,
        size: "1", leverage: strategy.leverage
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
