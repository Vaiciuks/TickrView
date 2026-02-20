import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchBatchQuotes } from '../lib/yahooFetch.js';

const router = Router();

// Major futures contracts tracked on Yahoo Finance
const FUTURES_SYMBOLS = [
  // Index futures
  'ES=F',   // S&P 500 E-mini
  'NQ=F',   // Nasdaq 100 E-mini
  'YM=F',   // Dow Jones E-mini
  'RTY=F',  // Russell 2000 E-mini
  // Energy
  'CL=F',   // Crude Oil WTI
  'BZ=F',   // Brent Crude Oil
  'NG=F',   // Natural Gas
  'RB=F',   // RBOB Gasoline
  'HO=F',   // Heating Oil
  // Metals
  'GC=F',   // Gold
  'SI=F',   // Silver
  'HG=F',   // Copper
  'PL=F',   // Platinum
  'PA=F',   // Palladium
  // Bonds
  'ZB=F',   // US Treasury Bond
  'ZN=F',   // 10-Year T-Note
  'ZF=F',   // 5-Year T-Note
  // Agriculture
  'ZC=F',   // Corn
  'ZS=F',   // Soybeans
  'ZW=F',   // Wheat
  'KC=F',   // Coffee
  'CC=F',   // Cocoa
  'SB=F',   // Sugar
  'CT=F',   // Cotton
  'OJ=F',   // Orange Juice
  'LE=F',   // Live Cattle
  'HE=F',   // Lean Hogs
  'LBS=F',  // Lumber
  // Volatility
  '^VIX',   // CBOE Volatility Index
  // Crypto
  'BTC=F',  // Bitcoin CME Futures
  'ETH=F',  // Ethereum CME Futures
];

router.get('/', withCache(5), async (req, res, next) => {
  try {
    const quotesMap = await fetchBatchQuotes(FUTURES_SYMBOLS);

    const stocks = FUTURES_SYMBOLS
      .filter(sym => quotesMap.has(sym))
      .map(sym => {
        const q = quotesMap.get(sym);
        return {
          symbol: sym,
          name: q.shortName || sym,
          price: q.price,
          change: q.change,
          changePercent: q.changePercent,
          volume: q.volume,
          marketCap: null,
          extPrice: q.extPrice,
          extChange: q.extChange,
          extChangePercent: q.extChangePercent,
          extMarketState: q.extMarketState,
        };
      })
      .filter(s => s.price != null);

    res.json({
      count: stocks.length,
      timestamp: new Date().toISOString(),
      stocks,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
