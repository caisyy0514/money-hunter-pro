
import { AccountBalance, CandleData, MarketDataCollection, PositionData, TickerData, AIDecision, AccountContext, SingleMarketData, InstrumentInfo } from "../types";
import { COIN_CONFIG, DEFAULT_LEVERAGE, MOCK_TICKER, TAKER_FEE_RATE } from "../constants";
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
    if (json.code !== '0') return {};
    const cache: Record<string, InstrumentInfo> = {};
    Object.keys(COIN_CONFIG).forEach(coin => {
      const targetInstId = COIN_CONFIG[coin].instId;
      const info = json.data.find((i: any) => i.instId === targetInstId);
      if (info) {
        cache[coin] = {
          instId: info.instId,
          ctVal: info.ctVal,
          tickSz: info.tickSz,
          lotSz: info.lotSz,
          minSz: info.minSz,
          displayName: coin
        };
      }
    });
    instrumentCache = cache;
    return cache;
  } catch (e) {
    console.error("Fetch instruments failed", e);
    return {};
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

async function fetchSingleCoinData(coinKey: string): Promise<SingleMarketData> {
    const instId = COIN_CONFIG[coinKey].instId;
    
    // 并发获取行情、K线、资金费率、持仓量、订单簿
    const endpoints = [
        `${BASE_URL}/api/v5/market/ticker?instId=${instId}`,
        `${BASE_URL}/api/v5/market/candles?instId=${instId}&bar=1H&limit=300`,
        `${BASE_URL}/api/v5/market/candles?instId=${instId}&bar=3m&limit=300`,
        `${BASE_URL}/api/v5/public/funding-rate?instId=${instId}`,
        `${BASE_URL}/api/v5/public/open-interest?instId=${instId}`,
        `${BASE_URL}/api/v5/market/books?instId=${instId}&sz=20`
    ];

    const responses = await Promise.all(endpoints.map(url => fetch(url).then(r => r.json())));
    
    const [tickerJson, candles1HJson, candles3mJson, fundingJson, oiJson, bookJson] = responses;

    if (tickerJson.code !== '0') throw new Error(`Ticker Error: ${tickerJson.msg}`);

    return {
      ticker: tickerJson.data[0],
      candles5m: [], 
      candles15m: [], 
      candles1H: enrichCandlesWithEMA(formatCandles(candles1HJson.data)),
      candles3m: enrichCandlesWithEMA(formatCandles(candles3mJson.data)),
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
  const results: Partial<MarketDataCollection> = {};
  const activeStrategy = config.strategies.find((s: any) => s.id === config.activeStrategyId);
  const coins = activeStrategy ? activeStrategy.enabledCoins : Object.keys(COIN_CONFIG);
  
  for (const coin of coins) {
      try {
          const data = await fetchSingleCoinData(coin);
          results[coin] = data;
          await new Promise(r => setTimeout(r, 100)); // 轻微限速
      } catch (e: any) {
          console.error(`Failed to fetch data for ${coin}:`, e.message);
      }
  }
  return results as MarketDataCollection;
};

const fetchAlgoOrders = async (instId: string, config: any): Promise<any[]> => {
    if (config.isSimulation) return [];
    const orderTypes = ["conditional", "move_order_stop", "trigger"];
    let allOrders: any[] = [];
    await Promise.all(orderTypes.map(async (type) => {
        try {
            const path = `/api/v5/trade/orders-algo-pending?instId=${instId}&instType=SWAP&ordType=${type}`;
            const headers = getHeaders('GET', path, '', config);
            const res = await fetch(BASE_URL + path, { method: 'GET', headers });
            const json = await res.json();
            if (json.code === '0' && json.data) {
                allOrders = [...allOrders, ...json.data];
            }
        } catch (e) {
            console.warn(`Fetch failed for algo type ${type}:`, e);
        }
    }));
    return allOrders;
};

export const fetchAccountData = async (config: any): Promise<AccountContext> => {
  if (config.isSimulation) return generateMockAccountData();
  try {
    const balPath = '/api/v5/account/balance?ccy=USDT';
    const balHeaders = getHeaders('GET', balPath, '', config);
    const balRes = await fetch(BASE_URL + balPath, { method: 'GET', headers: balHeaders });
    const balJson = await balRes.json();
    
    const posPath = `/api/v5/account/positions?instType=SWAP`;
    const posHeaders = getHeaders('GET', posPath, '', config);
    const posRes = await fetch(BASE_URL + posPath, { method: 'GET', headers: posHeaders });
    const posJson = await posRes.json();

    if (balJson.code && balJson.code !== '0') throw new Error(`Balance API: ${balJson.msg}`);
    const balanceData = balJson.data?.[0]?.details?.[0]; 
    
    let positions: PositionData[] = [];
    if (posJson.data && posJson.data.length > 0) {
        const supportedInstIds = Object.values(COIN_CONFIG).map(c => c.instId);
        const relevantPositions = posJson.data.filter((p: any) => supportedInstIds.includes(p.instId));
        
        if (relevantPositions.length > 0) {
             const uniqueInstIds = [...new Set(relevantPositions.map((p: any) => p.instId))];
             const algoOrdersMap: Record<string, any[]> = {};
             await Promise.all(uniqueInstIds.map(async (instId: any) => {
                 algoOrdersMap[instId] = await fetchAlgoOrders(instId, config);
             }));
             
             positions = relevantPositions.map((rawPos: any) => {
                const position: PositionData = {
                    instId: rawPos.instId, posSide: rawPos.posSide, pos: rawPos.pos,
                    avgPx: rawPos.avgPx, breakEvenPx: rawPos.breakEvenPx, upl: rawPos.upl,
                    uplRatio: rawPos.uplRatio, mgnMode: rawPos.mgnMode, margin: rawPos.margin,
                    liqPx: rawPos.liqPx, cTime: rawPos.cTime, leverage: rawPos.lever
                };
                const algos = algoOrdersMap[rawPos.instId] || [];
                const slOrder = algos.find((o: any) => o.posSide === rawPos.posSide && o.slTriggerPx && parseFloat(o.slTriggerPx) > 0);
                const tpOrder = algos.find((o: any) => o.posSide === rawPos.posSide && o.tpTriggerPx && parseFloat(o.tpTriggerPx) > 0);
                if (slOrder) position.slTriggerPx = slOrder.slTriggerPx;
                if (tpOrder) position.tpTriggerPx = tpOrder.tpTriggerPx;
                return position;
            });
        }
    }
    return {
      balance: { totalEq: balanceData?.eq || "0", availEq: balanceData?.availEq || "0", uTime: balJson.data?.[0]?.uTime || Date.now().toString() },
      positions
    };
  } catch (error: any) {
     throw new Error(`账户数据获取失败: ${error.message}`);
  }
};

const setLeverage = async (instId: string, lever: string, posSide: string, config: any) => {
    if (config.isSimulation) return;
    const path = "/api/v5/account/set-leverage";
    const body = JSON.stringify({ instId, lever, mgnMode: "isolated", posSide });
    const headers = getHeaders('POST', path, body, config);
    const response = await fetch(BASE_URL + path, { method: 'POST', headers, body });
    const json = await response.json();
    if (json.code !== '0' && json.code !== '51015') throw new Error(`设置杠杆失败 (${lever}x): ${json.msg}`);
    return json;
};

const ensureLongShortMode = async (config: any) => {
    if (config.isSimulation) return;
    const path = "/api/v5/account/config";
    const headers = getHeaders('GET', path, '', config);
    const response = await fetch(BASE_URL + path, { method: 'GET', headers });
    const json = await response.json();
    if (json.code === '0' && json.data && json.data[0]) {
        if (json.data[0].posMode !== 'long_short_mode') {
            const setPath = "/api/v5/account/set-position-mode";
            const setBody = JSON.stringify({ posMode: 'long_short_mode' });
            const setHeaders = getHeaders('POST', setPath, setBody, config);
            await fetch(BASE_URL + setPath, { method: 'POST', headers: setHeaders, body: setBody });
        }
    }
};

const placeAlgoStrategy = async (instId: string, posSide: string, avgPx: string, totalSz: string, config: any) => {
    if (config.isSimulation) return;
    const entryPrice = parseFloat(avgPx);
    const size = parseFloat(totalSz);
    const coinKey = Object.keys(COIN_CONFIG).find(k => COIN_CONFIG[k].instId === instId);
    if (!coinKey || !instrumentCache[coinKey]) return;
    
    const info = instrumentCache[coinKey];
    const MIN_SZ = parseFloat(info.minSz);
    const TICK_SIZE = parseFloat(info.tickSz);
    const leverage = parseFloat(config.strategies.find((s: any) => s.id === config.activeStrategyId)?.leverage || DEFAULT_LEVERAGE);
    
    const decimals = TICK_SIZE < 0.01 ? 4 : (TICK_SIZE < 0.1 ? 2 : 1);
    const sizePrecision = info.lotSz.includes('.') ? info.lotSz.split('.')[1].length : 0;

    const feeImpactOnROI = (TAKER_FEE_RATE * 2) * leverage;
    const fmtPrice = (p: number) => p.toFixed(decimals);
    
    const getTpPrice = (netRoi: number) => {
        const grossRoi = netRoi + feeImpactOnROI;
        return posSide === 'long' ? entryPrice * (1 + grossRoi / leverage) : entryPrice * (1 - grossRoi / leverage);
    };

    const p1 = fmtPrice(getTpPrice(0.05)); 
    const p2 = fmtPrice(getTpPrice(0.08)); 
    const p3 = fmtPrice(getTpPrice(0.12)); 

    let remaining = size;
    const calculateGreedySize = (pct: number) => {
        if (remaining <= 0) return 0;
        let intended = size * pct;
        let final = Math.max(intended, MIN_SZ);
        if (final > remaining) final = remaining;
        remaining = parseFloat((remaining - final).toFixed(sizePrecision));
        return parseFloat(final.toFixed(sizePrecision));
    };

    const s1 = calculateGreedySize(0.30);
    const s2 = calculateGreedySize(0.30);
    const s3 = calculateGreedySize(0.20);
    const s4 = parseFloat(remaining.toFixed(sizePrecision));

    const algoPath = "/api/v5/trade/order-algo";
    const side = posSide === 'long' ? 'sell' : 'buy'; 

    const placeConditional = async (triggerPx: string, sz: number) => {
        if (sz < MIN_SZ) return;
        const body = JSON.stringify({
            instId, tdMode: 'isolated', side, posSide, ordType: 'conditional',
            sz: sz.toString(), reduceOnly: true, tpTriggerPx: triggerPx, tpOrdPx: '-1'
        });
        const headers = getHeaders('POST', algoPath, body, config);
        await fetch(BASE_URL + algoPath, { method: 'POST', headers, body });
    };

    const placeTrailing = async (activationPx: string, sz: number) => {
        if (sz < MIN_SZ) return;
        const body = JSON.stringify({
            instId, tdMode: 'isolated', side, posSide, ordType: 'move_order_stop',
            sz: sz.toString(), reduceOnly: true, callbackRatio: "0.005", activePx: activationPx
        });
        const headers = getHeaders('POST', algoPath, body, config);
        await fetch(BASE_URL + algoPath, { method: 'POST', headers, body });
    };

    if (s1 >= MIN_SZ) await placeConditional(p1, s1);
    if (s2 >= MIN_SZ) await placeConditional(p2, s2);
    if (s3 >= MIN_SZ) await placeConditional(p3, s3);
    if (s4 >= MIN_SZ) await placeTrailing(p3, s4);
};

export const executeOrder = async (order: AIDecision, config: any): Promise<any> => {
  if (config.isSimulation) return { code: "0", msg: "模拟成功", data: [{ ordId: "sim_" + Date.now() }] };
  const targetInstId = order.instId;
  try {
    await ensureLongShortMode(config);
    if (order.action === 'CLOSE') {
        const closePath = "/api/v5/trade/close-position";
        const bodyLong = JSON.stringify({ instId: targetInstId, posSide: 'long', mgnMode: 'isolated' });
        await fetch(BASE_URL + closePath, { method: 'POST', headers: getHeaders('POST', closePath, bodyLong, config), body: bodyLong });
        const bodyShort = JSON.stringify({ instId: targetInstId, posSide: 'short', mgnMode: 'isolated' });
        return await (await fetch(BASE_URL + closePath, { method: 'POST', headers: getHeaders('POST', closePath, bodyShort, config), body: bodyShort })).json();
    }

    const posPath = `/api/v5/account/positions?instId=${targetInstId}`;
    const posRes = await fetch(BASE_URL + posPath, { method: 'GET', headers: getHeaders('GET', posPath, '', config) });
    const posJson = await posRes.json();
    const currentPos = (posJson.data && posJson.data.length > 0) ? posJson.data[0] : null;
    
    let apiPosSide = order.action === 'BUY' ? 'long' : 'short';
    let apiSide = order.action === 'BUY' ? 'buy' : 'sell';
    let reduceOnly = false;

    if (currentPos && parseFloat(currentPos.pos) > 0) {
        apiPosSide = currentPos.posSide;
        if (currentPos.posSide === 'long') {
            apiSide = order.action === 'BUY' ? 'buy' : 'sell';
            reduceOnly = order.action === 'SELL';
        } else {
            apiSide = order.action === 'SELL' ? 'sell' : 'buy';
            reduceOnly = order.action === 'BUY';
        }
    }

    await setLeverage(targetInstId, order.leverage, apiPosSide, config);
    
    const bodyObj: any = { instId: targetInstId, tdMode: "isolated", side: apiSide, posSide: apiPosSide, ordType: "market", sz: order.size, reduceOnly };
    const slPrice = order.trading_decision?.stop_loss;
    if (slPrice && !reduceOnly && parseFloat(slPrice) > 0) {
        bodyObj.attachAlgoOrds = [{ slTriggerPx: slPrice, slOrdPx: '-1' }];
    }
    
    const requestBody = JSON.stringify(bodyObj);
    const headers = getHeaders('POST', "/api/v5/trade/order", requestBody, config);
    const response = await fetch(BASE_URL + "/api/v5/trade/order", { method: 'POST', headers, body: requestBody });
    const json = await response.json();
    
    if (json.code === '0' && !reduceOnly) {
        const ordId = json.data?.[0]?.ordId;
        setTimeout(async () => {
          const res = await fetch(BASE_URL + `/api/v5/trade/order?instId=${targetInstId}&ordId=${ordId}`, { headers: getHeaders('GET', '', '', config) });
          const d = await res.json();
          if (d.data?.[0]?.avgPx) {
            await placeAlgoStrategy(targetInstId, apiPosSide, d.data[0].avgPx, d.data[0].sz, config);
          }
        }, 1000);
    }
    return json;
  } catch (error: any) {
      throw error;
  }
};

export const updatePositionTPSL = async (instId: string, posSide: 'long' | 'short', size: string, slPrice?: string, config?: any) => {
    if (config.isSimulation) return { code: "0", msg: "模拟成功" };
    try {
        const pendingAlgos = await fetchAlgoOrders(instId, config);
        const toCancel = pendingAlgos
            .filter((o: any) => o.posSide === posSide && o.slTriggerPx && parseFloat(o.slTriggerPx) > 0)
            .map((o: any) => ({ algoId: o.algoId, instId }));

        if (slPrice) {
            const path = "/api/v5/trade/order-algo";
            const body = JSON.stringify({ 
                instId, posSide, tdMode: 'isolated', side: posSide === 'long' ? 'sell' : 'buy', 
                ordType: 'conditional', sz: size, reduceOnly: true, slTriggerPx: slPrice, slOrdPx: '-1' 
            });
            const res = await fetch(BASE_URL + path, { method: 'POST', headers: getHeaders('POST', path, body, config), body });
            const json = await res.json();
            if (json.code !== '0') throw new Error(`SL Update Failed: ${json.msg}`);
        }
        
        if (toCancel.length > 0) {
            const cancelPath = "/api/v5/trade/cancel-algos";
            const cancelBody = JSON.stringify(toCancel);
            await fetch(BASE_URL + cancelPath, { method: 'POST', headers: getHeaders('POST', cancelPath, cancelBody, config), body: cancelBody });
        }
        return { code: "0", msg: "更新成功" };
    } catch (e: any) {
        throw new Error(`TPSL失败: ${e.message}`);
    }
};

export const checkAndCancelOrphanedAlgos = async (instId: string, config: any): Promise<any[]> => {
    if (config.isSimulation) return [];
    const algos = await fetchAlgoOrders(instId, config);
    if (!algos || algos.length === 0) return [];
    const toCancel = algos.map((o: any) => ({ algoId: o.algoId, instId }));
    const path = "/api/v5/trade/cancel-algos";
    const body = JSON.stringify(toCancel);
    const res = await fetch(BASE_URL + path, { method: 'POST', headers: getHeaders('POST', path, body, config), body });
    const json = await res.json();
    return json.code === '0' ? algos : [];
};

function formatCandles(apiCandles: any[]): CandleData[] {
  if (!apiCandles || !Array.isArray(apiCandles)) return [];
  return apiCandles.map((c: string[]) => ({ ts: c[0], o: c[1], h: c[2], l: c[3], c: c[4], vol: c[5] })).reverse(); 
}

function generateMockMarketData(): MarketDataCollection {
  const now = Date.now();
  const result: any = {};
  Object.keys(COIN_CONFIG).forEach(coin => {
      const config = COIN_CONFIG[coin];
      const basePrice = coin === 'BTC' ? 65000 : 3250;
      const currentPrice = basePrice + Math.sin(now / 10000) * (basePrice * 0.01);
      const generateCandles = (count: number, intervalMs: number) => {
        const candles: CandleData[] = [];
        let price = currentPrice;
        for (let i = 0; i < count; i++) {
          const ts = (now - i * intervalMs).toString();
          candles.push({ ts, o: price.toFixed(2), h: (price*1.01).toFixed(2), l: (price*0.99).toFixed(2), c: price.toFixed(2), vol: "100" });
        }
        return enrichCandlesWithEMA(candles.reverse());
      };
      result[coin] = { 
        ticker: { ...MOCK_TICKER, instId: config.instId, last: currentPrice.toFixed(2), ts: now.toString() }, 
        candles1H: generateCandles(100, 3600000), 
        candles3m: generateCandles(300, 180000), 
        fundingRate: "0.0001", 
        openInterest: "50000", 
        orderbook: { asks: [], bids: [] }, 
        trades: [] 
      };
  });
  return result;
}

function generateMockAccountData(): AccountContext {
  return { balance: { totalEq: "1000.00", availEq: "1000.00", uTime: Date.now().toString() }, positions: [] };
}
