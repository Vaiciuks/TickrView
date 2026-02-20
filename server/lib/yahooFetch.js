import { yahooFetchRaw, USER_AGENT } from './yahooCrumb.js';

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_QUOTE_URL = 'https://query2.finance.yahoo.com/v7/finance/quote';
const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const COINBASE_CANDLES_URL = 'https://api.exchange.coinbase.com/products';
const MAX_CONCURRENT = 5;
const MIN_DELAY_MS = 150; // Minimum ms between Yahoo requests to avoid 429s
const INTRADAY_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '1h']);

const etHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: 'numeric',
  hour12: false,
});

function isRegularHours(unixSeconds) {
  const parts = etHourFormatter.formatToParts(new Date(unixSeconds * 1000));
  const h = parseInt(parts.find(p => p.type === 'hour').value);
  const m = parseInt(parts.find(p => p.type === 'minute').value);
  const decimal = h + m / 60;
  return decimal >= 9.5 && decimal < 16;
}

// Clip extreme wicks caused by thin pre/post market liquidity
function clipExtremeWicks(candles) {
  if (candles.length < 10) return candles;
  const bodies = candles.map(c => Math.abs(c.close - c.open)).filter(b => b > 0).sort((a, b) => a - b);
  const medianBody = bodies[Math.floor(bodies.length / 2)] || 1;
  const maxWick = medianBody * 10;
  return candles.map(c => {
    const bodyHigh = Math.max(c.open, c.close);
    const bodyLow = Math.min(c.open, c.close);
    return {
      ...c,
      high: Math.min(c.high, bodyHigh + maxWick),
      low: Math.max(c.low, bodyLow - maxWick),
    };
  });
}

let activeRequests = 0;
let lastRequestTime = 0;
const queue = [];

function processQueue() {
  while (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_DELAY_MS) {
      setTimeout(processQueue, MIN_DELAY_MS - elapsed);
      return;
    }
    const { fn, resolve, reject } = queue.shift();
    activeRequests++;
    lastRequestTime = Date.now();
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeRequests--;
        processQueue();
      });
  }
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
}

