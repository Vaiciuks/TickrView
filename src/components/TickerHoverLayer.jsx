import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import StockLogo from "./StockLogo.jsx";

// Single global hover layer: listens for pointerover/out anywhere in the app
// and shows a rich preview for elements that carry a `data-ticker` attribute.
// Data is fetched on first hover and cached for the session.

const HOVER_DELAY = 380;       // ms before a preview opens
const HIDE_DELAY = 140;        // ms after pointer leaves before hiding
const quoteCache = new Map();  // symbol -> { quote, chart, expires }
const CACHE_TTL = 60_000;      // 1 minute

function fetchPreview(symbol, signal) {
  const cached = quoteCache.get(symbol);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached);

  const p = Promise.all([
    fetch(`/api/quote/${encodeURIComponent(symbol)}`, { signal }).then((r) =>
      r.ok ? r.json() : null,
    ),
    fetch(
      `/api/chart/${encodeURIComponent(symbol)}?range=5d&interval=15m&prepost=false`,
      { signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]).then(([quote, chart]) => {
    const entry = {
      quote,
      chart: chart?.data || [],
      expires: Date.now() + CACHE_TTL,
    };
    quoteCache.set(symbol, entry);
    return entry;
  });
  return p;
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const closes = data.map((d) => d.close).filter((v) => Number.isFinite(v));
  if (closes.length < 2) return null;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = Math.max(max - min, 0.0001);
  const width = 240;
  const height = 48;
  const step = width / (closes.length - 1);

  const points = closes.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const isUp = closes[closes.length - 1] >= closes[0];
  const stroke = isUp ? "var(--green-primary)" : "var(--red-primary)";
  const fill = isUp
    ? "rgba(38, 217, 122, 0.15)"
    : "rgba(255, 84, 112, 0.15)";

  const pathLine = `M ${points.join(" L ")}`;
  const pathFill = `${pathLine} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      className="thc-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="presentation"
    >
      <path d={pathFill} fill={fill} />
      <path d={pathLine} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function formatPrice(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Number(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export default function TickerHoverLayer() {
  const [state, setState] = useState(null);
  // state: { symbol, anchor:{x,y,w,h}, data: null|{quote,chart}, loading }
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const abortRef = useRef(null);
  const activeSymbolRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeNow = useCallback(() => {
    clearTimers();
    abortRef.current?.abort();
    activeSymbolRef.current = null;
    setState(null);
  }, [clearTimers]);

  // Global pointer delegation
  useEffect(() => {
    const onOver = (e) => {
      const target = e.target.closest?.("[data-ticker]");
      if (!target) return;
      // Bail if currently inside a chart overlay or the palette — avoid noise
      if (target.closest(".expanded-overlay, .cmdp-overlay")) return;

      const symbol = target.getAttribute("data-ticker");
      if (!symbol) return;

      // Cancel any pending close if we're re-entering the same or another trigger
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (activeSymbolRef.current === symbol) return;

      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      openTimerRef.current = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        activeSymbolRef.current = symbol;
        setState({
          symbol,
          anchor: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
          data: quoteCache.get(symbol) || null,
          loading: !quoteCache.get(symbol),
        });

        // Kick off fetch if we don't have fresh data cached
        const cached = quoteCache.get(symbol);
        if (!cached || cached.expires < Date.now()) {
          abortRef.current?.abort();
          const controller = new AbortController();
          abortRef.current = controller;
          fetchPreview(symbol, controller.signal)
            .then((data) => {
              if (activeSymbolRef.current !== symbol) return;
              setState((prev) =>
                prev && prev.symbol === symbol
                  ? { ...prev, data, loading: false }
                  : prev,
              );
            })
            .catch(() => {
              if (activeSymbolRef.current !== symbol) return;
              setState((prev) =>
                prev && prev.symbol === symbol
                  ? { ...prev, loading: false }
                  : prev,
              );
            });
        }
      }, HOVER_DELAY);
    };

    const onOut = (e) => {
      const target = e.target.closest?.("[data-ticker]");
      if (!target) return;
      // Only close when actually leaving the trigger element entirely
      const nextTarget = e.relatedTarget;
      if (nextTarget && target.contains(nextTarget)) return;

      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(closeNow, HIDE_DELAY);
    };

    // Close on scroll / window blur — anchor becomes stale
    const onScroll = () => closeNow();
    const onBlur = () => closeNow();

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("blur", onBlur);
      clearTimers();
      abortRef.current?.abort();
    };
  }, [clearTimers, closeNow]);

  if (!state) return null;

  const { symbol, anchor, data, loading } = state;
  const quote = data?.quote;
  const isUp = quote && quote.changePercent != null ? quote.changePercent >= 0 : true;

  // Positioning: prefer below the anchor; flip above if it would clip.
  const CARD_W = 272;
  const CARD_H = 170;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchor.x + anchor.w / 2 - CARD_W / 2;
  left = Math.max(margin, Math.min(left, vw - CARD_W - margin));

  let top = anchor.y + anchor.h + 6;
  if (top + CARD_H + margin > vh) {
    top = anchor.y - CARD_H - 6;
    if (top < margin) top = margin;
  }

  return createPortal(
    <div className="thc-card" style={{ left, top, width: CARD_W }}>
      <div className="thc-head">
        <StockLogo symbol={symbol} size={22} />
        <span className="thc-symbol">{symbol}</span>
        {quote?.name && <span className="thc-name">{quote.name}</span>}
      </div>

      {loading && !quote ? (
        <div className="thc-loading">Loading quote…</div>
      ) : quote ? (
        <>
          <div className="thc-price-row">
            <span className="thc-price">{formatPrice(quote.price)}</span>
            <span
              className={`thc-change ${isUp ? "thc-change--up" : "thc-change--down"}`}
            >
              {formatPct(quote.changePercent)}
            </span>
          </div>
          <Sparkline data={data?.chart} />
          <div className="thc-footer">
            <span>
              {quote.extPrice != null
                ? `${quote.extMarketState === "pre" ? "Pre" : "AH"} ${formatPrice(quote.extPrice)}`
                : "Regular session"}
            </span>
            <span className="thc-hint">Click to open</span>
          </div>
        </>
      ) : (
        <div className="thc-error">Couldn't load quote.</div>
      )}
    </div>,
    document.body,
  );
}
