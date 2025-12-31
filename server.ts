
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
let logs: SystemLog[] = [];
let lastAnalysisTime = 0;
let isProcessing = false;

// 记录受保护的仓位，防止重复调用保本指令
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
        
        // 1. 获取基础行情与账户
        const mData = await okxService.fetchMarketData(config);
        const aData = await okxService.fetchAccountData(config);
        
        if (mData) marketData = mData;
        if (aData) accountData = aData;

        if (isRunning && marketData && accountData) {
            // 2. 动态风控巡检：保本移动止损
            for (const pos of accountData.positions) {
                const posId = `${pos.instId}-${pos.posSide}`;
                const netRoi = parseFloat(pos.uplRatio) - (TAKER_FEE_RATE * 2);
                
                if (netRoi >= activeStrategy.beTriggerRoi && !protectedPositions.has(posId)) {
                    addLog('INFO', `[${pos.instId}] 利润归正 (${(netRoi*100).toFixed(2)}%)，正在部署保本防御...`);
                    // 保本价设在开仓均价并预留 0.05% 滑点空间
                    const protectPrice = pos.posSide === 'long' 
                        ? (parseFloat(pos.avgPx) * 1.0005).toString()
                        : (parseFloat(pos.avgPx) * 0.9995).toString();
                    
                    try {
                        await okxService.updatePositionTPSL(pos.instId, pos.posSide, pos.pos, protectPrice, config);
                        protectedPositions.add(posId);
                        addLog('SUCCESS', `[${pos.instId}] 盾牌激活 🛡️ 止损已移至开仓位: ${protectPrice}`);
                    } catch (err: any) {
                        addLog('ERROR', `[${pos.instId}] 保本指令失败: ${err.message}`);
                    }
                }
            }

            // 3. 策略周期分析
            const hasPos = accountData.positions.length > 0;
            const interval = (hasPos ? activeStrategy.holdingInterval : activeStrategy.emptyInterval) * 1000;

            if (Date.now() - lastAnalysisTime >= interval) {
                lastAnalysisTime = Date.now();
                
                // Using mandatory environment variable for Gemini API
                if (!process.env.API_KEY) {
                    addLog('ERROR', '未配置 GenAI API_KEY 环境变量，引擎挂起');
                    isRunning = false;
                    return;
                }

                addLog('INFO', `>>> 扫描模式: ${activeStrategy.coinSelectionMode === 'new-coin' ? '新币猎手' : '手动'} (槽位: ${accountData.positions.length}/${activeStrategy.maxPositions}) <<<`);
                
                const decisions = await aiService.getTradingDecision('', marketData, accountData, activeStrategy);
                const instruments = await okxService.fetchInstruments();

                for (const decision of decisions) {
                    latestDecisions[decision.coin] = decision;
                    if (decision.action === 'HOLD') continue;
                    
                    // 槽位管理：仅限开仓指令 (BUY/SELL)
                    if ((decision.action === 'BUY' || decision.action === 'SELL') && accountData.positions.length >= activeStrategy.maxPositions) {
                        const isExisting = accountData.positions.some(p => p.instId === decision.instId);
                        if (!isExisting) {
                             addLog('WARNING', `[${decision.coin}] 拦截：已达持仓上限 (${activeStrategy.maxPositions} 仓)，跳过新币入场`);
                             continue;
                        }
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
                        addLog('TRADE', `[${decision.coin}] 决策执行: ${decision.action} | 理由: ${decision.reasoning}`);
                        
                        if (decision.action === 'BUY' || decision.action === 'SELL') {
                            // 1. 市价单成交
                            const orderRes = await okxService.executeOrder(decision, config);
                            if (orderRes.code === '0') {
                                // 2. 同步挂载移动止损 (0.5% 回调)
                                await okxService.placeTrailingStop(
                                    decision.instId, 
                                    decision.action === 'BUY' ? 'long' : 'short',
                                    decision.size,
                                    activeStrategy.trailingCallback,
                                    config
                                );
                                addLog('SUCCESS', `[${decision.coin}] 入场成功，已同步挂载移动止盈 (${(activeStrategy.trailingCallback*100).toFixed(1)}%)`);
                            } else {
                                throw new Error(orderRes.msg || 'API ERROR');
                            }
                        } else if (decision.action === 'UPDATE_TPSL') {
                            await okxService.updatePositionTPSL(decision.instId, 'long', decision.size, decision.trading_decision.stop_loss, config);
                        } else {
                            await okxService.executeOrder(decision, config);
                        }
                    } catch (err: any) {
                        addLog('ERROR', `[${decision.coin}] 执行异常: ${err.message}`);
                    }
                }
            }
        }
    } catch (e: any) {
        if (isRunning) addLog('ERROR', `主引擎循环崩溃: ${e.message}`);
    } finally {
        isProcessing = false;
    }
};

setInterval(runTradingLoop, 2000);

app.get('/api/status', (req, res) => {
    res.json({ isRunning, marketData, accountData, latestDecisions, logs });
});

app.get('/api/config', (req, res) => {
    // Masking sensitive data but removing the specific deepseek field usage
    res.json({ 
        ...config, 
        okxSecretKey: config.okxSecretKey ? '***' : '', 
        okxPassphrase: config.okxPassphrase ? '***' : '',
        deepseekApiKey: 'N/A' 
    });
});

app.get('/api/instruments', async (req, res) => {
    const insts = await okxService.fetchInstruments();
    res.json(insts);
});

app.post('/api/config', (req, res) => {
    const newConfig = { ...req.body };
    if (newConfig.okxSecretKey === '***') newConfig.okxSecretKey = config.okxSecretKey;
    if (newConfig.okxPassphrase === '***') newConfig.okxPassphrase = config.okxPassphrase;
    config = newConfig;
    protectedPositions.clear(); // 配置重置后清空保护标记
    addLog('INFO', '策略参数已重载');
    res.json({ success: true });
});

app.post('/api/toggle', (req, res) => {
    isRunning = req.body.running;
    if (!isRunning) protectedPositions.clear();
    addLog('INFO', isRunning ? '引擎启动' : '引擎安全关机');
    res.json({ success: true });
});

app.post('/api/assistant/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        // The assistant now uses Gemini via the environment variable
        const reply = await aiService.generateAssistantResponse('', messages);
        res.json({ reply });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`[MONEY HUNTER PRO] Engine active on ${PORT}`));
