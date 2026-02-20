import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QUOTE_POLL_MS } from '../utils/constants.js';
import { authFetch } from '../lib/authFetch.js';

const STORAGE_KEY = 'favorites';

function loadFavorites() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    // Deduplicate while preserving order
    return [...new Set(Array.isArray(parsed) ? parsed : [])];
  } catch {
    return [];
  }
}

function saveFavorites(symbols) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}

export function useFavorites(gainers, losers, trending = [], futures = [], crypto = [], session = null) {
  const [symbols, setSymbols] = useState(() => session ? loadFavorites() : []);
  const [extraQuotes, setExtraQuotes] = useState({});
  const pollRef = useRef(null);
  const queueRef = useRef([]);
  const syncTimeoutRef = useRef(null);
  const initialSyncDone = useRef(false);

  // Derived Set for O(1) lookups
  const symbolSet = useMemo(() => new Set(symbols), [symbols]);

  // Load/clear favorites when session changes
  useEffect(() => {
    if (session) {
      setSymbols(loadFavorites());
    } else {
      setSymbols([]);
      initialSyncDone.current = false;
    }
  }, [!!session]);

  // Merge cloud favorites on login
  useEffect(() => {
    if (!session) return;
    if (initialSyncDone.current) return;
    initialSyncDone.current = true;

    authFetch('/api/user/favorites')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setSymbols(prev => {
          const merged = [...new Set([...prev, ...data.favorites])];
          saveFavorites(merged);
          return merged;
        });
      })
      .catch(() => {});
  }, [session?.access_token]);

  // Debounced sync to cloud on changes
  useEffect(() => {
    if (!session) return;
    if (!initialSyncDone.current) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      authFetch('/api/user/favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      }).catch(() => {});
    }, 2000);

    return () => clearTimeout(syncTimeoutRef.current);
  }, [symbols, session?.access_token]);

  const toggleFavorite = useCallback((symbol) => {
    setSymbols(prev => {
      const next = prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol];
      if (session) saveFavorites(next);
      return next;
    });
  }, [session]);

  const isFavorite = useCallback((symbol) => symbolSet.has(symbol), [symbolSet]);

  const reorderFavorites = useCallback((fromIndex, toIndex) => {
    setSymbols(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      if (session) saveFavorites(next);
      return next;
    });
  }, [session]);

  // Build a lookup map from gainers + losers + trending
  const knownMap = useRef({});
  useEffect(() => {
    const map = {};
    for (const s of gainers) map[s.symbol] = s;
    for (const s of losers) map[s.symbol] = s;
    for (const s of trending) map[s.symbol] = s;
    for (const s of futures) map[s.symbol] = s;
    for (const s of crypto) map[s.symbol] = s;
    knownMap.current = map;
  }, [gainers, losers, trending, futures, crypto]);

  // Find symbols that need independent polling (not in gainers/losers)
  const missingSymbols = symbols.filter(s => !knownMap.current[s]);

  // Batch-fetch all missing favorites in a single API call
  const fetchMissingQuotes = useCallback(async (syms) => {
    if (syms.length === 0) return;
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(syms.join(','))}`);
      if (!res.ok) return;
      const quotes = await res.json();
      setExtraQuotes(prev => ({ ...prev, ...quotes }));
    } catch {
      // ignore
    }
  }, []);

  // Poll missing symbols with batch fetching
  useEffect(() => {
    if (missingSymbols.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    // Initial fetch for all missing
    fetchMissingQuotes(missingSymbols);

    pollRef.current = setInterval(() => fetchMissingQuotes(missingSymbols), QUOTE_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [missingSymbols.join(','), fetchMissingQuotes]);

  // Build favorites array: prefer gainers/losers data, fallback to extraQuotes
  const favorites = symbols
    .map(sym => knownMap.current[sym] || extraQuotes[sym])
    .filter(Boolean);

  return { favorites, toggleFavorite, isFavorite, reorderFavorites };
}
