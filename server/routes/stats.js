import { Router } from 'express';
import { withCache } from '../middleware/cache.js';

import { yahooFetchRaw, USER_AGENT } from '../lib/yahooCrumb.js';

const router = Router();
const YAHOO_CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart';
const SA_URL = 'https://api.stockanalysis.com/api/symbol/s';

async function fetchStockAnalysis(symbol) {
  try {
    const res = await fetch(`${SA_URL}/${encodeURIComponent(symbol.toUpperCase())}/overview`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

async function fetchChartMeta(symbol) {
  try {
    const res = await yahooFetchRaw(
      `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=true`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp || [];

    // Get yesterday's close from the second-to-last trading day
    let prevClose = null;
    if (timestamps.length >= 2 && quotes?.close) {
      for (let i = quotes.close.length - 2; i >= 0; i--) {
        if (quotes.close[i] != null) { prevClose = quotes.close[i]; break; }
      }
    }

    return {
      open: meta.regularMarketDayHigh ? quotes?.open?.[quotes.open.length - 1] ?? null : null,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      prevClose: prevClose ?? meta.chartPreviousClose,
      volume: meta.regularMarketVolume,
      price: meta.regularMarketPrice,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    };
  } catch {
    return null;
  }
}

function parseNumeric(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[,$%]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

function parseLargeNumber(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/[,$]/g, '');
  const match = cleaned.match(/([\d.]+)\s*([TBMK])?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'T') return num * 1e12;
  if (suffix === 'B') return num * 1e9;
  if (suffix === 'M') return num * 1e6;
  if (suffix === 'K') return num * 1e3;
  return num;
}

router.get('/:symbol', withCache(30), async (req, res, next) => {
  try {
    const { symbol } = req.params;
    if (!/^[\^A-Z0-9.\-=]{1,12}$/i.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const [sa, chart] = await Promise.all([
      fetchStockAnalysis(symbol),
      fetchChartMeta(symbol),
    ]);

    if (!sa && !chart) {
      return res.status(404).json({ error: 'No stats data found' });
    }

    // Parse dividend string like "$1.04 (0.41%)"
    let dividendRate = null, dividendYield = null;
    if (sa?.dividend && typeof sa.dividend === 'string') {
      const divMatch = sa.dividend.match(/\$([\d.]+)\s*\(([\d.]+)%\)/);
      if (divMatch) {
        dividendRate = parseFloat(divMatch[1]);
        dividendYield = parseFloat(divMatch[2]);
      }
    }

    // Parse target like "298.75 (+16.8%)"
    let priceTarget = null;
    if (sa?.target && typeof sa.target === 'string') {
      const targetMatch = sa.target.match(/([\d.]+)/);
      if (targetMatch) priceTarget = parseFloat(targetMatch[1]);
    }

    // Get sector/industry from infoTable
    let sector = null, industry = null;
    if (sa?.infoTable) {
      for (const row of sa.infoTable) {
        if (row.t === 'Sector') sector = row.v;
        if (row.t === 'Industry') industry = row.v;
      }
    }

    const stats = {
      // Real-time from Yahoo chart
      open: chart?.open ?? null,
      high: chart?.high ?? null,
      low: chart?.low ?? null,
      prevClose: chart?.prevClose ?? null,
      volume: chart?.volume ?? null,
      fiftyTwoWeekHigh: chart?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: chart?.fiftyTwoWeekLow ?? null,

      // Fundamentals from Stockanalysis
      marketCap: parseLargeNumber(sa?.marketCap) ?? null,
      peRatio: parseNumeric(sa?.peRatio) ?? null,
      forwardPE: parseNumeric(sa?.forwardPE) ?? null,
      eps: parseNumeric(sa?.eps) ?? null,
      revenue: parseLargeNumber(sa?.revenue) ?? null,
      netIncome: parseLargeNumber(sa?.netIncome) ?? null,
      sharesOut: parseLargeNumber(sa?.sharesOut) ?? null,
      beta: parseNumeric(sa?.beta) ?? null,
      dividendRate,
      dividendYield,
      priceTarget,
      analysts: sa?.analysts ?? null,
      earningsDate: sa?.earningsDate ?? null,
      sector,
      industry,
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
