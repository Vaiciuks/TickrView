import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "../hooks/useScrollLock.js";
import {
  formatPrice,
  formatPercent,
  formatVolume,
} from "../utils/formatters.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { useParticleBurst } from "../hooks/useParticleBurst.jsx";
import MiniChart from "./MiniChart.jsx";
import NewsPopover from "./NewsPopover.jsx";
import StockLogo from "./StockLogo.jsx";

function isEarningsSoon(earningsDate) {
  if (!earningsDate) return false;
  const now = Date.now() / 1000;
  const diff = earningsDate - now;
  return diff > 0 && diff < 7 * 86400;
}

function earningsDaysAway(earningsDate) {
  if (!earningsDate) return null;
  const diff = earningsDate - Date.now() / 1000;
  if (diff <= 0) return null;
  return Math.ceil(diff / 86400);
}

export default function StockCard({
  stock,
  chartData,
  onClick,
  isSelected,
  isFocused,
  hasNews,
  newsArticles,
  isFavorite,
  onToggleFavorite,
  hasNote,
  note,
  onSetNote,
}) {
  const isPositive = stock.changePercent >= 0;
  const prevPriceRef = useRef(stock.price);
  const [flash, setFlash] = useState(null);
  const [showNews, setShowNews] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const cardRef = useRef(null);
  const earningsSoon = isEarningsSoon(stock.earningsDate);
  const daysAway = earningsDaysAway(stock.earningsDate);
  const animatedPrice = useAnimatedNumber(stock.price);
  const animatedPercent = useAnimatedNumber(stock.changePercent);
  const { triggerBurst, ParticleOverlay } = useParticleBurst();

  useEffect(() => {
    const prev = prevPriceRef.current;
    if (prev != null && stock.price !== prev) {
      setFlash(stock.price > prev ? "flash-up" : "flash-down");
      const timer = setTimeout(() => setFlash(null), 700);
      prevPriceRef.current = stock.price;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = stock.price;
  }, [stock.price]);

  // Scroll into view when focused via keyboard
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isFocused]);

  const handleNewsClick = (e) => {
    e.stopPropagation();
    setShowNews((prev) => !prev);
  };

  useScrollLock(showNote);

  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState(null);
  const statsFetched = useRef(false);

  const handleFlip = (e) => {
    // Prevent flip when clicking action buttons
    if (
      e.target.closest("button") ||
      e.target.closest(".stock-card-note-preview")
    ) {
      return;
    }
    setIsFlipped((prev) => !prev);
    // Lazy-fetch stats on first flip
    if (!statsFetched.current) {
      statsFetched.current = true;
      fetch(`/api/stats/${encodeURIComponent(stock.symbol)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data) setStats(data); })
        .catch(() => {});
    }
  };

  // Per-card spotlight tracking
  const handleCardMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty("--x", `${e.clientX - rect.left}px`);
    cardRef.current.style.setProperty("--y", `${e.clientY - rect.top}px`);
  };

  const handleFullChartClick = (e) => {
    e.stopPropagation();
    onClick(e); // Propagate to app to expand chart
  };

  const handleNoteClick = (e) => {
    e.stopPropagation();
    setNoteText(note?.text || "");
    setShowNote((prev) => !prev);
  };

  const handleNoteSave = (e) => {
    e.stopPropagation();
    onSetNote(noteText);
    setShowNote(false);
  };

  const handleNoteKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleNoteSave(e);
    }
    if (e.key === "Escape") setShowNote(false);
  };

  return (
    <article
      ref={cardRef}
      className={`stock-card ${isFlipped ? "stock-card-flipped" : ""} ${flash || ""}${isSelected ? " stock-card-selected" : ""}${isFocused ? " stock-card-focused" : ""}`}
      onClick={handleFlip}
      onMouseMove={handleCardMouseMove}
    >
      <div className="card-inner">
        {/* FRONT OF CARD */}
        <div className="card-front">
          <div className="stock-card-header">
            <div className="stock-card-symbol-group">
              <StockLogo symbol={stock.symbol} size={22} />
              <div className="stock-card-symbol">{stock.symbol}</div>
              {earningsSoon && (
                <span
                  className="stock-card-earnings"
                  title={`Earnings in ${daysAway}d`}
                >
                  E {daysAway}d
                </span>
              )}
              {hasNews && (
                <button
                  className="stock-card-news-btn"
                  onClick={handleNewsClick}
                  aria-label={`News for ${stock.symbol}`}
                  title="View news"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2" />
                    <line x1="10" y1="6" x2="18" y2="6" />
                    <line x1="10" y1="10" x2="18" y2="10" />
                    <line x1="10" y1="14" x2="14" y2="14" />
                  </svg>
                </button>
              )}
              {onSetNote && (
                <button
                  className={`stock-card-note-btn${hasNote ? " stock-card-note-btn--active" : ""}`}
                  onClick={handleNoteClick}
                  aria-label="Stock note"
                  title={hasNote ? "Edit note" : "Add note"}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill={hasNote ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              )}
              {onToggleFavorite && (
                <button
                  className={`stock-card-fav-btn${isFavorite ? " stock-card-fav-btn--active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isFavorite) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      triggerBurst(
                        rect.left + rect.width / 2,
                        rect.top + rect.height / 2,
                        "#ffd700",
                        12,
                      );
                    }
                    onToggleFavorite();
                  }}
                  aria-label={
                    isFavorite ? "Remove from favorites" : "Add to favorites"
                  }
                  title={
                    isFavorite ? "Remove from favorites" : "Add to favorites"
                  }
                >
                  {isFavorite ? "\u2605" : "\u2606"}
                </button>
              )}
            </div>
            <div
              className={`stock-card-change ${isPositive ? "change-up-badge" : "change-down-badge"}`}
            >
              {isPositive ? "+" : ""}
              {animatedPercent.toFixed(2)}%
            </div>
          </div>
          {hasNote && !showNote && (
            <div className="stock-card-note-preview" onClick={handleNoteClick}>
              {note.text}
            </div>
          )}
          <div className="stock-card-name">{stock.name}</div>
          <div className={`stock-card-price ${flash || ""}`}>
            {formatPrice(animatedPrice)}
          </div>
          {stock.extPrice != null && (
            <div className="stock-card-ext">
              <span className="stock-card-ext-label">
                {stock.extMarketState === "pre" ? "Pre" : "AH"}
              </span>
              <span className="stock-card-ext-price">
                {formatPrice(stock.extPrice)}
              </span>
              <span
                className={`stock-card-ext-change ${stock.extChangePercent >= 0 ? "change-up" : "change-down"}`}
              >
                {stock.extChangePercent >= 0 ? "+" : ""}
                {stock.extChangePercent.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="stock-card-meta">
            <span>Vol {formatVolume(stock.volume)}</span>
            {stock.marketCap && (
              <span>MCap {formatVolume(stock.marketCap)}</span>
            )}
          </div>
          <div className="stock-card-chart">
            <MiniChart
              symbol={stock.symbol}
              isPositive={isPositive}
              data={chartData}
            />
          </div>
        </div>

        {/* BACK OF CARD (Flipped State) */}
        <div className="card-back">
          <div className="card-back-header">
            <div className="stock-card-symbol">{stock.symbol}</div>
            <div className="card-back-title">Quick Overview</div>
          </div>
          <div className="card-back-grid">
            <div className="card-back-stat">
              <span>Market Cap</span>
              <strong>
                {(stats?.marketCap || stock.marketCap) ? formatVolume(stats?.marketCap || stock.marketCap) : "--"}
              </strong>
            </div>
            <div className="card-back-stat">
              <span>P/E Ratio</span>
              <strong>{stats?.peRatio ? stats.peRatio.toFixed(2) : "--"}</strong>
            </div>
            <div className="card-back-stat">
              <span>EPS</span>
              <strong>{stats?.eps ? `$${stats.eps.toFixed(2)}` : "--"}</strong>
            </div>
            <div className="card-back-stat">
              <span>52W High</span>
              <strong>
                {stats?.fiftyTwoWeekHigh
                  ? formatPrice(stats.fiftyTwoWeekHigh)
                  : "--"}
              </strong>
            </div>
            <div className="card-back-stat">
              <span>52W Low</span>
              <strong>
                {stats?.fiftyTwoWeekLow
                  ? formatPrice(stats.fiftyTwoWeekLow)
                  : "--"}
              </strong>
            </div>
            <div className="card-back-stat">
              <span>Target</span>
              <strong>{stats?.priceTarget ? formatPrice(stats.priceTarget) : "--"}</strong>
            </div>
          </div>
          <button className="card-back-btn" onClick={handleFullChartClick}>
            View Full Chart
          </button>
        </div>
      </div>

      <ParticleOverlay />

      {showNews && hasNews && (
        <NewsPopover
          articles={newsArticles}
          onClose={() => setShowNews(false)}
        />
      )}
      {showNote &&
        createPortal(
          <div className="note-overlay" onClick={() => setShowNote(false)}>
            <div className="note-modal" onClick={(e) => e.stopPropagation()}>
              <div className="stock-note-popover-header">
                <span className="stock-note-popover-title">
                  Note — {stock.symbol}
                </span>
                <button
                  className="stock-note-popover-close"
                  onClick={() => setShowNote(false)}
                >
                  &times;
                </button>
              </div>
              <textarea
                className="stock-note-textarea"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={handleNoteKeyDown}
                placeholder="Add a note... (Enter to save, Shift+Enter for new line)"
                rows={3}
                autoFocus
              />
              <div className="stock-note-actions">
                {note && (
                  <button
                    className="stock-note-delete"
                    onClick={() => {
                      onSetNote("");
                      setShowNote(false);
                    }}
                  >
                    Delete
                  </button>
                )}
                <button className="stock-note-save" onClick={handleNoteSave}>
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
}
