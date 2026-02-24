import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const TIMEFRAME_MAP = {
  "1D": { range: "2d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1h" },
  "YTD": { range: "ytd", interval: "1d" },
  All: { range: "max", interval: "1wk" },
};

// Live polling interval for 1D chart (60 seconds)
const POLL_INTERVAL = 60_000;

const CHUNK_SIZE = 50;

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Get today's date string (YYYY-MM-DD) in US Eastern time */
function getTodayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

/** Check if a unix timestamp (seconds) falls on today's date in ET */
function isToday(unixSeconds) {
  const dateStr = new Date(unixSeconds * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  return dateStr === getTodayET();
}

export function usePortfolioChart(holdings, timeframe) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const holdingsKey = useMemo(() => {
    return holdings
      .map((h) => `${h.symbol}:${h.shares}`)
      .sort()
      .join(",");
  }, [holdings]);

  const fetchData = useCallback(
    async (signal) => {
      if (holdings.length === 0) {
        setData([]);
        return;
      }

      const tf = TIMEFRAME_MAP[timeframe];
      if (!tf) return;

      const sharesMap = {};
      for (const h of holdings) {
        sharesMap[h.symbol] = h.shares;
      }

      const symbols = Object.keys(sharesMap);
      const batches = chunk(symbols, CHUNK_SIZE);

      const allCharts = {};
      for (const batch of batches) {
        const params = new URLSearchParams({
          symbols: batch.join(","),
          range: tf.range,
          interval: tf.interval,
          prepost: "true",
        });
        const res = await fetch(`/api/charts?${params}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        Object.assign(allCharts, json.charts || {});
      }

      // Collect all unique timestamps and per-symbol close prices
      const allTimestamps = new Set();
      const symbolData = {};
      for (const sym of symbols) {
        const candles = allCharts[sym];
        if (!candles || candles.length === 0) continue;
        symbolData[sym] = {};
        for (const c of candles) {
          allTimestamps.add(c.time);
          symbolData[sym][c.time] = c.close;
        }
      }

      if (allTimestamps.size === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const sortedTimes = [...allTimestamps].sort((a, b) => a - b);

      // Forward-fill: for each symbol, carry the last known close
      const lastKnown = {};
      let portfolioSeries = [];

      for (const t of sortedTimes) {
        let portfolioValue = 0;
        let hasAny = false;

        for (const sym of Object.keys(symbolData)) {
          if (symbolData[sym][t] != null) {
            lastKnown[sym] = symbolData[sym][t];
          }
          if (lastKnown[sym] != null) {
            portfolioValue += lastKnown[sym] * sharesMap[sym];
            hasAny = true;
          }
        }

        if (hasAny) {
          portfolioSeries.push({ time: t, value: portfolioValue });
        }
      }

      // For 1D: filter to only today's data in US Eastern time
      if (timeframe === "1D") {
        const todayOnly = portfolioSeries.filter((p) => isToday(p.time));
        // Use today's data if available, otherwise keep all (weekend/holiday fallback)
        if (todayOnly.length > 0) {
          portfolioSeries = todayOnly;
        }
      }

      if (!signal.aborted) {
        setData(portfolioSeries);
        setLoading(false);
      }
    },
    [holdingsKey, timeframe],
  );

  // Initial fetch
  useEffect(() => {
    if (holdings.length === 0) {
      setData([]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetchData(controller.signal).catch((err) => {
      if (err.name !== "AbortError") {
        setError(err.message);
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [fetchData]);

  // Live polling for 1D timeframe
  useEffect(() => {
    if (timeframe !== "1D" || holdings.length === 0) return;

    const id = setInterval(() => {
      const controller = new AbortController();
      fetchData(controller.signal).catch(() => {});
    }, POLL_INTERVAL);

    return () => clearInterval(id);
  }, [timeframe, fetchData]);

  return { data, loading, error };
}
