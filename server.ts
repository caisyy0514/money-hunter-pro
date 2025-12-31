
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, StrategyProfile, PositionData } from './types';
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

const protectedPositions = new Set<string>();

const addLog = (type: SystemLog['type'], message: string) => {
  const log: SystemLog = { id: Date.now().toString() + Math.random(), timestamp: new Date(), type, message };
  logs.push(log);
  if (logs.length > 500) logs = logs.slice(-500);
  console.log(`[${type}] ${message}`);
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
            // 实盘运行前的完整凭据检查
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
                    } catch (err: any) {
                        addLog('ERROR', `[${pos.instId}] 保本指令失败: ${err.message}`);
                    }
                }
            }

            const hasPos = accountData.positions.length > 0;
            const interval = (hasPos ? activeStrategy.holdingInterval : activeStrategy.emptyInterval) * 1000;

            if (Date.now() - lastAnalysisTime >= interval) {
                lastAnalysisTime = Date.now();
                
                if (!config.deepseekApiKey && !config.isSimulation) {
                    addLog('ERROR', '未配置 DeepSeek API Key，无法进行 AI 决策');
                    return;
                }

                addLog('INFO', `>>> 扫描中 (${accountData.positions.length}/${activeStrategy.maxPositions}) <<<`);
                
                const decisions = await aiService.getTradingDecision(config.deepseekApiKey, marketData, accountData, activeStrategy);
                const instruments = await okxService.fetchInstruments();

                for (const decision of decisions) {
                    decision.timestamp = Date.now();
                    latestDecisions[decision.coin] = decision;
                    decisionHistory.push(decision);
                    if (decisionHistory.length > 1000) decisionHistory.shift();

                    if (decision.action === 'HOLD') continue;
                    
                    if ((decision.action === 'BUY' || decision.action === 'SELL') && accountData.positions.length >= activeStrategy.maxPositions) {
                        const isExisting = accountData.positions.some(p => p.instId === decision.instId);
                        if (!isExisting) {
                             addLog('WARNING', `[${decision.coin}] 拦截：槽位已满 (${activeStrategy.maxPositions})`);
                             continue;
                        }
                    }

                    const instInfo = instruments[decision.coin];
                    if (!instInfo) continue;
                    
                    const coinMData = marketData[decision.coin];
                    const price = parseFloat(coinMData.ticker.last);
                    const eq = parseFloat(accountData.balance.totalEq);
                    // 单次入场比例计算保证金
                    const targetMargin = eq * activeStrategy.initialRisk;
                    const marginPerContract = (parseFloat(instInfo.ctVal) * price) / parseFloat(activeStrategy.leverage);
                    const contracts = Math.floor(targetMargin / marginPerContract);
                    decision.size = contracts.toString();

                    try {
                        if (decision.action === 'BUY' || decision.action === 'SELL') {
                            const orderRes = await okxService.executeOrder(decision, config);
                            if (orderRes.code === '0') {
                                await okxService.placeTrailingStop(
                                    decision.instId, 
                                    decision.action === 'BUY' ? 'long' : 'short',
                                    decision.size,
                                    activeStrategy.trailingCallback,
                                    config
                                );
                                addLog('TRADE', `[${decision.coin}] 入场成功，单量: ${decision.size}，已挂载移动止损`);
                            } else {
                                throw new Error(orderRes.msg || 'API ERROR');
                            }
                        } else if (decision.action === 'CLOSE') {
                            await okxService.executeOrder(decision, config);
                            addLog('TRADE', `[${decision.coin}] AI 离场指令已执行`);
                        }
                    } catch (err: any) {
                        addLog('ERROR', `[${decision.coin}] 执行异常: ${err.message}`);
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

app.get('/api/status', (req, res) => {
    res.json({ isRunning, marketData, accountData, latestDecisions, logs });
});

app.get('/api/history', (req, res) => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    res.json({
        recent: decisionHistory.filter(d => (d.timestamp || 0) > oneHourAgo),
        actions: decisionHistory.filter(d => d.action !== 'HOLD')
    });
});

app.get('/api/config', (req, res) => {
    res.json({ ...config, okxSecretKey: config.okxSecretKey ? '***' : '', okxPassphrase: config.okxPassphrase ? '***' : '', deepseekApiKey: config.deepseekApiKey ? '***' : '' });
});

app.get('/api/instruments', async (req, res) => {
    const insts = await okxService.fetchInstruments();
    res.json(insts);
});

app.post('/api/config', (req, res) => {
    const newConfig = { ...req.body };
    if (newConfig.okxSecretKey === '***') newConfig.okxSecretKey = config.okxSecretKey;
    if (newConfig.okxPassphrase === '***') newConfig.okxPassphrase = config.okxPassphrase;
    if (newConfig.deepseekApiKey === '***') newConfig.deepseekApiKey = config.deepseekApiKey;
    config = newConfig;
    protectedPositions.clear();
    addLog('INFO', '配置已更新');
    res.json({ success: true });
});

app.post('/api/toggle', (req, res) => {
    isRunning = req.body.running;
    if (!isRunning) protectedPositions.clear();
    addLog('INFO', isRunning ? '猎手已上线' : '猎手已休息');
    res.json({ success: true });
});

app.post('/api/assistant/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        const reply = await aiService.generateAssistantResponse(config.deepseekApiKey, messages);
        res.json({ reply });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
