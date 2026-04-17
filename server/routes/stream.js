import { Router } from 'express';
import { fetchQuote } from '../lib/yahooFetch.js';

// Server-Sent Events endpoint that streams quote updates for a single symbol.
// The server polls Yahoo on a short interval and pushes whatever it has to
// connected clients. This is narrowly scoped to the currently-viewed expanded
// chart — one symbol per client — so the upstream load stays bounded even
// without a WS upstream.
//
//   GET /api/stream/quote/:symbol
//
// Client opens an EventSource and consumes `data: { ...quoteFields }`.

const router = Router();

// Polling cadence. Kept deliberately conservative to avoid Yahoo rate limits.
const POLL_MS = 3000;
// Also keep an upper bound on how long any single stream stays open, so we
// don't leak sockets during freak reconnect loops.
const MAX_STREAM_MS = 60 * 60 * 1000; // 1 hour

// Shared, keyed in-process caches so that N clients watching the same symbol
// result in 1 upstream poll, not N.
const pollers = new Map(); // symbol -> { quote, startedAt, subs:Set<res>, timer }

function startPoller(symbol) {
  const entry = {
    quote: null,
    lastTickMs: 0,
    timer: null,
    subs: new Set(),
  };
  pollers.set(symbol, entry);

  const tick = async () => {
    try {
      const q = await fetchQuote(symbol);
      entry.quote = q;
      entry.lastTickMs = Date.now();
      // Fan out to every subscriber
      const payload = `data: ${JSON.stringify(q)}\n\n`;
      for (const res of entry.subs) {
        try {
          res.write(payload);
        } catch {
          /* client likely gone, will be cleaned up by the close handler */
        }
      }
    } catch {
      // Swallow upstream errors — clients will just get the last known quote.
    }
  };

  // Kick one immediately then repeat
  tick();
  entry.timer = setInterval(tick, POLL_MS);
  return entry;
}

function stopPoller(symbol) {
  const entry = pollers.get(symbol);
  if (!entry) return;
  clearInterval(entry.timer);
  pollers.delete(symbol);
}

router.get('/quote/:symbol', (req, res) => {
  const { symbol } = req.params;
  if (!/^[\^A-Z0-9.\-=]{1,12}$/i.test(symbol)) {
    return res.status(400).end();
  }

  // Standard SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable nginx-style buffering if anything proxies us
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Open with a retry hint and a comment to flush proxies.
  res.write('retry: 5000\n');
  res.write(': connected\n\n');

  let entry = pollers.get(symbol);
  if (!entry) entry = startPoller(symbol);
  entry.subs.add(res);

  // If we have a cached quote, send it right away so the client sees data
  // before the next tick. Otherwise the first push will arrive in ≤ POLL_MS.
  if (entry.quote) {
    res.write(`data: ${JSON.stringify(entry.quote)}\n\n`);
  }

  // Keepalive ping to defeat idle-connection proxies
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignored */
    }
  }, 25_000);

  // Hard max-lifetime — client will reconnect automatically via EventSource
  const maxLifeTimer = setTimeout(() => {
    try {
      res.end();
    } catch {
      /* ignored */
    }
  }, MAX_STREAM_MS);

  const cleanup = () => {
    clearInterval(keepAlive);
    clearTimeout(maxLifeTimer);
    entry.subs.delete(res);
    if (entry.subs.size === 0) stopPoller(symbol);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('error', cleanup);
});

export default router;
