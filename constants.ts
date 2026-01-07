
import { StrategyProfile, AppConfig } from "./types";

export const COIN_CONFIG: Record<string, { instId: string; displayName: string; contractVal: number }> = {
  BTC: { instId: "BTC-USDT-SWAP", displayName: "BTC", contractVal: 0.01 },
  ETH: { instId: "ETH-USDT-SWAP", displayName: "ETH", contractVal: 0.1 },
  SOL: { instId: "SOL-USDT-SWAP", displayName: "SOL", contractVal: 1 },
};

export const TAKER_FEE_RATE = 0.0005; 
export const DEFAULT_LEVERAGE = "20";

const NEW_COIN_HUNTER_STRATEGY: StrategyProfile = {
  id: "new-coin-hunter",
  name: "新币猎手 (New Coin Hunter)",
  coinSelectionMode: 'new-coin',
  enabledCoins: [],
  maxPositions: 6,
  newCoinDays: 30,
  leverage: "10",
  initialRisk: 0.1, // 10% 保证金
  initialStopLossRoi: 0.05, // 5% 初始止损
  beTriggerRoi: 0.001, // 利润 > 0 触发
  trailingCallback: 0.005, // 0.5% 回调幅度
  emptyInterval: 30,
  holdingInterval: 15,
  systemPrompt: `你是一个顶级的新币短线猎手。
任务：筛选最近上市、具备高热度和强动能的新币。
策略逻辑：
1. 观察 15m 趋势，若处于爆发期（价格在 EMA60 之上且成交量激增），寻找 1m 回调买入机会。
2. 严格执行短平快，一旦利润转正，立即建议保本止损。
3. 动态止损应设在最近 1m 支撑位。
输出：必须严格按照 JSON 格式返回决策结果。`
};

const DEFAULT_STRATEGY: StrategyProfile = {
  id: "default-rolling",
  name: "EMA Hunter 默认滚仓",
  coinSelectionMode: 'manual',
  enabledCoins: ["BTC", "ETH", "SOL"],
  maxPositions: 3,
  newCoinDays: 365,
  leverage: "20",
  initialRisk: 0.15,
  initialStopLossRoi: 0.1, // 10% 初始止损
  beTriggerRoi: 0.078,
  trailingCallback: 0.01,
  emptyInterval: 15,
  holdingInterval: 10,
  systemPrompt: "你是一个专业的加密货币交易机器人。采用 EMA 趋势追踪。在 1H 趋势确定时，通过 3m 寻找入场点。"
};

export const DEFAULT_CONFIG: AppConfig = {
  okxApiKey: "",
  okxSecretKey: "",
  okxPassphrase: "",
  deepseekApiKey: "",
  isSimulation: true,
  activeStrategyId: "new-coin-hunter",
  strategies: [NEW_COIN_HUNTER_STRATEGY, DEFAULT_STRATEGY]
};
