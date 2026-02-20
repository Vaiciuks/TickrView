import { Router } from 'express';
import { withCache } from '../middleware/cache.js';

import { yahooFetchRaw } from '../lib/yahooCrumb.js';

const router = Router();

const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';

router.get('/', withCache(60), async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) {
      return res.json({ results: [] });
    }

    const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`;
    const response = await yahooFetchRaw(url, {
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return res.json({ results: [] });
    }

    const data = await response.json();
    const results = (data.quotes || [])
      .filter(q => q.symbol && q.quoteType !== 'OPTION')
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType,
        exchange: q.exchDisp,
      }));

    res.json({ results });
  } catch {
    res.json({ results: [] });
  }
});

export default router;
