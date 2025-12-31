
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
        if (isRunning) {
            const activeStrategy = config.strategies.find(s => s.id === config.activeStrategyId) || config.strategies[0];
            
            // Handle AI Selection Mode
            if (activeStrategy.coinSelectionMode === 'ai' && config.deepseekApiKey) {
                // Periodically refresh AI selection? Or just once on start?
                // For simplicity, let's keep it based on the enabledCoins which can be updated by a separate AI call
            }

            marketData = await okxService.fetchMarketData(config);
            accountData = await okxService.fetchAccountData(config);

            const hasPos = accountData.positions.length > 0;
            const interval = (hasPos ? activeStrategy.holdingInterval : activeStrategy.emptyInterval) * 1000;

            if (Date.now() - lastAnalysisTime >= interval) {
                lastAnalysisTime = Date.now();
                addLog('INFO', `>>> 引擎扫描 (策略: ${activeStrategy.name}) <<<`);
                
                const decisions = await aiService.getTradingDecision(config.deepseekApiKey, marketData, accountData, activeStrategy);
                const instruments = await okxService.fetchInstruments();

                for (const decision of decisions) {
                    latestDecisions[decision.coin] = decision;
                    if (decision.action === 'HOLD') continue;
                    
                    const instInfo = instruments[decision.coin];
                    if (!instInfo) continue;
                    
                    const price = parseFloat(marketData[decision.coin].ticker.last);
                    const eq = parseFloat(accountData.balance.totalEq);
                    const targetMargin = eq * activeStrategy.initialRisk;
                    const marginPerContract = (parseFloat(instInfo.ctVal) * price) / parseFloat(activeStrategy.leverage);
                    const contracts = Math.floor(targetMargin / marginPerContract);
                    
                    decision.size = contracts.toString();
                    
                    try {
                        addLog('TRADE', `[${decision.coin}] ${decision.action} | ${decision.reasoning}`);
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
        } else {
            // Just fetch market data for UI when not running
            marketData = await okxService.fetchMarketData(config);
            accountData = await okxService.fetchAccountData(config);
        }
    } catch (e: any) {
        if (isRunning) addLog('ERROR', `Loop Error: ${e.message}`);
    } finally {
        isProcessing = false;
    }
};

setInterval(runTradingLoop, 2000);

app.get('/api/status', (req, res) => {
    res.json({ isRunning, config: { ...config, okxSecretKey: '***', okxPassphrase: '***', deepseekApiKey: '***' }, marketData, accountData, latestDecisions, logs });
});

app.get('/api/instruments', async (req, res) => {
    const insts = await okxService.fetchInstruments();
    res.json(insts);
});

app.post('/api/config', (req, res) => {
    config = { ...config, ...req.body };
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
        const reply = await aiService.generateAssistantResponse(apiKey, messages);
        res.json({ reply });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
