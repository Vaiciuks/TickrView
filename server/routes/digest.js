import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchMarketNews } from '../lib/yahooFetch.js';
import { optionalAuth } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

let cachedDigest = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Broad financial keyword filter — matches titles relevant to markets/finance
const MARKET_RE = /\bstocks?\b|\bmarket|\bS&P\b|\bNasdaq|\bDow\b|\bshares\b|\brally|\bdrop(?:s|ped)?\b|\bfell\b|\brise[sd]?\b|\bsurg|\bplung|\bearnings|\bFed\b|\binflation|\bGDP\b|\bjobs?\s*(?:report|data|growth|market)|\bCPI\b|\btreasur|\boil\b|\bgold\b|\bbitcoin|\bcrypto|\bIPO\b|\bindex|\bbull\b|\bbear\b|\bselloff|\bsell-off|\brate\s*(?:cut|hike|hold)|\byield|\bbond|\bequit|\bfutures?\b|\bsector|\bupgrade|\bdowngrade|\banalyst|\bforecast|\brecession|\btariff|\btrade\s*(?:war|deal|deficit)|\bwall\s*street|\bretail\s*(?:sales|data)|\bunemployment|\bmerger|\bacquisition|\bbuyback|\bdividend|\brevenue|\bprofit|\bbanking|\blending|\binterest\s*rate|\bhedge\s*fund|\bETF|\bmutual\s*fund|\bcommodit|\bWTI|\bbrent|\bnatural\s*gas|\binvestor|\bportfolio|\bticker|\brout(?:ed)?\b|\btumbl/i;

// Reject obviously non-financial content
const JUNK_RE = /\bcelebrit|\bsports?\b|\bNFL\b|\bNBA\b|\bMLB\b|\bNHL\b|\bfootball\b|\bbasketball\b|\bsoccer\b|\brecipe|\bcooking\b|\bfashion\b|\bentertainment\b|\bmovie|\bTV\s*show|\bstreaming\b|\bNetflix\b(?!\s*(stock|share|earn|revenue|profit|surge|drop|rally))/i;

function filterMarketArticles(articles) {
  // First remove obvious non-financial junk
  const cleaned = articles.filter(a => !JUNK_RE.test(a.title));
  // Then prioritize articles that match financial keywords
  const matched = cleaned.filter(a => MARKET_RE.test(a.title));
  // Fall back to cleaned articles if not enough keyword matches
  return matched.length >= 5 ? matched : cleaned.length >= 5 ? cleaned : articles;
}

async function generateDigest() {
  const now = Date.now();
  if (cachedDigest && now - cacheTime < CACHE_DURATION) {
    return cachedDigest;
  }

  const articles = await fetchMarketNews();
  if (!articles || articles.length === 0) {
    return null;
  }

  const bestArticles = filterMarketArticles(articles);

  const headlines = bestArticles.map(a => `- ${a.title} (${a.publisher})`).join('\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const digest = {
      headline: bestArticles[0].title,
      bullets: bestArticles.slice(1, 8).map(a => a.title),
      timestamp: Math.floor(now / 1000),
    };
    cachedDigest = digest;
    cacheTime = now;
    return digest;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a financial markets editor writing today's market digest for a stock trading dashboard. EVERY bullet must be about financial markets, stocks, economics, or investing.

Today's headlines from financial news sources:
${headlines}

Respond in this exact JSON format (no markdown, no code fences, just raw JSON):
{
  "headline": "One-sentence summary of today's dominant market narrative (max 120 chars)",
  "bullets": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5", "Point 6", "Point 7", "Point 8"]
}

Rules:
- The headline MUST describe today's specific market action (e.g. "S&P 500 rallies 1.2% on strong jobs data" not "Markets remain volatile")
- Include 6-8 bullet points covering ONLY financial/market developments
- Each bullet should be 1-2 sentences, factual and specific with numbers/percentages when available
- Prioritize in order: major index moves (S&P 500, Nasdaq, Dow), big individual stock movers and why, Fed/central bank actions, macro data (jobs, CPI, GDP), earnings results, sector rotation, commodities (oil, gold), crypto
- STRICTLY IGNORE any headline about: sports, entertainment, celebrities, weather, lifestyle, politics unrelated to markets, technology products (unless it moves a stock), health/medical (unless pharma stock), crime, social media drama
- If a headline is borderline, only include it if there is a clear stock/market impact
- Do NOT include generic advice, opinions, or forward-looking predictions
- Do NOT pad with filler — if only 6 market-relevant points exist, return 6 bullets, not 8`
      }],
    });

    const text = response.content[0].text.trim();
    const digest = JSON.parse(text);
    digest.timestamp = Math.floor(now / 1000);

    cachedDigest = digest;
    cacheTime = now;
    return digest;
  } catch (err) {
    console.error('Digest generation error:', err.message);
    const digest = {
      headline: bestArticles[0].title,
      bullets: bestArticles.slice(1, 8).map(a => a.title),
      timestamp: Math.floor(now / 1000),
    };
    cachedDigest = digest;
    cacheTime = now;
    return digest;
  }
}

async function checkPremium(req) {
  if (!req.user) return false;
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: req.headers.authorization } } }
    );
    const { data } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', req.user.id)
      .single();
    return data?.tier === 'premium';
  } catch {
    return false;
  }
}

router.get('/', optionalAuth, withCache(300), async (req, res, next) => {
  try {
    const premium = await checkPremium(req);

    if (!premium) {
      // Free tier: return filtered market-relevant headlines without AI summary
      const articles = await fetchMarketNews();
      if (!articles || articles.length === 0) {
        return res.json({ digest: null });
      }
      const filtered = filterMarketArticles(articles);
      const digest = {
        headline: filtered[0].title,
        bullets: filtered.slice(1, 8).map(a => a.title),
        timestamp: Math.floor(Date.now() / 1000),
      };
      return res.json({ digest });
    }

    // Premium: full AI digest
    const digest = await generateDigest();
    if (!digest) {
      return res.json({ digest: null });
    }
    res.json({ digest });
  } catch (error) {
    next(error);
  }
});

export default router;
