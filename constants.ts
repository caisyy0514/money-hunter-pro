
import { StrategyProfile, AppConfig } from "./types";

// Define the mapping between coin keys and their OKX instrument configurations.
// contractVal is added to support position size and margin calculations in the UI components.
export const COIN_CONFIG: Record<string, { instId: string; displayName: string; contractVal: number }> = {
  BTC: { instId: "BTC-USDT-SWAP", displayName: "BTC", contractVal: 0.01 },
  ETH: { instId: "ETH-USDT-SWAP", displayName: "ETH", contractVal: 0.1 },
  SOL: { instId: "SOL-USDT-SWAP", displayName: "SOL", contractVal: 1 },
  BNB: { instId: "BNB-USDT-SWAP", displayName: "BNB", contractVal: 0.1 },
  XRP: { instId: "XRP-USDT-SWAP", displayName: "XRP", contractVal: 100 },
};

export const TAKER_FEE_RATE = 0.0005; 
export const DEFAULT_LEVERAGE = "20";

const DEFAULT_STRATEGY: StrategyProfile = {
  id: "default-rolling",
  name: "EMA Hunter 默认滚仓",
  enabledCoins: ["BTC", "ETH", "SOL"],
  leverage: "20",
  initialRisk: 0.15,
  beTriggerRoi: 0.078,
  emptyInterval: 15,
  holdingInterval: 10,
  systemPrompt: "你是一个专业的加密货币交易机器人。主要采用 EMA 趋势追踪策略。在 1H 趋势确定时，通过 3m 均线交叉寻找入场点。盈利后执行保本止损移动逻辑。"
};

export const DEFAULT_CONFIG: AppConfig = {
  okxApiKey: "",
  okxSecretKey: "",
  okxPassphrase: "",
  deepseekApiKey: "", 
  isSimulation: true,
  activeStrategyId: "default-rolling",
  strategies: [DEFAULT_STRATEGY]
};

export const MOCK_TICKER = {
  instId: "ETH-USDT-SWAP",
  last: "3250.50",
  lastSz: "1.2",
  askPx: "3250.60",
  bidPx: "3250.40",
  open24h: "3100.00",
  high24h: "3300.00",
  low24h: "3050.00",
  volCcy24h: "500000000",
  ts: Date.now().toString(),
};
