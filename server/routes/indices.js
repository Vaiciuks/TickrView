import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchBatchQuotes } from '../lib/yahooFetch.js';

const router = Router();

const INDICES_SYMBOLS = [
  // US
  '^GSPC',      // S&P 500
  '^DJI',       // Dow Jones Industrial Average
  '^IXIC',      // Nasdaq Composite
  '^RUT',       // Russell 2000
  '^VIX',       // CBOE Volatility Index
  '^NYA',       // NYSE Composite
  '^XOI',       // AMEX Oil Index
  // European
  '^FTSE',      // FTSE 100 (UK)
  '^GDAXI',     // DAX (Germany)
  '^FCHI',      // CAC 40 (France)
  '^STOXX50E',  // Euro Stoxx 50
  '^IBEX',      // IBEX 35 (Spain)
  // Asian
  '^N225',      // Nikkei 225 (Japan)
  '^HSI',       // Hang Seng (Hong Kong)
  '^000001.SS', // Shanghai Composite (China)
  '^KS11',      // KOSPI (South Korea)
  '^STI',       // Straits Times (Singapore)
  // Other
  '^GSPTSE',    // S&P/TSX Composite (Canada)
  '^BVSP',      // Bovespa (Brazil)
  '^AXJO',      // ASX 200 (Australia)
];

router.get('/', withCache(15), async (req, res, next) => {
  try {
    const quotesMap = await fetchBatchQuotes(INDICES_SYMBOLS);

    const stocks = INDICES_SYMBOLS
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
