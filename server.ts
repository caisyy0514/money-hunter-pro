
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, StrategyProfile } from './types';
import { DEFAULT_CONFIG } from './constants';
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
        
        // Always try to update market/account data for display
        const mData = await okxService.fetchMarketData(config);
        const aData = await okxService.fetchAccountData(config);
        
        if (mData) marketData = mData;
        if (aData) accountData = aData;

        if (isRunning && marketData && accountData) {
            const hasPos = accountData.positions.length > 0;
            const interval = (hasPos ? activeStrategy.holdingInterval : activeStrategy.emptyInterval) * 1000;

            if (Date.now() - lastAnalysisTime >= interval) {
                lastAnalysisTime = Date.now();
                
                if (!config.deepseekApiKey) {
                    addLog('ERROR', '未配置 DeepSeek API Key');
                    isRunning = false;
                    return;
                }

                addLog('INFO', `>>> 引擎扫描 (策略: ${activeStrategy.name}) <<<`);
                
                const decisions = await aiService.getTradingDecision(config.deepseekApiKey, marketData, accountData, activeStrategy);
                const instruments = await okxService.fetchInstruments();

                for (const decision of decisions) {
                    latestDecisions[decision.coin] = decision;
                    if (decision.action === 'HOLD') continue;
                    
                    const instInfo = instruments[decision.coin];
                    if (!instInfo) {
                        addLog('WARNING', `无法获取 ${decision.coin} 的合约信息，跳过执行`);
                        continue;
                    }
                    
                    const coinMData = marketData[decision.coin];
                    if (!coinMData) continue;

                    const price = parseFloat(coinMData.ticker.last);
                    const eq = parseFloat(accountData.balance.totalEq);
                    const targetMargin = eq * activeStrategy.initialRisk;
                    const marginPerContract = (parseFloat(instInfo.ctVal) * price) / parseFloat(activeStrategy.leverage);
                    const contracts = Math.floor(targetMargin / marginPerContract);
                    
                    decision.size = contracts.toString();
                    
                    if (contracts <= 0 && decision.action !== 'CLOSE' && decision.action !== 'UPDATE_TPSL') {
                        addLog('WARNING', `[${decision.coin}] 风险控制：计算仓位过小 (0张)，跳过下单`);
                        continue;
                    }

                    try {
                        addLog('TRADE', `[${decision.coin}] 信号: ${decision.action} | 理由: ${decision.reasoning}`);
                        if (decision.action === 'UPDATE_TPSL') {
                          await okxService.updatePositionTPSL(decision.instId, 'long', decision.size, decision.trading_decision.stop_loss, config);
                        } else {
                          await okxService.executeOrder(decision, config);
                        }
                    } catch (err: any) {
                        addLog('ERROR', `[${decision.coin}] 执行失败: ${err.message}`);
                    }
                }
            }
        }
    } catch (e: any) {
        if (isRunning) addLog('ERROR', `主循环异常: ${e.message}`);
    } finally {
        isProcessing = false;
    }
};

setInterval(runTradingLoop, 2000);

// STATUS API: NO CONFIG RETURNED
app.get('/api/status', (req, res) => {
    res.json({ 
        isRunning, 
        marketData, 
        accountData, 
        latestDecisions, 
        logs 
    });
});

app.get('/api/config', (req, res) => {
    // Redact keys for security before sending to frontend
    res.json({ 
        ...config, 
        okxSecretKey: config.okxSecretKey ? '***' : '', 
        okxPassphrase: config.okxPassphrase ? '***' : '', 
        deepseekApiKey: config.deepseekApiKey ? '***' : '' 
    });
});

app.get('/api/instruments', async (req, res) => {
    const insts = await okxService.fetchInstruments();
    res.json(insts);
});

app.post('/api/config', (req, res) => {
    // Preserve keys if they were redacted in the request
    const newConfig = { ...req.body };
    if (newConfig.okxSecretKey === '***') newConfig.okxSecretKey = config.okxSecretKey;
    if (newConfig.okxPassphrase === '***') newConfig.okxPassphrase = config.okxPassphrase;
    if (newConfig.deepseekApiKey === '***') newConfig.deepseekApiKey = config.deepseekApiKey;
    
    config = newConfig;
    addLog('INFO', '配置/策略已更新');
    res.json({ success: true });
});

app.post('/api/toggle', (req, res) => {
    isRunning = req.body.running;
    addLog('INFO', isRunning ? '引擎启动' : '引擎停止');
    res.json({ success: true });
});

app.post('/api/assistant/chat', async (req, res) => {
    try {
        const { messages, apiKey } = req.body;
        // If apiKey is masked, use the one from server config
        const realKey = apiKey === '***' ? config.deepseekApiKey : apiKey;
        const reply = await aiService.generateAssistantResponse(realKey, messages);
        res.json({ reply });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`[MONEY HUNTER] Server running on port ${PORT}`));
