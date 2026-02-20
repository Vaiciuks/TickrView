import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchBatchQuotes } from '../lib/yahooFetch.js';

const router = Router();

// Top cryptocurrencies (Yahoo Finance USD pairs)
const CRYPTO_SYMBOLS = [
  'BTC-USD',   // Bitcoin
  'ETH-USD',   // Ethereum
  'SOL-USD',   // Solana
  'XRP-USD',   // Ripple
  'ADA-USD',   // Cardano
  'DOGE-USD',  // Dogecoin
];

router.get('/', withCache(15), async (req, res, next) => {
  try {
    const quotesMap = await fetchBatchQuotes(CRYPTO_SYMBOLS);

    const stocks = CRYPTO_SYMBOLS
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
          marketCap: q.marketCap,
          extPrice: null,
          extChange: null,
          extChangePercent: null,
          extMarketState: null,
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
