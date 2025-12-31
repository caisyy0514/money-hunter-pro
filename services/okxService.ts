
import { AccountBalance, CandleData, MarketDataCollection, PositionData, TickerData, AIDecision, AccountContext, SingleMarketData, InstrumentInfo } from "../types";
import { DEFAULT_LEVERAGE, TAKER_FEE_RATE } from "../constants";
import CryptoJS from 'crypto-js';

const BASE_URL = "https://www.okx.com";
let instrumentCache: Record<string, InstrumentInfo> = {};

const signRequest = (method: string, requestPath: string, body: string = '', secretKey: string) => {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + requestPath + body;
  const hmac = CryptoJS.HmacSHA256(message, secretKey);
  const signature = CryptoJS.enc.Base64.stringify(hmac);
  return { timestamp, signature };
};

const getHeaders = (method: string, requestPath: string, body: string = '', config: any) => {
  const { timestamp, signature } = signRequest(method, requestPath, body, config.okxSecretKey);
  return {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': config.okxApiKey,
    'OK-ACCESS-PASSPHRASE': config.okxPassphrase,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-SIMULATED': '0' 
  };
};

export const fetchInstruments = async (): Promise<Record<string, InstrumentInfo>> => {
  try {
    const res = await fetch(`${BASE_URL}/api/v5/public/instruments?instType=SWAP`);
    const json = await res.json();
    if (json.code !== '0') return instrumentCache;
    
    const cache: Record<string, InstrumentInfo> = {};
    json.data.forEach((info: any) => {
      if (info.settleCcy === 'USDT') {
        const coin = info.instId.split('-')[0];
        cache[coin] = {
          instId: info.instId,
          ctVal: info.ctVal,
          tickSz: info.tickSz,
          lotSz: info.lotSz,
          minSz: info.minSz,
          displayName: coin,
          state: info.state
        };
      }
    });
    instrumentCache = cache;
    return cache;
  } catch (e) {
    console.error("Fetch instruments failed", e);
    return instrumentCache;
  }
};

