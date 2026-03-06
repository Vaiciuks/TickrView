import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { yahooAuthFetch } from '../lib/yahooCrumb.js';

const router = Router();

const SYMBOLS = [
  'GME', 'AMC', 'CVNA', 'UPST', 'BYND', 'SPCE', 'MARA', 'RIOT',
  'FFIE', 'MULN', 'GOEV', 'LCID', 'RIVN', 'NKLA', 'PLUG', 'FCEL', 'BLNK',
  'SOFI', 'PLTR', 'NIO', 'SNAP', 'ROKU', 'HOOD', 'COIN', 'SQ', 'PYPL',
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'INTC',
  'DIS', 'BA', 'F', 'AAL', 'UAL', 'DAL', 'CCL', 'NCLH', 'RCL',
  'BABA', 'JD', 'PDD', 'XPEV', 'LI', 'ZM', 'DOCU', 'DASH', 'LYFT',
];

// Use quoteSummary endpoint which returns short interest in defaultKeyStatistics
async function fetchShortForSymbol(symbol) {
  try {
    const data = await yahooAuthFetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,price`
    );
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;

    const stats = result.defaultKeyStatistics || {};
    const price = result.price || {};

    const shortPctFloat = stats.shortPercentOfFloat?.raw ?? null;
    const shortRatio = stats.shortRatio?.raw ?? null;
    const sharesShort = stats.sharesShort?.raw ?? null;

    // Skip if no short data at all
    if (shortPctFloat == null && shortRatio == null && sharesShort == null) return null;

    return {
      symbol,
      name: price.shortName || symbol,
      price: price.regularMarketPrice?.raw ?? null,
      changePercent: price.regularMarketChangePercent?.raw != null
        ? price.regularMarketChangePercent.raw * 100
        : null,
      volume: price.regularMarketVolume?.raw ?? null,
      marketCap: price.marketCap?.raw ?? null,
      sharesShort,
      shortRatio,
      shortPercentOfFloat: shortPctFloat,
      shortPercentOfShares: stats.sharesPercentSharesOut?.raw ?? null,
      dateShortInterest: stats.dateShortInterest?.raw ?? null,
    };
  } catch {
    return null;
  }
}

// Bulk: popular stocks sorted by short % float
router.get('/', withCache(300), async (req, res, next) => {
  try {
    // Fetch in batches of 5 with delay to avoid Yahoo rate limits
    const results = [];
    for (let i = 0; i < SYMBOLS.length; i += 5) {
      const batch = SYMBOLS.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(sym => fetchShortForSymbol(sym))
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }
      // Small delay between batches to avoid 429s
      if (i + 5 < SYMBOLS.length) await new Promise(r => setTimeout(r, 300));
    }

    results.sort((a, b) => (b.shortPercentOfFloat || 0) - (a.shortPercentOfFloat || 0));

    res.json({
      count: results.length,
      timestamp: new Date().toISOString(),
      stocks: results,
    });
  } catch (error) {
    next(error);
  }
});

// Per-symbol short interest
router.get('/:symbol', withCache(300), async (req, res, next) => {
  try {
    const { symbol } = req.params;
    if (!/^[A-Z0-9.\-]{1,10}$/i.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }
    const data = await fetchShortForSymbol(symbol.toUpperCase());
    if (!data) return res.status(404).json({ error: 'No short interest data' });

    res.json({
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