export async function fetchChart(symbol, range, interval, includePrePost) {
  return enqueue(async () => {
    const params = new URLSearchParams({
      interval,
      range,
      includePrePost: includePrePost ? 'true' : 'false',
    });

    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params}`;
    const response = await yahooFetchRaw(url);

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp || [];
    const ohlc = result.indicators?.quote?.[0] || {};

    let candles = timestamps.map((t, i) => ({
      time: t,
      open: ohlc.open?.[i],
      high: ohlc.high?.[i],
      low: ohlc.low?.[i],
      close: ohlc.close?.[i],
      volume: ohlc.volume?.[i],
    })).filter(d => d.close != null);

    // Yahoo sometimes ignores includePrePost=false — filter server-side
    // Skip for crypto/forex (24/7 assets) — they don't have regular hours
    const is24h = symbol.endsWith('-USD') || symbol.endsWith('=X') || symbol.endsWith('=F');
    if (!includePrePost && INTRADAY_INTERVALS.has(interval) && !is24h) {
      candles = candles.filter(d => isRegularHours(d.time));
    }

    // Clip extreme wicks caused by thin pre/post market liquidity (stocks only)
    if (INTRADAY_INTERVALS.has(interval) && !is24h) {
      candles = clipExtremeWicks(candles);
    }

    return candles;
  });
}

export async function fetchQuote(symbol) {
  return enqueue(async () => {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=2m&range=1d&includePrePost=true`;
    const response = await yahooFetchRaw(url);

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) throw new Error('No data');

    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const regPrice = meta.regularMarketPrice;
    const regChange = regPrice - prevClose;
    const regChangePercent = prevClose ? (regChange / prevClose) * 100 : 0;

    // Use currentTradingPeriod to reliably detect market phase
    const now = Math.floor(Date.now() / 1000);
    const tp = meta.currentTradingPeriod;
    let inPre = false, inRegular = false;
    if (tp) {
      if (tp.pre && now >= tp.pre.start && now < tp.pre.end) inPre = true;
      if (tp.regular && now >= tp.regular.start && now < tp.regular.end) inRegular = true;
    }

    let extPrice = null, extChange = null, extChangePercent = null, extMarketState = null;

    // Try meta ext price fields first
    if (inPre && meta.preMarketPrice) {
      extPrice = meta.preMarketPrice;
      extChange = meta.preMarketPrice - regPrice;
      extChangePercent = regPrice ? (extChange / regPrice) * 100 : 0;
      extMarketState = 'pre';
    } else if (!inRegular && meta.postMarketPrice) {
      extPrice = meta.postMarketPrice;
      extChange = meta.postMarketPrice - regPrice;
      extChangePercent = regPrice ? (extChange / regPrice) * 100 : 0;
      extMarketState = 'post';
    }

    // Fallback: derive ext price from candle data when meta lacks ext fields
    if (!extPrice && !inRegular && tp?.regular) {
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const regEnd = tp.regular.end;
      const regStart = tp.regular.start;

      // Post-market: look for candles after regular session end
      if (!inPre && regEnd && timestamps.length > 0 && timestamps[timestamps.length - 1] > regEnd) {
        let sessionClose = null;
        for (let i = timestamps.length - 1; i >= 0; i--) {
          if (timestamps[i] <= regEnd && closes[i] != null) { sessionClose = closes[i]; break; }
        }
        let latestClose = null;
        for (let i = timestamps.length - 1; i >= 0; i--) {
          if (closes[i] != null) { latestClose = closes[i]; break; }
        }
        if (sessionClose != null && latestClose != null) {
          extPrice = latestClose;
          extChange = latestClose - sessionClose;
          extChangePercent = sessionClose ? (extChange / sessionClose) * 100 : 0;
          extMarketState = 'post';
        }
      }

      // Pre-market: look for candles before regular session start
      if (inPre && regStart && timestamps.length > 0 && timestamps[0] < regStart) {
        let latestPreClose = null;
        for (let i = timestamps.length - 1; i >= 0; i--) {
          if (timestamps[i] < regStart && closes[i] != null) { latestPreClose = closes[i]; break; }
        }
        if (latestPreClose != null) {
          extPrice = latestPreClose;
          extChange = latestPreClose - regPrice;
          extChangePercent = regPrice ? (extChange / regPrice) * 100 : 0;
          extMarketState = 'pre';
        }
      }
    }

    return {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || meta.symbol,
      price: regPrice,
      change: regChange,
      changePercent: regChangePercent,
      volume: meta.regularMarketVolume,
      marketCap: null,
      extPrice, extChange, extChangePercent, extMarketState,
    };
  });
}

// Simple RSS XML parser — extracts items from RSS/Atom feeds
function parseRSS(xml, fallbackPublisher = '') {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractTag(block, 'source');
    if (title) {
      items.push({
        title,
        publisher: source || fallbackPublisher,
        link: link || '',
        publishedAt: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : 0,
      });
    }
  }
  return items;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function extractTag(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const plainMatch = xml.match(plainRe);
  if (plainMatch) return decodeEntities(plainMatch[1].trim());
  return null;
}

async function fetchRSS(url, fallbackPublisher) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRSS(xml, fallbackPublisher);
  } catch {
    return [];
  }
}

// Scrape og:image from an article page (lightweight — only reads first 50KB)
async function scrapeOgImage(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(3000),
      redirect: 'follow',
    });
    if (!response.ok) return null;
    // Read only the head portion — og:image is always in <head>
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      // Stop once we've passed </head>
      if (html.includes('</head>')) break;
    }
    reader.cancel();

    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return ogMatch?.[1] || null;
  } catch {
    return null;
  }
}

