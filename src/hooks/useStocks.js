import { useState, useEffect, useCallback, useRef } from 'react';
import { REFRESH_INTERVAL, QUOTE_POLL_MS, BURST_STAGGER_MS } from '../utils/constants.js';

export function useStocks(endpoint, active = true) {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);
  const quoteRef = useRef(null);
  const stocksRef = useRef([]);
  const queueRef = useRef([]);
  const burstTimersRef = useRef([]);

  // Keep ref in sync so the poll callback always reads current stocks
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  // Fetch a single quote via chart API (more up-to-date than screener)
  // bypassCache adds a timestamp param to skip the server's 5s cache
  const fetchQuote = useCallback(async (symbol, bypassCache = false) => {
    try {
      const url = bypassCache
        ? `/api/quote/${encodeURIComponent(symbol)}?_t=${Date.now()}`
        : `/api/quote/${encodeURIComponent(symbol)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const quote = await res.json();

      setStocks(prev => prev.map(s =>
        s.symbol === symbol
          ? { ...s, price: quote.price, change: quote.change, changePercent: quote.changePercent, volume: quote.volume, ...(quote.extPrice != null ? { extPrice: quote.extPrice, extChange: quote.extChange, extChangePercent: quote.extChangePercent, extMarketState: quote.extMarketState } : {}) }
          : s
      ));
    } catch {
      // ignore individual quote failures
    }
  }, []);

  // Burst-fetch ALL stocks with cache bypass — used at 20s refresh
  const burstAllQuotes = useCallback((stockList) => {
    burstTimersRef.current.forEach(clearTimeout);
    burstTimersRef.current = [];

    const shuffled = [...stockList].sort(() => Math.random() - 0.5);
    shuffled.forEach((s, i) => {
      const timer = setTimeout(() => fetchQuote(s.symbol, true), i * BURST_STAGGER_MS);
      burstTimersRef.current.push(timer);
    });

    // Reset shuffle queue so ongoing polling starts fresh after burst
    queueRef.current = [];
  }, [fetchQuote]);

  const fetchStocks = useCallback(async (isInitial) => {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Screener data for list management (which stocks to show, ordering)
      setStocks(data.stocks || []);
      setLastUpdated(new Date());
      setError(null);

      // Only burst-fetch when this tab is active
      if (active) burstAllQuotes(data.stocks);
    } catch (err) {
      if (isInitial) setError(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [endpoint, burstAllQuotes, active]);

  // Full list refresh every REFRESH_INTERVAL
  useEffect(() => {
    fetchStocks(true);
    intervalRef.current = setInterval(() => fetchStocks(false), REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchStocks]);

  // Shuffled queue polling — continuous 1/sec updates (only when active)
  useEffect(() => {
    if (!active) return;

    const pollNext = () => {
      const current = stocksRef.current;
      if (current.length === 0) return;

      // Refill and shuffle when queue is empty
      if (queueRef.current.length === 0) {
        queueRef.current = current
          .map(s => s.symbol)
          .sort(() => Math.random() - 0.5);
      }

      const symbol = queueRef.current.shift();
      if (symbol) fetchQuote(symbol);
    };

    // Start first poll quickly after mount
    const startDelay = setTimeout(pollNext, 500);
    quoteRef.current = setInterval(pollNext, QUOTE_POLL_MS);

    return () => {
      clearTimeout(startDelay);
      clearInterval(quoteRef.current);
      burstTimersRef.current.forEach(clearTimeout);
    };
  }, [fetchQuote, active]);

  return { stocks, loading, error, lastUpdated };
}
