import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QUOTE_POLL_MS } from '../utils/constants.js';

const STORAGE_KEY = 'tickrpulse-portfolio';

function loadPositions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePositions(positions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function usePortfolio() {
  const [positions, setPositions] = useState(loadPositions);
  const [liveQuotes, setLiveQuotes] = useState({});
  const pollRef = useRef(null);

  // Fetch live prices for all held symbols
  const symbols = useMemo(() => positions.map(p => p.symbol), [positions]);

  const fetchQuotes = useCallback(async (syms) => {
    if (syms.length === 0) return;
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(syms.join(','))}`);
      if (!res.ok) return;
      const quotes = await res.json();
      setLiveQuotes(prev => ({ ...prev, ...quotes }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (symbols.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      setLiveQuotes({});
      return;
    }
    fetchQuotes(symbols);
    pollRef.current = setInterval(() => fetchQuotes(symbols), QUOTE_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [symbols.join(','), fetchQuotes]);

  const addPosition = useCallback((symbol, shares, avgCost, name) => {
    setPositions(prev => {
      const existing = prev.find(p => p.symbol === symbol);
      let next;
      if (existing) {
        // Merge: weighted average cost
        const totalShares = existing.shares + shares;
        const newAvgCost = (existing.shares * existing.avgCost + shares * avgCost) / totalShares;
        next = prev.map(p => p.symbol === symbol ? { ...p, shares: totalShares, avgCost: newAvgCost } : p);
      } else {
        next = [...prev, { symbol, shares, avgCost, name: name || symbol, addedAt: Date.now() }];
      }
      savePositions(next);
      return next;
    });
  }, []);

  const removePosition = useCallback((symbol) => {
    setPositions(prev => {
      const next = prev.filter(p => p.symbol !== symbol);
      savePositions(next);
      return next;
    });
  }, []);

  const editPosition = useCallback((symbol, shares, avgCost) => {
    setPositions(prev => {
      const next = prev.map(p => p.symbol === symbol ? { ...p, shares, avgCost } : p);
      savePositions(next);
      return next;
    });
  }, []);

  // Merge live quotes into positions
  const holdings = useMemo(() => {
    return positions.map(p => {
      const q = liveQuotes[p.symbol];
      const price = q?.price ?? null;
      const change = q?.change ?? 0;
      const changePercent = q?.changePercent ?? 0;
      const marketValue = price != null ? price * p.shares : null;
      const costBasis = p.avgCost * p.shares;
      const pl = marketValue != null ? marketValue - costBasis : null;
      const plPercent = costBasis > 0 && pl != null ? (pl / costBasis) * 100 : null;
      const dayPL = price != null ? change * p.shares : null;
      return {
        ...p,
        price,
        change,
        changePercent,
        marketValue,
        costBasis,
        pl,
        plPercent,
        dayPL,
      };
    });
  }, [positions, liveQuotes]);

  // Portfolio-level totals
  const totals = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let totalDayChange = 0;
    let hasPrice = false;

    for (const h of holdings) {
      if (h.marketValue != null) {
        totalValue += h.marketValue;
        hasPrice = true;
      }
      totalCost += h.costBasis;
      if (h.dayPL != null) totalDayChange += h.dayPL;
    }

    const totalPL = hasPrice ? totalValue - totalCost : null;
    const totalPLPercent = totalCost > 0 && totalPL != null ? (totalPL / totalCost) * 100 : null;
    const dayChangePercent = totalValue > 0 ? (totalDayChange / (totalValue - totalDayChange)) * 100 : null;

    return {
      totalValue: hasPrice ? totalValue : null,
      totalCost,
      totalPL,
      totalPLPercent,
      dayChange: totalDayChange,
      dayChangePercent,
    };
  }, [holdings]);

  return {
    holdings,
    positions,
    addPosition,
    removePosition,
    editPosition,
    ...totals,
  };
}
