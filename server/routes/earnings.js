import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { SECTORS } from './heatmap.js';
import { yahooFetchRaw } from '../lib/yahooCrumb.js';
import { fetchBatchQuotes } from '../lib/yahooFetch.js';

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

// Fetch Finnhub earnings calendar for a date range
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

// Fetch earnings from Yahoo Finance screener by date range (returns stocks WITH enrichment data)
async function fetchYahooEarnings(fromDate, toDate, offset = 0) {
  try {
    const fromTs = Math.floor(new Date(fromDate).getTime() / 1000);
    const toTs = Math.floor(new Date(toDate).getTime() / 1000);

    const body = JSON.stringify({
      size: 250,
      offset,
      sortField: 'intradaymarketcap',
      sortType: 'DESC',
      quoteType: 'EQUITY',
      query: {
        operator: 'AND',
        operands: [
          { operator: 'BTWN', operands: ['earningsdate', fromTs, toTs] },
          { operator: 'EQ', operands: ['region', 'us'] },
        ],
      },
    });

    const res = await yahooFetchRaw('https://query2.finance.yahoo.com/v1/finance/screener', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.finance?.result?.[0]?.quotes || [];
  } catch {
    return [];
  }
}

// Fetch stocks from a Yahoo predefined screener (supplemental earnings discovery + enrichment)
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

    // Midpoint to split Yahoo screener into two date ranges for better coverage
    const mid = new Date();
    mid.setDate(mid.getDate() + 14);
    const midStr = mid.toISOString().split('T')[0];

    // Fetch ALL sources in parallel:
    // 1. Finnhub calendar (comprehensive but free tier limited)
    // 2. Yahoo earnings screener (2 date ranges × 2 pages = up to 1000 stocks)
    // 3. Yahoo predefined screeners (popular stocks — many have upcoming earnings dates)
    const [
      finnhubResult,
      yahooA1, yahooA2, yahooB1, yahooB2,
      actives, gainers, losers, growth, undervalued,
    ] = await Promise.allSettled([
      fetchFinnhubCalendar(fromStr, toStr),
      fetchYahooEarnings(fromStr, midStr, 0),
      fetchYahooEarnings(fromStr, midStr, 250),
      fetchYahooEarnings(midStr, toStr, 0),
      fetchYahooEarnings(midStr, toStr, 250),
      fetchScreener('most_actives', 200),
      fetchScreener('day_gainers', 100),
      fetchScreener('day_losers', 100),
      fetchScreener('growth_technology_stocks', 100),
      fetchScreener('undervalued_large_caps', 100),
    ]);

    // Build Yahoo enrichment map from ALL Yahoo sources
    const yahooMap = new Map();
    const earningsQuotes = [yahooA1, yahooA2, yahooB1, yahooB2]
      .map(r => r.status === 'fulfilled' ? r.value : [])
      .flat();
    const screenerQuotes = [actives, gainers, losers, growth, undervalued]
      .map(r => r.status === 'fulfilled' ? r.value : [])
      .flat();
    const allYahooQuotes = [...earningsQuotes, ...screenerQuotes];

    for (const q of allYahooQuotes) {
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

    // Start with Finnhub calendar
    const earnings = {};
    const seen = new Set();
    const finnhubData = finnhubResult.status === 'fulfilled' ? finnhubResult.value : [];

    // Collect unenriched Finnhub symbols for batch quote fallback
    const unenrichedSymbols = [];

    for (const entry of finnhubData) {
      if (!entry.symbol || !entry.date) continue;
      // Only US stocks (skip foreign tickers with dots unless BRK.B style)
      if (entry.symbol.includes('.') && !entry.symbol.match(/^[A-Z]+\.[A-Z]$/)) continue;

      const dateKey = entry.date;
      if (seen.has(`${entry.symbol}-${dateKey}`)) continue;
      seen.add(`${entry.symbol}-${dateKey}`);

      const yahoo = yahooMap.get(entry.symbol);
      if (!yahoo) unenrichedSymbols.push(entry.symbol);

      if (!earnings[dateKey]) earnings[dateKey] = [];
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

    // Add Yahoo-only stocks that Finnhub missed (from earnings screener AND predefined screeners)
    for (const [symbol, yahoo] of yahooMap) {
      if (!yahoo.earningsTs) continue;
      const dateKey = new Date(yahoo.earningsTs * 1000).toISOString().split('T')[0];
      if (seen.has(`${symbol}-${dateKey}`)) continue;
      // Only include if the date falls within our range
      if (dateKey < fromStr || dateKey > toStr) continue;
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

    // Batch-fetch quotes for Finnhub stocks that Yahoo didn't cover
    if (unenrichedSymbols.length > 0) {
      try {
        const unique = [...new Set(unenrichedSymbols)];
        const batchQuotes = await fetchBatchQuotes(unique);
        const quoteMap = new Map();
        for (const q of batchQuotes) {
          if (q.symbol) quoteMap.set(q.symbol, q);
        }
        // Backfill missing data in earnings entries
        for (const dateKey of Object.keys(earnings)) {
          for (const stock of earnings[dateKey]) {
            if (stock.price) continue; // already enriched
            const q = quoteMap.get(stock.symbol);
            if (!q) continue;
            stock.name = q.shortName || q.longName || stock.name;
            stock.price = q.regularMarketPrice ?? null;
            stock.changePercent = q.regularMarketChangePercent ?? null;
            stock.marketCap = q.marketCap ?? null;
          }
        }
      } catch {
        // Non-critical — stocks just show without price data
      }
    }

    // Remove stocks with no price data (not useful to display) and sort by market cap
    for (const dateKey of Object.keys(earnings)) {
      earnings[dateKey] = earnings[dateKey]
        .filter(s => s.price != null)
        .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
      if (earnings[dateKey].length === 0) delete earnings[dateKey];
    }

    const totalStocks = Object.values(earnings).reduce((s, arr) => s + arr.length, 0);
    console.log(`[earnings] Finnhub: ${finnhubData.length}, Yahoo earnings: ${earningsQuotes.length}, Yahoo screeners: ${screenerQuotes.length}, total: ${totalStocks} across ${Object.keys(earnings).length} dates`);

    res.json({ earnings, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

export default router;
