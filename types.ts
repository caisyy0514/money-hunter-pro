
export interface CandleData {
  ts: string;
  o: string;
  h: string;
  l: string;
  c: string;
  vol: string;
  ema15?: number;
  ema60?: number;
}

export interface TickerData {
  instId: string;
  last: string;
  lastSz: string;
  askPx: string;
  bidPx: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  ts: string;
}

export interface InstrumentInfo {
  instId: string;
  ctVal: string;
  tickSz: string;
  lotSz: string;
  minSz: string;
  displayName: string;
  state: string;
  listTime: string; // 上市时间戳
}

export interface PositionData {
  instId: string;
  posSide: string;
  pos: string;
  avgPx: string;
  breakEvenPx: string;
  upl: string;
  uplRatio: string;
  mgnMode: string;
  margin: string;
  liqPx: string;
  cTime: string;
  leverage: string;
  slTriggerPx?: string;
  tpTriggerPx?: string;
  isProtected?: boolean; // 内部标记：是否已移至保本位
}

export interface AccountBalance {
  totalEq: string;
  availEq: string;
  uTime: string;
}

export interface AccountContext {
  balance: AccountBalance;
  positions: PositionData[];
}

export interface OrderbookItem {
  px: string;
  sz: string;
  orders: string;
}

export interface SingleMarketData {
  ticker: TickerData;
  candles5m: CandleData[];
  candles15m: CandleData[];
  candles1H: CandleData[];
  candles3m: CandleData[];
  fundingRate: string;
  nextFundingTime: string;
  openInterest: string;
  orderbook: {
    asks: OrderbookItem[];
    bids: OrderbookItem[];
  };
  trades: any[];
  listTime?: number; // 转换后的上市时间
}

export type MarketDataCollection = Record<string, SingleMarketData>;

export interface StrategyProfile {
  id: string;
  name: string;
  coinSelectionMode: 'manual' | 'new-coin';
  enabledCoins: string[]; 
  maxPositions: number; // 最大同时持仓数
  newCoinDays: number; // 定义新币的天数
  leverage: string;
  initialRisk: number; 
  beTriggerRoi: number; 
  trailingCallback: number; // 移动止损回调比例 (例如 0.005)
  emptyInterval: number; 
  holdingInterval: number; 
  systemPrompt: string; 
  aiSelectionCriteria?: string; // AI selection criteria for preferred coins
}

export interface TradingDecisionDetail {
  action: 'BUY' | 'SELL' | 'HOLD' | 'UPDATE_TPSL' | 'CLOSE';
  confidence: string;
  position_size: string;
  leverage: string;
  profit_target: string;
  stop_loss: string;
  invalidation_condition: string;
}

export interface AIDecision {
  coin: string;
  instId: string;
  stage_analysis: string;
  market_assessment: string;
  hot_events_overview: string;
  coin_analysis: string;
  trading_decision: TradingDecisionDetail;
  reasoning: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'UPDATE_TPSL' | 'CLOSE';
  size: string;
  leverage: string;
  timestamp?: number;
}

export interface AppConfig {
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
  deepseekApiKey: string;
  isSimulation: boolean;
  activeStrategyId: string;
  strategies: StrategyProfile[];
}

export interface SystemLog {
  id: string;
  timestamp: Date;
  type: 'ERROR' | 'SUCCESS' | 'WARNING' | 'TRADE' | 'INFO';
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
