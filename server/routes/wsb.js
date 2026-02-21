import { Router } from 'express';
import { withCache } from '../middleware/cache.js';

const router = Router();

const APEWISDOM_BASE = 'https://apewisdom.io/api/v1.0';

const VALID_FILTERS = ['all-stocks', 'wallstreetbets', 'stocks', 'investing'];

// Per-filter cache
const cache = new Map();
const CACHE_DURATION = 1800_000; // 30 minutes

function deriveSentiment(mentionChangePct, rankChange) {
  // Strong bullish: mentions up >50% OR rank jumped >100 spots
  if (mentionChangePct >= 50 || rankChange >= 100) return 'bullish';
  // Bullish: mentions up >10% or rank improved
  if (mentionChangePct >= 10 || rankChange >= 10) return 'bullish';
  // Bearish: mentions down significantly
  if (mentionChangePct <= -20 || rankChange <= -50) return 'bearish';
  if (mentionChangePct <= -5) return 'bearish';
  return 'neutral';
}

function sentimentScore(mentionChangePct, rankChange) {
  // -100 to +100 score
  const mentionFactor = Math.max(-100, Math.min(100, mentionChangePct));
  const rankFactor = Math.max(-100, Math.min(100, rankChange));
  return Math.round((mentionFactor * 0.6) + (rankFactor * 0.4));
}

async function fetchWsbData(filter = 'all-stocks') {
  const cached = cache.get(filter);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const res = await fetch(`${APEWISDOM_BASE}/filter/${filter}/page/1`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(`[wsb] ApeWisdom API returned ${res.status} for filter=${filter}`);
    throw new Error(`ApeWisdom API error: ${res.status}`);
  }

  const raw = await res.json();
  if (!raw?.results || !Array.isArray(raw.results)) {
    throw new Error('Unexpected ApeWisdom response');
  }

  const tickers = raw.results.map(item => {
    const rankPrev = item.rank_24h_ago || 0;
    const rankChange = rankPrev > 0 ? rankPrev - item.rank : 0;
    const mentionsPrev = item.mentions_24h_ago ?? item.mentions;
    const mentionChange = item.mentions - (mentionsPrev || 0);
    const mentionChangePct = mentionsPrev > 0
      ? ((item.mentions - mentionsPrev) / mentionsPrev) * 100
      : 0;
    const pctRounded = Math.round(mentionChangePct);

    return {
      rank: item.rank,
      ticker: (item.ticker || '').toUpperCase(),
      name: item.name || item.ticker,
      mentions: item.mentions || 0,
      upvotes: item.upvotes || 0,
      rankChange,
      mentionChange,
      mentionChangePct: pctRounded,
      sentiment: deriveSentiment(pctRounded, rankChange),
      sentimentScore: sentimentScore(pctRounded, rankChange),
    };
  });

  // Top movers — biggest positive rank jumps
  const topMovers = [...tickers]
    .filter(t => t.rankChange > 0)
    .sort((a, b) => b.rankChange - a.rankChange)
    .slice(0, 6);

  const result = {
    filter,
    count: tickers.length,
    timestamp: new Date().toISOString(),
    tickers,
    topMovers,
  };
  cache.set(filter, { data: result, timestamp: Date.now() });
  console.log(`[wsb] Loaded ${tickers.length} trending tickers from ApeWisdom (${filter})`);
  return result;
}

// GET /api/wsb?filter=wallstreetbets — trending tickers from Reddit
router.get('/', withCache(1800), async (req, res, next) => {
  try {
    const filter = VALID_FILTERS.includes(req.query.filter) ? req.query.filter : 'all-stocks';
    const result = await fetchWsbData(filter);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