const calculateEMA = (data: CandleData[], period: number): number[] => {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = parseFloat(data[0].c);
  result.push(ema);
  for (let i = 1; i < data.length; i++) {
    const price = parseFloat(data[i].c);
    ema = price * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
};

const enrichCandlesWithEMA = (candles: CandleData[]): CandleData[] => {
    if(!candles || candles.length === 0) return [];
    const ema15 = calculateEMA(candles, 15);
    const ema60 = calculateEMA(candles, 60);
    return candles.map((c, i) => ({
        ...c,
        ema15: ema15[i],
        ema60: ema60[i]
    }));
};

async function fetchSingleCoinData(coinKey: string, instId: string): Promise<SingleMarketData> {
    const endpoints = [
        `${BASE_URL}/api/v5/market/ticker?instId=${instId}`,
        `${BASE_URL}/api/v5/market/candles?instId=${instId}&bar=1H&limit=100`,
        `${BASE_URL}/api/v5/market/candles?instId=${instId}&bar=3m&limit=100`,
        `${BASE_URL}/api/v5/public/funding-rate?instId=${instId}`,
        `${BASE_URL}/api/v5/public/open-interest?instId=${instId}`,
        `${BASE_URL}/api/v5/market/books?instId=${instId}&sz=5`
    ];

    const responses = await Promise.all(endpoints.map(url => fetch(url).then(r => r.json())));
    const [tickerJson, candles1HJson, candles3mJson, fundingJson, oiJson, bookJson] = responses;

    if (tickerJson.code !== '0') throw new Error(`Ticker Error: ${tickerJson.msg}`);

    return {
      ticker: tickerJson.data[0],
      candles5m: [], 
      candles15m: [], 
      candles1H: enrichCandlesWithEMA(formatCandles(candles1HJson.data || [])),
      candles3m: enrichCandlesWithEMA(formatCandles(candles3mJson.data || [])),
      fundingRate: fundingJson.data?.[0]?.fundingRate || "0", 
      nextFundingTime: fundingJson.data?.[0]?.fundingTime || "0",
      openInterest: oiJson.data?.[0]?.oi || "0", 
      orderbook: {
        asks: bookJson.data?.[0]?.asks || [],
        bids: bookJson.data?.[0]?.bids || [],
      }, 
      trades: [],
    };
}

export const fetchMarketData = async (config: any): Promise<MarketDataCollection> => {
  if (config.isSimulation) return generateMockMarketData();
  const results: Record<string, SingleMarketData> = {};
  const activeStrategy = config.strategies.find((s: any) => s.id === config.activeStrategyId);
  if (!activeStrategy) return {};

  const instruments = await fetchInstruments();
  const coins = activeStrategy.enabledCoins;
  
  // Concurrently fetch to speed up
  const fetchPromises = coins.map(async (coin: string) => {
    const inst = instruments[coin];
    if (inst) {
      try {
        const data = await fetchSingleCoinData(coin, inst.instId);
        results[coin] = data;
      } catch (e) {
        console.warn(`Fetch ${coin} failed`, e);
      }
    }
  });

  await Promise.all(fetchPromises);
  return results;
};

export const fetchAccountData = async (config: any): Promise<AccountContext> => {
  if (config.isSimulation) return generateMockAccountData();
  if (!config.okxApiKey || !config.okxSecretKey) throw new Error("API Key 未配置");
  
  try {
    const balPath = '/api/v5/account/balance?ccy=USDT';
    const balRes = await fetch(BASE_URL + balPath, { method: 'GET', headers: getHeaders('GET', balPath, '', config) });
    const balJson = await balRes.json();
    
    const posPath = `/api/v5/account/positions?instType=SWAP`;
    const posRes = await fetch(BASE_URL + posPath, { method: 'GET', headers: getHeaders('GET', posPath, '', config) });
    const posJson = await posRes.json();

    if (balJson.code !== '0') throw new Error(`Balance API: ${balJson.msg}`);
    const balanceData = balJson.data?.[0]?.details?.[0]; 
    
    let positions: PositionData[] = [];
    if (posJson.data && posJson.data.length > 0) {
        positions = posJson.data.filter((p: any) => p.settleCcy === 'USDT').map((rawPos: any) => ({
            instId: rawPos.instId, posSide: rawPos.posSide, pos: rawPos.pos,
            avgPx: rawPos.avgPx, breakEvenPx: rawPos.breakEvenPx, upl: rawPos.upl,
            uplRatio: rawPos.uplRatio, mgnMode: rawPos.mgnMode, margin: rawPos.margin,
            liqPx: rawPos.liqPx, cTime: rawPos.cTime, leverage: rawPos.lever
        }));
    }
    return {
      balance: { totalEq: balanceData?.eq || "0", availEq: balanceData?.availEq || "0", uTime: balJson.data?.[0]?.uTime || Date.now().toString() },
      positions
    };
  } catch (error: any) {
     throw new Error(`账户连接失败: ${error.message}`);
  }
};

export const executeOrder = async (order: AIDecision, config: any): Promise<any> => {
  if (config.isSimulation) return { code: "0", msg: "OK" };
  const path = "/api/v5/trade/order";
  const body = JSON.stringify({
    instId: order.instId,
    tdMode: "isolated",
    side: order.action === 'BUY' ? 'buy' : 'sell',
    posSide: order.action === 'BUY' ? 'long' : 'short',
    ordType: "market",
    sz: order.size,
    reduceOnly: order.action === 'CLOSE'
  });
  const headers = getHeaders('POST', path, body, config);
  const response = await fetch(BASE_URL + path, { method: 'POST', headers, body });
  return await response.json();
};

export const updatePositionTPSL = async (instId: string, posSide: string, size: string, slPrice: string, config: any) => {
    if (config.isSimulation) return { code: "0" };
    const path = "/api/v5/trade/order-algo";
    const body = JSON.stringify({
        instId, posSide, tdMode: 'isolated', side: posSide === 'long' ? 'sell' : 'buy',
        ordType: 'conditional', sz: size, reduceOnly: true, slTriggerPx: slPrice, slOrdPx: '-1'
    });
    const res = await fetch(BASE_URL + path, { method: 'POST', headers: getHeaders('POST', path, body, config), body });
    return await res.json();
};

function formatCandles(apiCandles: any[]): CandleData[] {
  return apiCandles.map((c: string[]) => ({ ts: c[0], o: c[1], h: c[2], l: c[3], c: c[4], vol: c[5] })).reverse(); 
}

// Fix: Added missing candles5m and candles15m properties to the mock market data objects
function generateMockMarketData(): MarketDataCollection {
  return {
      BTC: { 
        ticker: { instId: 'BTC-USDT-SWAP', last: '65000', lastSz: '0.1', askPx: '65001', bidPx: '64999', open24h: '64000', high24h: '66000', low24h: '63000', volCcy24h: '1000000', ts: Date.now().toString() }, 
        candles5m: [], 
        candles15m: [], 
        candles1H: [], 
        candles3m: [], 
        fundingRate: '0.0001', 
        nextFundingTime: '0', 
        openInterest: '100', 
        orderbook: { asks: [], bids: [] }, 
        trades: [] 
      },
      ETH: { 
        ticker: { instId: 'ETH-USDT-SWAP', last: '3500', lastSz: '1', askPx: '3501', bidPx: '3499', open24h: '3400', high24h: '3600', low24h: '3300', volCcy24h: '1000000', ts: Date.now().toString() }, 
        candles5m: [], 
        candles15m: [], 
        candles1H: [], 
        candles3m: [], 
        fundingRate: '0.0001', 
        nextFundingTime: '0', 
        openInterest: '100', 
        orderbook: { asks: [], bids: [] }, 
        trades: [] 
      }
  };
}

function generateMockAccountData(): AccountContext {
  return { balance: { totalEq: "1000.00", availEq: "1000.00", uTime: Date.now().toString() }, positions: [] };
}