import { useState, useEffect, useCallback, useRef } from "react";
import { REFRESH_INTERVAL, QUOTE_POLL_MS } from "../utils/constants.js";
import { retryFetch } from "../utils/retryFetch.js";

export function useStocks(endpoint, active = true) {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);
  const quoteRef = useRef(null);
  const stocksRef = useRef([]);

  // Keep ref in sync so the poll callback always reads current stocks
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  // Batch-fetch all quotes in a single API call (1 request instead of 30+)
  const fetchAllQuotes = useCallback(async () => {
    const current = stocksRef.current;
    if (current.length === 0) return;

    try {
      const symbols = current.map((s) => s.symbol).join(",");
      const res = await fetch(
        `/api/quotes?symbols=${encodeURIComponent(symbols)}`,
      );
      if (!res.ok) return;
      const quotes = await res.json();

      setStocks((prev) =>
        prev.map((s) => {
          const q = quotes[s.symbol];
          if (!q) return s;
          return {
            ...s,
            price: q.price,
            change: q.change,
            changePercent: q.changePercent,
            volume: q.volume,
            ...(q.extPrice != null
              ? {
                  extPrice: q.extPrice,
                  extChange: q.extChange,
                  extChangePercent: q.extChangePercent,
                  extMarketState: q.extMarketState,
                }
              : {}),
          };
        }),
      );
      setLastUpdated(new Date());
    } catch {
      // ignore batch quote failures
    }
  }, []);

  const fetchStocks = useCallback(
    async (isInitial) => {
      try {
        if (isInitial) setLoading(true);
        const res = await retryFetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const incoming = data.stocks || [];

        if (isInitial) {
          // First load — use server data as-is
          setStocks(incoming);
        } else {
          // Subsequent refreshes — merge new list membership/ordering with
          // existing prices so we don't overwrite fresh quote-polled prices
          // with potentially stale cached list data
          setStocks((prev) => {
            const priceMap = new Map(prev.map((s) => [s.symbol, s]));
            return incoming.map((s) => {
              const existing = priceMap.get(s.symbol);
              if (!existing) return s;
              return {
                ...s,
                price: existing.price,
                change: existing.change,
                changePercent: existing.changePercent,
                volume: existing.volume,
                extPrice: existing.extPrice,
                extChange: existing.extChange,
                extChangePercent: existing.extChangePercent,
                extMarketState: existing.extMarketState,
              };
            });
          });
        }
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (isInitial) setError(err.message);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [endpoint],
  );

  // Full list refresh every REFRESH_INTERVAL
  useEffect(() => {
    fetchStocks(true);
    intervalRef.current = setInterval(
      () => fetchStocks(false),
      REFRESH_INTERVAL,
    );
    return () => clearInterval(intervalRef.current);
  }, [fetchStocks]);

  // Batch quote polling — single API call updates all stocks (only when active)
  useEffect(() => {
    if (!active) return;

    // Initial batch fetch shortly after mount
    const startDelay = setTimeout(fetchAllQuotes, 500);
    quoteRef.current = setInterval(fetchAllQuotes, QUOTE_POLL_MS);

    return () => {
      clearTimeout(startDelay);
      clearInterval(quoteRef.current);
    };
  }, [fetchAllQuotes, active]);

  return { stocks, loading, error, lastUpdated };
}
