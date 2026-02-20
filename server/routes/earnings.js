import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { SECTORS } from './heatmap.js';

import { yahooFetchRaw } from '../lib/yahooCrumb.js';

const router = Router();
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const SCREENER_URL = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved';

function getApiKey() {
  return process.env.FINNHUB_API_KEY || '';
}

// Build a symbol → sector name lookup from the heatmap SECTORS data
const sectorLookup = new Map();
for (const sector of SECTORS) {
  for (const ind of sector.industries) {
    for (const st of ind.stocks) {
      sectorLookup.set(st.symbol, sector.name);
    }
  }
}

// Fetch Finnhub earnings calendar for a date range (all companies)
async function fetchFinnhubCalendar(from, to) {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  try {
    const url = `${FINNHUB_BASE}/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.earningsCalendar || [];
  } catch {
    return [];
  }
}

// Fetch stocks from a Yahoo screener (for price/market cap enrichment)
async function fetchScreener(scrId, count = 100) {
  try {
    const res = await yahooFetchRaw(`${SCREENER_URL}?scrIds=${scrId}&count=${count}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.finance?.result?.[0]?.quotes || [];
  } catch {
    return [];
  }
}

// Extract earnings timestamp from Yahoo's format (number or array)
function extractTs(val) {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') return val;
  if (Array.isArray(val) && val.length > 0) return val[0];
  return null;
}

router.get('/', withCache(120), async (req, res, next) => {
  try {
    // Date range: 4 weeks back to 8 weeks forward
    const from = new Date();
    from.setDate(from.getDate() - 28);
    const to = new Date();
    to.setDate(to.getDate() + 56);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    // Fetch Finnhub calendar + Yahoo screeners in parallel
    const [finnhubResult, actives, gainers, losers, growth, undervalued] = await Promise.allSettled([
      fetchFinnhubCalendar(fromStr, toStr),
      fetchScreener('most_actives', 200),
      fetchScreener('day_gainers', 100),
      fetchScreener('day_losers', 100),
      fetchScreener('growth_technology_stocks', 100),
      fetchScreener('undervalued_large_caps', 100),
    ]);

    // Build Yahoo enrichment map: symbol → { price, changePercent, marketCap, ... }
    const yahooMap = new Map();
    const allQuotes = [actives, gainers, losers, growth, undervalued]
      .map(r => r.status === 'fulfilled' ? r.value : [])
      .flat();

    for (const q of allQuotes) {
      if (!q.symbol || yahooMap.has(q.symbol)) continue;
      yahooMap.set(q.symbol, {
        price: q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent,
        marketCap: q.marketCap,
        name: q.shortName || q.longName || q.symbol,
        sector: sectorLookup.get(q.symbol) || q.sector || 'Other',
        epsEstimate: q.epsCurrentYear ?? q.epsForward ?? null,
        epsTTM: q.epsTrailingTwelveMonths ?? null,
        earningsTs: extractTs(q.earningsTimestamp) || extractTs(q.earningsTimestampStart),
      });
    }

    // Start with Finnhub calendar (comprehensive)
    const earnings = {};
    const seen = new Set();
    const finnhubData = finnhubResult.status === 'fulfilled' ? finnhubResult.value : [];

    for (const entry of finnhubData) {
      if (!entry.symbol || !entry.date) continue;
      // Only US stocks (skip entries with dots like foreign tickers unless common like BRK.B)
      if (entry.symbol.includes('.') && !entry.symbol.match(/^[A-Z]+\.[A-Z]$/)) continue;

      const dateKey = entry.date;
      const yahoo = yahooMap.get(entry.symbol);

      if (!earnings[dateKey]) earnings[dateKey] = [];
      if (seen.has(`${entry.symbol}-${dateKey}`)) continue;
      seen.add(`${entry.symbol}-${dateKey}`);

      earnings[dateKey].push({
        symbol: entry.symbol,
        name: yahoo?.name || entry.symbol,
        price: yahoo?.price || null,
        changePercent: yahoo?.changePercent || null,
        marketCap: yahoo?.marketCap || null,
        sector: yahoo?.sector || sectorLookup.get(entry.symbol) || 'Other',
        epsEstimate: entry.epsEstimate ?? yahoo?.epsEstimate ?? null,
        epsTTM: yahoo?.epsTTM ?? null,
      });
    }

    // Also add Yahoo-only stocks that Finnhub missed (with earningsTimestamp)
    for (const [symbol, yahoo] of yahooMap) {
      if (!yahoo.earningsTs) continue;
      const dateKey = new Date(yahoo.earningsTs * 1000).toISOString().split('T')[0];
      if (seen.has(`${symbol}-${dateKey}`)) continue;
      seen.add(`${symbol}-${dateKey}`);

      if (!earnings[dateKey]) earnings[dateKey] = [];
      earnings[dateKey].push({
        symbol,
        name: yahoo.name,
        price: yahoo.price,
        changePercent: yahoo.changePercent,
        marketCap: yahoo.marketCap,
        sector: yahoo.sector,
        epsEstimate: yahoo.epsEstimate,
        epsTTM: yahoo.epsTTM,
      });
    }

    // Sort each day by market cap (stocks without marketCap go to end)
    for (const dateKey of Object.keys(earnings)) {
      earnings[dateKey].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    }

    const totalStocks = Object.values(earnings).reduce((s, arr) => s + arr.length, 0);
    console.log(`[earnings] Finnhub: ${finnhubData.length} entries, Yahoo: ${yahooMap.size} enrichment stocks, ${totalStocks} total across ${Object.keys(earnings).length} dates`);

    res.json({ earnings, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

export default router;
