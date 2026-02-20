import { Router } from 'express';
import { withCache } from '../middleware/cache.js';

const router = Router();
const TV_SCAN_URL = 'https://scanner.tradingview.com/america/scan';

function buildBody(pfx, sortOrder, count = 20) {
  return {
    columns: [
      'name',
      'description',
      'close',
      `${pfx}_close`,
      `${pfx}_change`,
      `${pfx}_change_abs`,
      `${pfx}_volume`,
      'market_cap_basic',
    ],
    filter: [
      { left: `${pfx}_change`, operation: 'nempty' },
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'not_in_range', right: ['preferred'] },
      { left: `${pfx}_volume`, operation: 'greater', right: 50000 },
    ],
    options: { lang: 'en' },
    range: [0, count],
    sort: { sortBy: `${pfx}_change`, sortOrder },
  };
}

function parseStocks(data) {
  if (!data?.data) return [];
  return data.data.map(item => {
    const d = item.d;
    // name is "EXCHANGE:SYMBOL"
    const symbol = (item.s || '').split(':')[1] || (item.s || '');
    return {
      symbol,
      name: d[1] || symbol,
      close: d[2],
      price: d[3],
      change: d[4],
      changeAbs: d[5],
      volume: d[6],
      marketCap: d[7],
    };
  });
}

async function fetchTV(body) {
  const res = await fetch(TV_SCAN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`TradingView ${res.status}`);
  return res.json();
}

router.get('/', withCache(15), async (req, res, next) => {
  try {
    const session = req.query.session === 'pre' ? 'pre' : 'post';
    const pfx = session === 'pre' ? 'premarket' : 'postmarket';

    const [gainersRaw, losersRaw] = await Promise.all([
      fetchTV(buildBody(pfx, 'desc')),
      fetchTV(buildBody(pfx, 'asc')),
    ]);

    const gainers = parseStocks(gainersRaw);
    const losers = parseStocks(losersRaw);

    console.log(`[movers] ${session}: ${gainers.length} gainers, ${losers.length} losers`);

    res.json({
      session,
      gainers,
      losers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
