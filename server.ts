
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MarketDataCollection, AccountContext, AIDecision, SystemLog, AppConfig, StrategyProfile } from './types';
import { DEFAULT_CONFIG, COIN_CONFIG } from './constants';
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
  if (logs.length > 300) logs = logs.slice(-300);
  console.log(`[${type}] ${message}`);
};

const runTradingLoop = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        marketData = await okxService.fetchMarketData(config);
        accountData = await okxService.fetchAccountData(config);

        if (!isRunning || !marketData || !accountData) return;

        const activeStrategy = config.strategies.find(s => s.id === config.activeStrategyId) || config.strategies[0];
        const hasPos = accountData.positions.length > 0;
        const interval = (hasPos ? activeStrategy.holdingInterval : activeStrategy.emptyInterval) * 1000;

        if (Date.now() - lastAnalysisTime < interval) return;
        lastAnalysisTime = Date.now();

        addLog('INFO', `>>> 引擎扫描 (周期: ${interval/1000}s, 策略: ${activeStrategy.name}) <<<`);
        const decisions = await aiService.getTradingDecision(config.deepseekApiKey, marketData, accountData, activeStrategy);

        for (const decision of decisions) {
            if (decision.action === 'HOLD') continue;
            
            // 下单规模计算
            const eq = parseFloat(accountData.balance.totalEq);
            const instInfo = (await okxService.fetchInstruments())[decision.coin];
            if (!instInfo) continue;
            
            const price = parseFloat(marketData[decision.coin].ticker.last);
            const marginPerContract = (parseFloat(instInfo.ctVal) * price) / parseFloat(activeStrategy.leverage);
            const targetMargin = eq * activeStrategy.initialRisk;
            const contracts = Math.floor(targetMargin / marginPerContract);
            
            decision.size = contracts.toString();
            
            try {
                addLog('TRADE', `[${decision.coin}] 执行动作: ${decision.action} | 理由: ${decision.reasoning}`);
                if (decision.action === 'UPDATE_TPSL') {
                  const pos = accountData.positions.find(p => p.instId === decision.instId);
                  if (pos) await okxService.updatePositionTPSL(decision.instId, pos.posSide as any, pos.pos, decision.trading_decision.stop_loss, config);
                } else {
                  await okxService.executeOrder(decision, config);
                }
                addLog('SUCCESS', `[${decision.coin}] 指令执行完毕`);
            } catch (err: any) {
                addLog('ERROR', `[${decision.coin}] 执行失败: ${err.message}`);
            }
        }
    } catch (e: any) {
        addLog('ERROR', `系统运行异常: ${e.message}`);
    } finally {
        isProcessing = false;
    }
};

// 初始元数据同步
okxService.fetchInstruments().then(() => addLog('INFO', '交易所元数据同步完成'));
setInterval(runTradingLoop, 2000);

app.get('/api/status', (req, res) => {
    res.json({ isRunning, config: { ...config, okxSecretKey: '***', okxPassphrase: '***', deepseekApiKey: '***' }, marketData, accountData, latestDecisions, logs });
});

app.post('/api/config', (req, res) => {
    const newConfig = req.body;
    config = { ...config, ...newConfig };
    addLog('INFO', '配置/策略已更新');
    res.json({ success: true });
});

app.post('/api/toggle', (req, res) => {
    isRunning = req.body.running;
    addLog('INFO', isRunning ? '引擎启动' : '引擎停止');
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
