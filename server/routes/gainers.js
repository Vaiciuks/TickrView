import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { yahooFetchRaw } from '../lib/yahooCrumb.js';

const router = Router();

const YAHOO_SCREENER_URL = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved';

async function fetchDayGainers() {
  const url = `${YAHOO_SCREENER_URL}?scrIds=day_gainers&count=100`;
  const response = await yahooFetchRaw(url);

  if (!response.ok) {
    throw new Error(`Yahoo Finance API returned ${response.status}`);
  }

  const data = await response.json();
  return data.finance?.result?.[0]?.quotes || [];
}

router.get('/', withCache(15), async (req, res, next) => {
  try {
    const quotes = await fetchDayGainers();

    const gainers = quotes
      .filter(q => q.regularMarketChangePercent >= 5)
      .map(q => {
        // Only include extended-hours data when the market is actually
        // in pre/post state — avoids showing stale prices during regular hours.
        const state = (q.marketState || '').toUpperCase();
        let extPrice = null, extChange = null, extChangePercent = null, extMarketState = null;
        if ((state === 'POST' || state === 'POSTPOST' || state === 'CLOSED') && q.postMarketPrice) {
          extPrice = q.postMarketPrice;
          extChange = q.postMarketChange;
          extChangePercent = q.postMarketChangePercent;
          extMarketState = 'post';
        } else if (state === 'PRE' && q.preMarketPrice) {
          extPrice = q.preMarketPrice;
          extChange = q.preMarketChange;
          extChangePercent = q.preMarketChangePercent;
          extMarketState = 'pre';
        }
        return {
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          extPrice, extChange, extChangePercent, extMarketState,
          earningsDate: q.earningsTimestamp || q.earningsTimestampStart || null,
        };
      })
      .sort((a, b) => b.changePercent - a.changePercent);

    res.json({
      count: gainers.length,
      timestamp: new Date().toISOString(),
      stocks: gainers,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
