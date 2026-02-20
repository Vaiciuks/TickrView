import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchBatchQuotes } from '../lib/yahooFetch.js';

const router = Router();

// Batch quote endpoint — fetches up to 150 symbols in a single Yahoo API call
// Used by the frontend to replace 30+ individual /api/quote/:symbol calls
router.get('/', withCache(2), async (req, res, next) => {
  try {
    const symbolsParam = req.query.symbols;
    if (!symbolsParam) {
      return res.status(400).json({ error: 'Missing symbols parameter' });
    }

    const symbols = symbolsParam.split(',').filter(s => /^[\^A-Z0-9.\-=]{1,12}$/i.test(s)).slice(0, 150);
    if (symbols.length === 0) {
      return res.status(400).json({ error: 'No valid symbols' });
    }

    const quotesMap = await fetchBatchQuotes(symbols);

    const quotes = {};
    for (const [sym, q] of quotesMap) {
      quotes[sym] = {
        symbol: sym,
        name: q.shortName || sym,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
        marketCap: q.marketCap,
        extPrice: q.extPrice,
        extChange: q.extChange,
        extChangePercent: q.extChangePercent,
        extMarketState: q.extMarketState,
      };
    }

    res.json(quotes);
  } catch (error) {
    next(error);
  }
});

export default router;