export async function fetchMarketNews() {
  // Curated financial news RSS feeds — editorially selected market headlines
  const RSS_FEEDS = [
    { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', pub: 'CNBC' },
    { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', pub: 'CNBC' },
    { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135', pub: 'CNBC' },
    { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', pub: 'CNBC' },
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins', pub: 'MarketWatch' },
    { url: 'https://feeds.bloomberg.com/markets/news.rss', pub: 'Bloomberg' },
    { url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', pub: 'Google News' },
  ];

  const results = await Promise.allSettled(RSS_FEEDS.map(f => fetchRSS(f.url, f.pub)));

  // Combine, deduplicate by title, and sort by recency
  const seen = new Set();
  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const article of r.value) {
      // Google News titles include source: "Headline - Reuters"
      if (article.publisher === 'Google News' && article.title.includes(' - ')) {
        const idx = article.title.lastIndexOf(' - ');
        article.publisher = article.title.slice(idx + 3).trim();
        article.title = article.title.slice(0, idx).trim();
      }
      if (!seen.has(article.title)) {
        seen.add(article.title);
        articles.push(article);
      }
    }
  }
  articles.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

  // Filter to only today's articles (last 24 hours)
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  const recent = articles.filter(a => a.publishedAt > oneDayAgo);
  const final = (recent.length >= 5 ? recent : articles).slice(0, 30);

  // Scrape og:image thumbnails for top articles (parallel, fast timeout)
  const ogResults = await Promise.allSettled(
    final.slice(0, 15).map(a => a.link ? scrapeOgImage(a.link) : Promise.resolve(null))
  );
  for (let i = 0; i < ogResults.length; i++) {
    if (ogResults[i].status === 'fulfilled' && ogResults[i].value) {
      final[i].thumbnail = ogResults[i].value;
    }
  }

  return final;
}

// Coinbase public API for crypto 1m OHLC (Yahoo doesn't provide real OHLC at 1m for crypto)
// Coinbase candle format: [time, low, high, open, close, volume] — returns newest first
// Coinbase returns max 300 candles per request, so we paginate backwards to get ~7 days
export async function fetchCryptoChart(symbol, granularity = 60) {
  const allCandles = [];
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - 7 * 86400;
  const batchSeconds = 300 * granularity; // 300 candles per batch
  let end = now;

  while (end > cutoff) {
    const start = Math.max(end - batchSeconds, cutoff);
    const batch = await enqueue(async () => {
      const url = `${COINBASE_CANDLES_URL}/${encodeURIComponent(symbol)}/candles?granularity=${granularity}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      return data;
    });

    if (!batch) break;
    allCandles.push(...batch);
    end = start;
  }

  if (allCandles.length === 0) return null;

  // Deduplicate by timestamp, sort chronologically
  const seen = new Set();
  const unique = [];
  for (const k of allCandles) {
    if (!seen.has(k[0])) {
      seen.add(k[0]);
      unique.push(k);
    }
  }
  unique.sort((a, b) => a[0] - b[0]);

  return unique.map(k => ({
    time: k[0],
    open: k[3],
    high: k[2],
    low: k[1],
    close: k[4],
    volume: k[5],
  }));
}

// Batch quote fetch — returns map of { symbol: { price, change, changePercent, marketCap, ... } }
// Single request fetches up to 150 symbols — dramatically reduces Yahoo API calls
export async function fetchBatchQuotes(symbols) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 150) {
    chunks.push(symbols.slice(i, i + 150));
  }

  const results = new Map();
  for (const chunk of chunks) {
    try {
      const url = `${YAHOO_QUOTE_URL}?symbols=${chunk.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketCap,regularMarketVolume,shortName,longName,earningsTimestamp,earningsTimestampStart,earningsTimestampEnd,postMarketPrice,postMarketChange,postMarketChangePercent,preMarketPrice,preMarketChange,preMarketChangePercent,marketState`;
      const response = await yahooFetchRaw(url, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const quotes = data.quoteResponse?.result || [];
      for (const q of quotes) {
        // Determine extended hours data
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

        results.set(q.symbol, {
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          marketCap: q.marketCap,
          volume: q.regularMarketVolume,
          earningsDate: q.earningsTimestamp || q.earningsTimestampStart || null,
          shortName: q.shortName || q.longName || q.symbol,
          extPrice, extChange, extChangePercent, extMarketState,
        });
      }
    } catch {
      // continue with partial data
    }
  }
  return results;
}

export async function fetchNews(symbol) {
  return enqueue(async () => {
    const params = new URLSearchParams({
      q: symbol,
      quotesCount: '0',
      newsCount: '5',
      listsCount: '0',
    });

    const response = await yahooFetchRaw(`${YAHOO_SEARCH_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    return (data.news || []).map(item => ({
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      publishedAt: item.providerPublishTime,
      thumbnail: item.thumbnail?.resolutions?.[0]?.url || null,
    }));
  });
}
