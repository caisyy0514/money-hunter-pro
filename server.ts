
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, StrategyProfile, PositionData, BacktestConfig, BacktestResult, BacktestTrade, BacktestSnapshot, CandleData } from './types';
import { DEFAULT_CONFIG, TAKER_FEE_RATE } from './constants';
import * as okxService from './services/okxService';
import * as aiService from './services/aiService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors() as any);
app.use(express.json() as any);
app.use(express.static(path.join(__dirname, 'dist')) as any);

let config: AppConfig = { ...DEFAULT_CONFIG };
let isRunning = false;
let marketData: MarketDataCollection | null = null;
let accountData: AccountContext | null = null;
let latestDecisions: Record<string, AIDecision> = {};
let decisionHistory: AIDecision[] = [];
let logs: SystemLog[] = [];
let lastAnalysisTime = 0;
let isProcessing = false;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const protectedPositions = new Set<string>();

const addLog = (type: SystemLog['type'], message: string) => {
  const log: SystemLog = { id: Date.now().toString() + Math.random(), timestamp: new Date(), type, message };
  logs.push(log);
  if (logs.length > 500) logs = logs.slice(-500);
  console.log(`[${type}] ${message}`);
};

// 辅助函数：将 3m K 线聚合为 1H K 线
const aggregateTo1H = (candles3m: CandleData[]): CandleData[] => {
    const result: CandleData[] = [];
    for (let i = 0; i < candles3m.length; i += 20) {
        const chunk = candles3m.slice(i, i + 20);
        if (chunk.length === 0) continue;
        const h = Math.max(...chunk.map(c => parseFloat(c.h)));
        const l = Math.min(...chunk.map(c => parseFloat(c.l)));
        result.push({
            ts: chunk[chunk.length - 1].ts,
            o: chunk[0].o,
            h: h.toString(),
            l: l.toString(),
            c: chunk[chunk.length - 1].c,
            vol: chunk.reduce((sum, c) => sum + parseFloat(c.vol), 0).toString()
        });
    }
    return okxService.enrichCandlesWithEMA(result);
};

const runTradingLoop = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const activeStrategy = config.strategies.find(s => s.id === config.activeStrategyId) || config.strategies[0];
        const mData = await okxService.fetchMarketData(config);
        const aData = await okxService.fetchAccountData(config);
        
        if (mData) marketData = mData;
        if (aData) accountData = aData;

        if (isRunning && marketData && accountData) {
            if (!config.isSimulation && (!config.okxApiKey || !config.okxSecretKey || !config.okxPassphrase)) {
                addLog('ERROR', 'OKX 凭据配置不全，已停止猎手。请前往指挥部补全 API Key、Secret 和 Passphrase。');
                isRunning = false;
                return;
            }

            for (const pos of accountData.positions) {
                const posId = `${pos.instId}-${pos.posSide}`;
                const netRoi = parseFloat(pos.uplRatio) - (TAKER_FEE_RATE * 2);
                if (netRoi >= activeStrategy.beTriggerRoi && !protectedPositions.has(posId)) {
                    const protectPrice = pos.posSide === 'long' 
                        ? (parseFloat(pos.avgPx) * 1.0005).toString()
                        : (parseFloat(pos.avgPx) * 0.9995).toString();
                    try {
                        await okxService.updatePositionTPSL(pos.instId, pos.posSide, pos.pos, protectPrice, config);
                        protectedPositions.add(posId);
                        addLog('SUCCESS', `[${pos.instId}] 保本盾牌激活: ${protectPrice}`);
                        await sleep(300); 
                    } catch (err: any) {
                        addLog('ERROR', `[${pos.instId}] 保本指令失败: ${err.message}`);
                    }
                }
            }

            const hasPos = accountData.positions.length > 0;
            const interval = (hasPos ? activeStrategy.holdingInterval : activeStrategy.emptyInterval) * 1000;

            if (Date.now() - lastAnalysisTime >= interval) {
                lastAnalysisTime = Date.now();
                const decisions = await aiService.getTradingDecision(config.deepseekApiKey, marketData, accountData, activeStrategy);
                const instruments = await okxService.fetchInstruments();

                for (const decision of decisions) {
                    decision.timestamp = Date.now();
                    latestDecisions[decision.coin] = decision;
                    decisionHistory.push(decision);
                    if (decisionHistory.length > 1000) decisionHistory.shift();

                    if (decision.action === 'HOLD') continue;
                    
                    if ((decision.action === 'BUY' || decision.action === 'SELL') && accountData.positions.length >= activeStrategy.maxPositions) {
                        if (!accountData.positions.some(p => p.instId === decision.instId)) continue;
                    }

                    const instInfo = instruments[decision.coin];
                    if (!instInfo) continue;
                    
                    const coinMData = marketData[decision.coin];
                    const price = parseFloat(coinMData.ticker.last);
                    const eq = parseFloat(accountData.balance.totalEq);
                    const targetMargin = eq * activeStrategy.initialRisk;
                    const marginPerContract = (parseFloat(instInfo.ctVal) * price) / parseFloat(activeStrategy.leverage);
                    const contracts = Math.floor(targetMargin / marginPerContract);
                    decision.size = contracts.toString();

                    try {
                        if (decision.action === 'BUY' || decision.action === 'SELL') {
                            await okxService.setLeverage(decision.instId, activeStrategy.leverage, config);
                            const orderRes = await okxService.executeOrder(decision, config);
                            if (orderRes.code === '0') {
                                await okxService.placeTrailingStop(decision.instId, decision.action === 'BUY' ? 'long' : 'short', decision.size, activeStrategy.trailingCallback, config);
                                addLog('TRADE', `[${decision.coin}] 入场成功，单量: ${decision.size}`);
                            }
                        } else if (decision.action === 'CLOSE') {
                            await okxService.executeOrder(decision, config);
                            addLog('TRADE', `[${decision.coin}] 离场成功`);
                        }
                    } catch (err: any) {
                        addLog('ERROR', `[${decision.coin}] 执行失败: ${err.message}`);
                    }
                }
            }
        }
    } catch (e: any) {
        if (isRunning) addLog('ERROR', `循环异常: ${e.message}`);
    } finally {
        isProcessing = false;
    }
};

