import { useEffect, useState } from "react";

// Derive the post-earnings price reaction for each reported quarter.
// Fetches 2y of daily candles once and matches each earnings date to
// the surrounding trading sessions — no new server endpoint required.
//
// Returns an array of { period, quarter, year, reactionD1, reaction5D,
//   priceOn, priceNext, price5d } sorted oldest → newest.

function parseDate(s) {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

// Find the candle whose time is ≥ target (first trading day on or after).
function findCandleAtOrAfter(candles, targetSec) {
  if (!candles || candles.length === 0) return -1;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < targetSec) lo = mid + 1;
    else hi = mid - 1;
  }
  return lo < candles.length ? lo : -1;
}

export function useEarningsPlayback(symbol, earningsRows) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol || !earningsRows || earningsRows.length === 0) {
      setData([]);
      return;
    }

    const reported = earningsRows.filter((r) => r.actual != null && r.period);
    if (reported.length === 0) {
      setData([]);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&prepost=false`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const candles = json.data || [];
        if (candles.length === 0) {
          if (!cancelled) setData([]);
          return;
        }

        const out = [];
        for (const row of reported) {
          const targetSec = parseDate(row.period);
          if (!targetSec) continue;

          const idx = findCandleAtOrAfter(candles, targetSec);
          // Need at least T and T+1 inside the 2y window.
          if (idx < 0 || idx + 1 >= candles.length) continue;

          const priceOn = candles[idx].close;
          const priceNext = candles[idx + 1].close;
          const priceFive =
            idx + 5 < candles.length ? candles[idx + 5].close : null;

          if (!Number.isFinite(priceOn) || priceOn === 0) continue;

          out.push({
            period: row.period,
            quarter: row.quarter,
            year: row.year,
            beat: row.beat,
            surprisePercent: row.surprisePercent ?? null,
            priceOn,
            priceNext,
            price5d: priceFive,
            reactionD1: ((priceNext - priceOn) / priceOn) * 100,
            reaction5D:
              priceFive != null
                ? ((priceFive - priceOn) / priceOn) * 100
                : null,
          });
        }

        out.sort((a, b) => parseDate(a.period) - parseDate(b.period));
        if (!cancelled) setData(out);
      } catch {
        /* silent — playback is a nice-to-have */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // We intentionally key only off symbol + reported-dates signature,
    // not the full rows array (it's referentially unstable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, earningsRows.map((r) => r.period).join(",")]);

  return { data, loading };
}
