import { useState, useEffect, useCallback, useRef } from 'react';
import { QUOTE_POLL_MS } from '../utils/constants.js';

const REFRESH_INTERVAL = 30_000; // list refresh every 30s

export function useMovers(active, session) {
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const gainersRef = useRef([]);
  const losersRef = useRef([]);

  useEffect(() => { gainersRef.current = gainers; }, [gainers]);
  useEffect(() => { losersRef.current = losers; }, [losers]);

  // Batch quote poll — update ext-hours prices between list refreshes
  const pollQuotes = useCallback(async () => {
    const all = [...gainersRef.current, ...losersRef.current];
    if (all.length === 0) return;

    try {
      const symbols = all.map(s => s.symbol).join(',');
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`);
      if (!res.ok) return;
      const quotes = await res.json();

      const update = (prev) => prev.map(s => {
        const q = quotes[s.symbol];
        if (!q) return s;
        // Use ext-hours price if available (pre/post market), otherwise regular
        const newPrice = q.extPrice ?? q.price;
        if (newPrice == null) return s;
        // Recalculate change from regular close
        const close = s.close;
        const changePct = close ? ((newPrice - close) / close) * 100 : s.change;
        const changeAbs = close ? (newPrice - close) : s.changeAbs;
        return { ...s, price: newPrice, change: changePct, changeAbs, volume: q.volume ?? s.volume };
      });

      setGainers(update);
      setLosers(update);
      setLastUpdated(new Date());
    } catch {
      // ignore poll failures
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    const fetchMovers = async () => {
      try {
        const res = await fetch(`/api/movers?session=${session}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted) {
          setGainers(data.gainers || []);
          setLosers(data.losers || []);
          setLoading(false);
          setLastUpdated(new Date());
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    setLoading(true);
    fetchMovers();
    const id = setInterval(fetchMovers, REFRESH_INTERVAL);
    return () => { mounted = false; clearInterval(id); };
  }, [active, session]);

  // Quote polling (only when active)
  useEffect(() => {
    if (!active) return;
    const delay = setTimeout(pollQuotes, 800);
    const id = setInterval(pollQuotes, QUOTE_POLL_MS);
    return () => { clearTimeout(delay); clearInterval(id); };
  }, [active, pollQuotes]);

  return { gainers, losers, loading, lastUpdated };
}
