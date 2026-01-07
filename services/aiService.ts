
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

function analyze1HTrend(candles1H: CandleData[], candles3m: CandleData[]) {
    // 优先使用 1H K 线判定大趋势
    if (candles1H && candles1H.length >= 2) {
        const latest = candles1H[candles1H.length - 1];
        if (latest.ema15 !== undefined && latest.ema60 !== undefined) {
            const price = parseFloat(latest.c);
            // 只要价格在 EMA60 之上且 EMA15 尚未跌破，维持看多趋势
            if (price > latest.ema60 && latest.ema15 > latest.ema60 * 0.999) return { direction: 'UP', description: "1H 趋势偏强" };
            if (price < latest.ema60 && latest.ema15 < latest.ema60 * 1.001) return { direction: 'DOWN', description: "1H 趋势偏弱" };
        }
    }
    
    // 兜底方案：使用 3m 数据的长周期均线作为代理趋势
    if (candles3m && candles3m.length >= 60) {
        const last3m = candles3m[candles3m.length - 1];
        if (last3m.ema60 !== undefined) {
            const p = parseFloat(last3m.c);
            if (p > last3m.ema60) return { direction: 'UP', description: "3m 短期强势" };
            if (p < last3m.ema60) return { direction: 'DOWN', description: "3m 短期弱势" };
        }
    }

    return { direction: 'NEUTRAL', description: "趋势整理中" };
}

function analyze3mEntry(candles: CandleData[], trend: string, price: number, leverage: number, initialStopLossRoi: number) {
    if (candles.length < 2) return { signal: false, action: 'HOLD', sl: 0, reason: "等待 K 线" };
    const curr = candles[candles.length - 1];
    if (curr.ema15 === undefined || curr.ema60 === undefined) return { signal: false, action: 'HOLD', sl: 0, reason: "指标计算中" };
    
    const isGold = curr.ema15 > curr.ema60;
    // 动态止损计算
    const hardSL = trend === 'UP' ? price * (1 - initialStopLossRoi/leverage) : price * (1 + initialStopLossRoi/leverage);
    
    if (trend === 'UP' && isGold) return { signal: true, action: 'BUY', sl: hardSL, reason: "共振多：3m 多头排列" };
    if (trend === 'DOWN' && !isGold) return { signal: true, action: 'SELL', sl: hardSL, reason: "共振空：3m 空头排列" };
    
    return { signal: false, action: 'HOLD', sl: 0, reason: "等待 3m 信号共振" };
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
    const trend1H = analyze1HTrend(marketData.candles1H, marketData.candles3m);
    const entry3m = analyze3mEntry(marketData.candles3m, trend1H.direction, currentPrice, parseFloat(strategy.leverage), strategy.initialStopLossRoi);
    const instId = marketData.ticker.instId;
    const pos = accountData.positions.find(p => p.instId === instId);
    const hasPosition = !!pos && parseFloat(pos.pos) !== 0;

    let finalAction: 'BUY' | 'SELL' | 'HOLD' | 'UPDATE_TPSL' | 'CLOSE' = "HOLD";
    let finalReason = entry3m.reason;
    let finalSL = entry3m.sl.toString();

    if (hasPosition) {
        // 持仓中：检查趋势反转
        if ((pos!.posSide === 'long' && trend1H.direction === 'DOWN') || (pos!.posSide === 'short' && trend1H.direction === 'UP')) {
            finalAction = "CLOSE";
            finalReason = "反向趋势确认：立即锁定收益/止损";
        } else {
            finalAction = "HOLD";
            finalReason = "持仓状态稳定";
        }
    } else if (entry3m.signal) {
        finalAction = entry3m.action as any;
    }

    if (isBacktest || !apiKey) {
        return {
            coin: coinKey, instId,
            stage_analysis: `Trend: ${trend1H.direction} (${trend1H.description})`,
            market_assessment: `Price: ${currentPrice}`,
            hot_events_overview: isBacktest ? "回测模式：忽略实时新闻" : "API 未连接",
            coin_analysis: hasPosition ? `持仓 ROI: ${pos!.uplRatio}` : "扫描入场机会",
            trading_decision: {
                action: finalAction, confidence: "100%", position_size: "10%", leverage: strategy.leverage, profit_target: "0", stop_loss: finalSL, invalidation_condition: "趋势走弱"
            },
            reasoning: finalReason, action: finalAction, size: "1", leverage: strategy.leverage, timestamp: Date.now()
        };
    }

    try {
        const prompt = `分析 ${coinKey} (${instId})。
当前价: ${currentPrice} | 1H趋势: ${trend1H.direction} | 3m信号: ${entry3m.reason}
总权益: ${accountData.balance.totalEq} | 当前持仓: ${hasPosition ? JSON.stringify(pos) : '空仓'}
底层系统推荐: ${finalAction} (${finalReason})`;

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: strategy.systemPrompt }, { role: "user", content: prompt }],
                response_format: { type: 'json_object' }
            })
        });

        const json = await response.json();
        const decision = JSON.parse(json.choices?.[0]?.message?.content || "{}") as AIDecision;
        return { ...decision, coin: coinKey, instId, timestamp: Date.now() };
    } catch (e) {
        return {
            coin: coinKey, instId, reasoning: `AI 离线，切换至技术分析: ${finalReason}`, action: finalAction, size: "1", leverage: strategy.leverage, timestamp: Date.now(),
            stage_analysis: "技术指标模式", market_assessment: "AI 暂时无法连接", hot_events_overview: "N/A", coin_analysis: "N/A",
            trading_decision: { action: finalAction, confidence: "N/A", position_size: "N/A", leverage: strategy.leverage, profit_target: "N/A", stop_loss: finalSL, invalidation_condition: "技术趋势破位" }
        };
    }
};

export const getTradingDecision = async (apiKey: string, marketData: MarketDataCollection, accountData: AccountContext, strategy: StrategyProfile): Promise<AIDecision[]> => {
    const promises = Object.keys(marketData).map(coin => analyzeCoin(apiKey, coin, marketData[coin], accountData, strategy));
    return await Promise.all(promises);
};
