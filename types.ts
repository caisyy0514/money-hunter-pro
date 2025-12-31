
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
}

export type MarketDataCollection = Record<string, SingleMarketData>;

export interface StrategyProfile {
  id: string;
  name: string;
  coinSelectionMode: 'manual' | 'ai';
  enabledCoins: string[]; // For manual mode
  aiSelectionCriteria?: string; // For AI mode
  leverage: string;
  initialRisk: number; 
  beTriggerRoi: number; 
  emptyInterval: number; 
  holdingInterval: number; 
  systemPrompt: string; 
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
