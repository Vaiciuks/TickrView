import { useState, useEffect, useRef, useCallback } from "react";
import { retryFetch } from "../utils/retryFetch.js";

export function useChartData(
  symbol,
  range = "1d",
  interval = "5m",
  refreshMs = 0,
  prepost = true,
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(
    async (isInitial, signal) => {
      if (!symbol) return;
      if (isInitial) setLoading(true);

      try {
        const params = new URLSearchParams({
          range,
          interval,
          prepost: String(prepost),
        });
        // Bypass server cache on refresh polls to ensure fresh data
        if (!isInitial) params.set("_t", Date.now());
        const res = await retryFetch(
          `/api/chart/${encodeURIComponent(symbol)}?${params}`,
          { signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!signal.aborted) {
          setData(json.data);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to fetch chart data");
        // keep existing data on refresh failure
      } finally {
        if (isInitial && !signal.aborted) setLoading(false);
      }
    },
    [symbol, range, interval, prepost],
  );

  useEffect(() => {
    // Abort any previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setData(null);
    setError(null);
    setLastUpdated(null);
    fetchData(true, controller.signal);

    if (refreshMs > 0) {
      intervalRef.current = setInterval(
        () => fetchData(false, controller.signal),
        refreshMs,
      );
    }

    return () => {
      controller.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, refreshMs]);

  return { data, loading, error, lastUpdated };
}
