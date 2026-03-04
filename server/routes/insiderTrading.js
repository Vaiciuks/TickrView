import { Router } from 'express';
import { withCache } from '../middleware/cache.js';

const router = Router();
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

function getApiKey() {
  return process.env.FINNHUB_API_KEY || '';
}

// Transaction codes: P = Purchase, S = Sale, A = Award/Grant, M = Option Exercise
// We only show P and S for clarity
const TRADE_CODES = { P: 'P - Purchase', S: 'S - Sale' };

async function fetchInsiderTransactions(symbol) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('FINNHUB_API_KEY not configured');

  const url = `${FINNHUB_BASE}/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (res.status === 429) throw new Error('Finnhub rate limit reached');
  if (!res.ok) throw new Error(`Finnhub returned ${res.status}`);

  const json = await res.json();
  return (json.data || [])
    .filter(t => t.transactionCode === 'P' || t.transactionCode === 'S')
    .map(t => ({
      filingDate: t.filingDate || '',
      tradeDate: t.transactionDate || '',
      symbol: t.symbol || symbol.toUpperCase(),
      companyName: '',
      insiderName: t.name || 'Unknown',
      title: '',
      tradeType: TRADE_CODES[t.transactionCode] || t.transactionCode,
      price: t.transactionPrice || 0,
      qty: Math.abs(t.change || 0),
      owned: t.share || 0,
      deltaOwn: '',
      value: Math.abs((t.transactionPrice || 0) * (t.change || 0)),
      isBuy: t.transactionCode === 'P',
    }));
}

// Popular stocks to scan for bulk insider activity
const POPULAR_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'UNH',
  'XOM', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'BAC',
  'COST', 'PEP', 'KO', 'AVGO', 'AMD', 'NFLX', 'CRM', 'DIS', 'PLTR', 'COIN',
];

// Bulk recent insider activity across popular stocks
router.get('/', withCache(300), async (req, res, next) => {
  try {
    const results = await Promise.allSettled(
      POPULAR_SYMBOLS.map(sym => fetchInsiderTransactions(sym))
    );

    const allTrades = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        // Take only recent trades (last 30 days) per symbol
        const recent = r.value.filter(t => {
          if (!t.filingDate) return false;
          const filed = new Date(t.filingDate);
          const daysAgo = (Date.now() - filed.getTime()) / (1000 * 60 * 60 * 24);
          return daysAgo <= 30;
        });
        allTrades.push(...recent.slice(0, 10));
      }
    }

    // Sort by filing date descending (newest first)
    allTrades.sort((a, b) => new Date(b.filingDate || 0).getTime() - new Date(a.filingDate || 0).getTime());

    res.json({
      count: allTrades.length,
      timestamp: new Date().toISOString(),
      trades: allTrades.slice(0, 100),
    });
  } catch (error) {
    next(error);
  }
});

// Per-stock insider trades
router.get('/:symbol', withCache(300), async (req, res, next) => {
  try {
    const { symbol } = req.params;
    if (!/^[A-Z0-9.\-]{1,10}$/i.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }
    const trades = await fetchInsiderTransactions(symbol);
    res.json({
      symbol: symbol.toUpperCase(),
      count: trades.length,
      timestamp: new Date().toISOString(),
      trades: trades.slice(0, 50),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