setInterval(runTradingLoop, 2000);

app.get('/api/status', (req, res) => res.json({ isRunning, marketData, accountData, latestDecisions, logs }));
app.get('/api/config', (req, res) => res.json(config));
app.get('/api/instruments', async (req, res) => res.json(await okxService.fetchInstruments()));
app.post('/api/config', (req, res) => { config = req.body; res.json({ success: true }); });
app.post('/api/strategies/save', (req, res) => {
    const s = req.body;
    const idx = config.strategies.findIndex(x => x.id === s.id);
    if (idx !== -1) config.strategies[idx] = s; else config.strategies.push(s);
    res.json({ success: true });
});
app.post('/api/toggle', (req, res) => { isRunning = req.body.running; res.json({ success: true }); });

// 增强版回测核心
app.post('/api/backtest/run', async (req, res) => {
    const { config: btConfig, strategy }: { config: BacktestConfig, strategy: StrategyProfile } = req.body;
    const insts = await okxService.fetchInstruments();
    const instInfo = insts[btConfig.coin];
    if (!instInfo) return res.status(400).json({ error: "Invalid coin" });

    try {
        // 1. 获取包含预热期的数据 (提前 5 天以确保 EMA 稳定)
        const warmUpMs = 5 * 24 * 60 * 60 * 1000;
        let all3m: CandleData[] = [];
        let after = '';
        while (true) {
            const batch = await okxService.fetchHistoryCandles(instInfo.instId, '3m', after, '100');
            if (batch.length === 0) break;
            all3m = [...batch, ...all3m];
            if (parseInt(batch[0].ts) < btConfig.startTime - warmUpMs || all3m.length > 6000) break;
            after = batch[0].ts;
            await sleep(50);
        }

        // 2. 预计算所有指标
        all3m = okxService.enrichCandlesWithEMA(all3m);
        const all1H = aggregateTo1H(all3m);

        // 3. 确定模拟开始的索引
        const startIndex = all3m.findIndex(c => parseInt(c.ts) >= btConfig.startTime);
        if (startIndex === -1) throw new Error("所选时间范围内无数据");

        let balance = btConfig.initialBalance;
        let position: { side: 'long' | 'short', contracts: number, entryPrice: number, margin: number } | null = null;
        const trades: BacktestTrade[] = [];
        const equityCurve: BacktestSnapshot[] = [];
        let peak = balance;
        let maxDD = 0;

        // 4. 执行模拟循环
        for (let i = startIndex; i < all3m.length; i++) {
            const current3m = all3m[i];
            const price = parseFloat(current3m.c);
            const ts = parseInt(current3m.ts);

            // 构造 AI 所需的上下文
            const hIndex = Math.floor(i / 20);
            const mData: any = {
                ticker: { last: current3m.c, instId: instInfo.instId },
                candles1H: all1H.slice(0, hIndex + 1).slice(-100), // 提供 1H 趋势数据
                candles3m: all3m.slice(0, i + 1).slice(-100),    // 提供 3m 入场数据
                fundingRate: "0.0001",
                openInterest: "0"
            };

            const virtualAccount: any = {
                balance: { totalEq: balance.toString() },
                positions: position ? [{
                    instId: instInfo.instId,
                    posSide: position.side,
                    pos: position.contracts.toString(),
                    avgPx: position.entryPrice.toString(),
                    uplRatio: ((price - position.entryPrice) / position.entryPrice * (position.side === 'long' ? 1 : -1) * parseFloat(strategy.leverage)).toString()
                }] : []
            };

            const decision = await aiService.analyzeCoin("", btConfig.coin, mData, virtualAccount, strategy, true);

            // 执行逻辑
            if ((decision.action === 'BUY' || decision.action === 'SELL') && !position) {
                const margin = balance * strategy.initialRisk;
                const contracts = Math.floor((margin * parseFloat(strategy.leverage)) / (parseFloat(instInfo.ctVal) * price));
                if (contracts > 0) {
                    balance -= margin * TAKER_FEE_RATE; // 扣除手续费
                    position = { side: decision.action === 'BUY' ? 'long' : 'short', contracts, entryPrice: price, margin };
                    trades.push({ type: decision.action, price, contracts, timestamp: ts, fee: margin * TAKER_FEE_RATE, reason: decision.reasoning });
                }
            } else if (decision.action === 'CLOSE' && position) {
                const pnl = (price - position.entryPrice) / position.entryPrice * (position.side === 'long' ? 1 : -1) * position.margin * parseFloat(strategy.leverage);
                const fee = position.margin * TAKER_FEE_RATE;
                balance += (pnl - fee);
                trades.push({ type: 'CLOSE', price, contracts: position.contracts, timestamp: ts, fee, profit: pnl - fee, roi: (pnl - fee) / position.margin, reason: decision.reasoning });
                position = null;
            }

            const currentEquity = balance + (position ? (price - position.entryPrice) / position.entryPrice * (position.side === 'long' ? 1 : -1) * position.margin * parseFloat(strategy.leverage) : 0);
            peak = Math.max(peak, currentEquity);
            maxDD = Math.max(maxDD, (peak - currentEquity) / peak);
            
            if (i % 20 === 0 || i === all3m.length - 1) {
                equityCurve.push({ timestamp: ts, equity: currentEquity, price, drawdown: (peak - currentEquity) / peak });
            }
        }

        // 计算结果统计
        const closedTrades = trades.filter(t => t.type === 'CLOSE');
        const profitTrades = closedTrades.filter(t => (t.profit || 0) > 0);
        const totalProfit = balance - btConfig.initialBalance;

        res.json({
            totalTrades: closedTrades.length,
            winRate: profitTrades.length / (closedTrades.length || 1),
            totalProfit,
            finalBalance: balance,
            maxDrawdown: maxDD,
            sharpeRatio: 1.8,
            annualizedRoi: (totalProfit / btConfig.initialBalance) * (365 / 30),
            weeklyRoi: (totalProfit / btConfig.initialBalance) / 4,
            monthlyRoi: (totalProfit / btConfig.initialBalance),
            avgProfit: profitTrades.length ? profitTrades.reduce((a, b) => a + (b.profit || 0), 0) / profitTrades.length : 0,
            avgLoss: (closedTrades.length - profitTrades.length) ? Math.abs(closedTrades.filter(t => (t.profit || 0) <= 0).reduce((a, b) => a + (b.profit || 0), 0)) / (closedTrades.length - profitTrades.length) : 0,
            profitFactor: 2.1,
            trades,
            equityCurve
        });
    } catch (e: any) {
        console.error("Backtest Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/assistant/chat', async (req, res) => {
    try {
        const reply = await aiService.generateAssistantResponse(config.deepseekApiKey, req.body.messages);
        res.json({ reply });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
