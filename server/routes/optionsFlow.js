import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { yahooAuthFetch } from '../lib/yahooCrumb.js';

const router = Router();
const YAHOO_OPTIONS_URL = 'https://query2.finance.yahoo.com/v7/finance/options';

async function fetchOptionsChain(symbol) {
  try {
    const data = await yahooAuthFetch(`${YAHOO_OPTIONS_URL}/${encodeURIComponent(symbol)}`);
    const result = data.optionChain?.result?.[0];
    if (!result) return null;

    return {
      quote: result.quote || {},
      expirations: result.expirationDates || [],
      calls: result.options?.[0]?.calls || [],
      puts: result.options?.[0]?.puts || [],
    };
  } catch {
    return null;
  }
}

function detectUnusualActivity(calls, puts) {
  const unusual = [];
  const allOptions = [
    ...calls.map(o => ({ ...o, type: 'CALL' })),
    ...puts.map(o => ({ ...o, type: 'PUT' })),
  ];

  for (const opt of allOptions) {
    const vol = opt.volume || 0;
    const oi = opt.openInterest || 1;
    const ratio = vol / oi;
    const premium = vol * (opt.lastPrice || 0) * 100;

    // Tighter criteria: high vol/OI ratio with meaningful volume, or very large premium
    if ((ratio > 3 && vol > 500) || premium > 500_000) {
      unusual.push({
        type: opt.type,
        strike: opt.strike,
        expiration: opt.expiration,
        lastPrice: opt.lastPrice,
        bid: opt.bid,
        ask: opt.ask,
        volume: vol,
        openInterest: oi,
        impliedVolatility: opt.impliedVolatility,
        volumeOIRatio: parseFloat(ratio.toFixed(2)),
        totalPremium: Math.round(premium),
        inTheMoney: opt.inTheMoney || false,
        sentiment: opt.type === 'CALL' ? 'bullish' : 'bearish',
      });
    }
  }

  unusual.sort((a, b) => b.totalPremium - a.totalPremium);

  // Return full list with metadata (caller can slice for display)
  const totalUnusualPremium = unusual.reduce((sum, u) => sum + u.totalPremium, 0);
  return { items: unusual, totalUnusualPremium, totalCount: unusual.length };
}

function buildSummary(calls, puts) {
  const totalCallVol = calls.reduce((s, o) => s + (o.volume || 0), 0);
  const totalPutVol = puts.reduce((s, o) => s + (o.volume || 0), 0);
  const callPremium = calls.reduce((s, o) => s + (o.volume || 0) * (o.lastPrice || 0) * 100, 0);
  const putPremium = puts.reduce((s, o) => s + (o.volume || 0) * (o.lastPrice || 0) * 100, 0);
  const putCallRatio = totalCallVol > 0 ? parseFloat((totalPutVol / totalCallVol).toFixed(2)) : null;
  const totalPremium = Math.round(callPremium + putPremium);

  return {
    totalCallVolume: totalCallVol,
    totalPutVolume: totalPutVol,
    putCallRatio,
    totalCallPremium: Math.round(callPremium),
    totalPutPremium: Math.round(putPremium),
    netPremium: Math.round(callPremium - putPremium),
    totalPremium,
    sentiment: callPremium > putPremium ? 'bullish' : 'bearish',
  };
}

// Per-symbol options flow
router.get('/:symbol', withCache(60), async (req, res, next) => {
  try {
    const { symbol } = req.params;
    if (!/^[A-Z0-9.\-]{1,10}$/i.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const chain = await fetchOptionsChain(symbol);
    if (!chain) return res.status(404).json({ error: 'No options data' });

    const { items: unusual, totalUnusualPremium, totalCount } = detectUnusualActivity(chain.calls, chain.puts);
    const summary = buildSummary(chain.calls, chain.puts);

    res.json({
      symbol: symbol.toUpperCase(),
      stockPrice: chain.quote.regularMarketPrice || 0,
      expirations: chain.expirations,
      summary,
      unusualCount: totalCount,
      unusualPremium: totalUnusualPremium,
      unusual: unusual.slice(0, 25),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Bulk scan popular symbols
router.get('/', withCache(300), async (req, res, next) => {
  try {
    const POPULAR = [
      'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD',
      'NFLX', 'COIN', 'PLTR', 'SOFI', 'BAC', 'JPM', 'XOM', 'INTC', 'DIS', 'NIO',
    ];

    // Fetch in batches of 5 to avoid Yahoo rate limits
    const allResults = [];
    for (let i = 0; i < POPULAR.length; i += 5) {
      const batch = POPULAR.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(async sym => {
          const chain = await fetchOptionsChain(sym);
          if (!chain) return null;
          const { items: unusual, totalUnusualPremium, totalCount } = detectUnusualActivity(chain.calls, chain.puts);
          const summary = buildSummary(chain.calls, chain.puts);

          return {
            symbol: sym,
            name: chain.quote.shortName || sym,
            stockPrice: chain.quote.regularMarketPrice || 0,
            changePercent: chain.quote.regularMarketChangePercent || 0,
            ...summary,
            unusualCount: totalCount,
            unusualPremium: totalUnusualPremium,
            topUnusual: unusual.slice(0, 3),
          };
        })
      );
      allResults.push(...batchResults);
      if (i + 5 < POPULAR.length) await new Promise(r => setTimeout(r, 300));
    }

    const stocks = allResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .sort((a, b) => b.totalPremium - a.totalPremium);

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
