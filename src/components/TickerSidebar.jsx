import { useState, useEffect, useRef, useCallback } from 'react';
import { formatPrice } from '../utils/formatters.js';
import { useScrollLock } from '../hooks/useScrollLock.js';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber.js';
import NewsPopover from './NewsPopover.jsx';
import StockLogo from './StockLogo.jsx';

const LONG_PRESS_MS = 300;

const BADGE_MODES = ['percent', 'price', 'dollar'];

function TickerRow({ stock, onClick, starred, onToggleStar, hasNews, newsArticles, draggable, index, onDragStart, badgeMode, onCycleBadge }) {
  const isPositive = stock.changePercent >= 0;
  const prevPriceRef = useRef(stock.price);
  const [flash, setFlash] = useState(null);
  const [showNews, setShowNews] = useState(false);
  const longPressRef = useRef(null);
  const rowRef = useRef(null);
  const startPosRef = useRef(null);

  useEffect(() => {
    const prev = prevPriceRef.current;
    if (prev != null && stock.price !== prev) {
      setFlash(stock.price > prev ? 'flash-up' : 'flash-down');
      const timer = setTimeout(() => setFlash(null), 700);
      prevPriceRef.current = stock.price;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = stock.price;
  }, [stock.price]);

  // Clear long-press on unmount
  useEffect(() => {
    return () => { if (longPressRef.current) clearTimeout(longPressRef.current); };
  }, []);

  const handleStarClick = (e) => {
    e.stopPropagation();
    onToggleStar(stock.symbol);
  };

  const handleNewsClick = (e) => {
    e.stopPropagation();
    setShowNews(prev => !prev);
  };

  const animatedPrice = useAnimatedNumber(stock.price);
  const animatedPercent = useAnimatedNumber(stock.changePercent);
  const animatedChange = useAnimatedNumber(stock.change || 0);
  const extPositive = stock.extChangePercent >= 0;

  const badgeText = badgeMode === 'price'
    ? formatPrice(animatedPrice)
    : badgeMode === 'dollar'
      ? `${animatedChange >= 0 ? '+' : ''}$${Math.abs(animatedChange).toFixed(2)}`
      : `${isPositive ? '+' : ''}${animatedPercent.toFixed(2)}%`;

  const handleBadgeClick = (e) => {
    e.stopPropagation();
    onCycleBadge();
  };

  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  // Mouse: long-press to drag
  const handleMouseDown = (e) => {
    if (!draggable || e.button !== 0) return;
    // Don't start drag from interactive children (star, news btn)
    if (e.target.closest('button')) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      onDragStart(index, e.clientX, e.clientY, rowRef.current);
    }, LONG_PRESS_MS);
  };

  const handleMouseMove = (e) => {
    if (!longPressRef.current || !startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 5 || dy > 5) cancelLongPress();
  };

  const handleMouseUp = () => cancelLongPress();

  // Touch: long-press to drag
  const handleTouchStart = (e) => {
    if (!draggable) return;
    if (e.target.closest('button')) return;
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      onDragStart(index, touch.clientX, touch.clientY, rowRef.current, true);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e) => {
    if (!longPressRef.current || !startPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPosRef.current.x);
    const dy = Math.abs(touch.clientY - startPosRef.current.y);
    if (dx > 5 || dy > 5) cancelLongPress();
  };

  const handleTouchEnd = () => cancelLongPress();

  return (
    <div
      ref={rowRef}
      className={`ticker-row ${flash || ''}`}
      data-drag-index={draggable ? index : undefined}
      onClick={(e) => onClick(e)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e); }}
    >
      <button
        className={`ticker-row-star${starred ? ' starred' : ''}`}
        onClick={handleStarClick}
        aria-label={starred ? `Remove ${stock.symbol} from favorites` : `Add ${stock.symbol} to favorites`}
      >
        {starred ? '\u2605' : '\u2606'}
      </button>
      <StockLogo symbol={stock.symbol} size={28} />
      <div className="ticker-row-info">
        <div className="ticker-row-info-top">
          <span className="ticker-row-symbol">{stock.symbol}</span>
          {hasNews && (
            <button className="ticker-row-news-btn" onClick={handleNewsClick} aria-label={`News for ${stock.symbol}`} title="View news">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/>
                <line x1="10" y1="6" x2="18" y2="6"/><line x1="10" y1="10" x2="18" y2="10"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </button>
          )}
        </div>
        {stock.name && <span className="ticker-row-name">{stock.name}</span>}
      </div>
      <div className="ticker-row-right">
        <button
          className={`ticker-row-badge ${isPositive ? 'badge-up' : 'badge-down'} ${flash || ''}`}
          onClick={handleBadgeClick}
          title="Click to cycle: %Change / Price / $Change"
        >
          {badgeText}
        </button>
        {stock.extPrice != null && (
          <span className={`ticker-row-ext-line ${extPositive ? 'change-up' : 'change-down'}`}>
            {stock.extMarketState === 'pre' ? 'Pre' : 'AH'}: {extPositive ? '+' : ''}{stock.extChangePercent.toFixed(2)}%
          </span>
        )}
      </div>
      {showNews && hasNews && (
        <NewsPopover articles={newsArticles} onClose={() => setShowNews(false)} />
      )}
    </div>
  );
}

export default function TickerSidebar({ favorites, recentStocks = [], onToggleFavorite, isFavorite, onReorderFavorites, onSelectStock, onSearch, isOpen, onToggle, hasNews, getNews, portfolio = [], onOpenPortfolio }) {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [activeWatchTab, setActiveWatchTab] = useState('favorites');
  const [badgeMode, setBadgeMode] = useState(() => {
    try { return localStorage.getItem('tickrpulse-badge-mode') || 'percent'; } catch { return 'percent'; }
  });

  const cycleBadge = useCallback(() => {
    setBadgeMode(prev => {
      const next = BADGE_MODES[(BADGE_MODES.indexOf(prev) + 1) % BADGE_MODES.length];
      try { localStorage.setItem('tickrpulse-badge-mode', next); } catch {}
      return next;
    });
  }, []);
  const sidebarRef = useRef(null);
  const searchWrapperRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);
  const dragCleanupRef = useRef(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handle = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.results);
        setShowSuggestions(data.results.length > 0);
        setActiveIndex(-1);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const selectSymbol = (symbol) => {
    onSearch(symbol);
    setSearch('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      selectSymbol(suggestions[activeIndex].symbol);
    } else {
      const symbol = search.trim().toUpperCase();
      if (symbol) selectSymbol(symbol);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i < suggestions.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i > 0 ? i - 1 : suggestions.length - 1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  useScrollLock(isOpen && window.matchMedia('(max-width: 1024px)').matches);

  // Dispatch resize after sidebar transition so charts reflow
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const handleEnd = (e) => {
      if (e.propertyName === 'width') {
        window.dispatchEvent(new Event('resize'));
      }
    };
    el.addEventListener('transitionend', handleEnd);
    return () => el.removeEventListener('transitionend', handleEnd);
  }, []);

  // Cleanup drag on unmount
  useEffect(() => {
    return () => { if (dragCleanupRef.current) dragCleanupRef.current(); };
  }, []);

  const startDrag = useCallback((fromIndex, startX, startY, rowEl, isTouch = false) => {
    if (!listRef.current || !rowEl) return;

    const listEl = listRef.current;
    const rowRect = rowEl.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();

    // Create ghost
    const ghost = document.createElement('div');
    ghost.className = 'ticker-drag-ghost';
    ghost.textContent = favorites[fromIndex]?.symbol || '';
    ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;width:${Math.min(rowRect.width, 200)}px;`;
    document.body.appendChild(ghost);

    let lastY = startY;
    let currentOverIndex = -1;
    let scrollRaf = null;
    let moved = false;

    // Mark source row
    rowEl.classList.add('ticker-row--dragging');

    const updateGhost = () => {
      ghost.style.transform = `translate3d(${rowRect.left}px,${lastY - rowRect.height / 2}px,0)`;
    };
    updateGhost();

    const getTargetIndex = (clientY) => {
      const rows = listEl.querySelectorAll('[data-drag-index]');
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          return parseInt(el.getAttribute('data-drag-index'), 10);
        }
      }
      if (clientY < listRect.top) return 0;
      return favorites.length - 1;
    };

    const clearOverClass = () => {
      listEl.querySelectorAll('.ticker-row--dragover-above,.ticker-row--dragover-below').forEach(el => {
        el.classList.remove('ticker-row--dragover-above', 'ticker-row--dragover-below');
      });
    };

    const updateOver = () => {
      clearOverClass();
      const idx = getTargetIndex(lastY);
      if (idx >= 0 && idx !== fromIndex) {
        const targetEl = listEl.querySelector(`[data-drag-index="${idx}"]`);
        if (targetEl) {
          targetEl.classList.add(idx < fromIndex ? 'ticker-row--dragover-above' : 'ticker-row--dragover-below');
        }
      }
      currentOverIndex = idx;
    };

    // Auto-scroll the sidebar list
    const autoScroll = () => {
      const edge = 40;
      const topDist = lastY - listRect.top;
      const bottomDist = listRect.bottom - lastY;

      if (topDist < edge && listEl.scrollTop > 0) {
        const t = 1 - Math.max(0, topDist) / edge;
        listEl.scrollTop -= Math.round(t * t * 8) + 1;
      } else if (bottomDist < edge && listEl.scrollTop < listEl.scrollHeight - listEl.clientHeight) {
        const t = 1 - Math.max(0, bottomDist) / edge;
        listEl.scrollTop += Math.round(t * t * 8) + 1;
      }

      updateOver();
      scrollRaf = requestAnimationFrame(autoScroll);
    };
    scrollRaf = requestAnimationFrame(autoScroll);

    const onMove = (e) => {
      if (isTouch) {
        const touch = e.touches[0];
        if (!touch) return;
        lastY = touch.clientY;
        e.preventDefault();
      } else {
        lastY = e.clientY;
      }
      moved = true;
      updateGhost();
    };

    const onEnd = () => {
      cleanup();
      if (moved && currentOverIndex >= 0 && currentOverIndex !== fromIndex) {
        onReorderFavorites(fromIndex, currentOverIndex);
      }
    };

    const onCancel = () => cleanup();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup();
    };

    const cleanup = () => {
      cancelAnimationFrame(scrollRaf);
      ghost.remove();
      rowEl.classList.remove('ticker-row--dragging');
      clearOverClass();
      dragCleanupRef.current = null;

      if (isTouch) {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onCancel);
      } else {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
      }
      window.removeEventListener('keydown', onKeyDown);
    };

    dragCleanupRef.current = cleanup;

    if (isTouch) {
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onCancel);
    } else {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
    }
    window.addEventListener('keydown', onKeyDown);
  }, [favorites, onReorderFavorites]);

  // Open portfolio and close sidebar (for mobile)
  const handleOpenPortfolio = useCallback(() => {
    if (onOpenPortfolio) onOpenPortfolio();
    if (isOpen) onToggle();
  }, [onOpenPortfolio, isOpen, onToggle]);

  // Filter out favorites from recent to avoid duplicates
  const favSymbols = new Set(favorites.map(s => s.symbol));
  const filteredRecent = recentStocks.filter(s => !favSymbols.has(s.symbol));

  return (
    <>
      <aside ref={sidebarRef} className={`ticker-sidebar ${isOpen ? 'ticker-sidebar--open' : 'ticker-sidebar--closed'}`}>
        <button
          className={`ticker-sidebar-toggle${!isOpen ? ' ticker-sidebar-toggle--collapsed' : ''}`}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? '\u25C0' : (
            <>
              <span className="toggle-icon">{'\u25B6'}</span>
              <span className="toggle-label">Watchlist</span>
            </>
          )}
        </button>

        {/* Desktop portfolio edge toggle — below watchlist toggle */}
        {!isOpen && onOpenPortfolio && (
          <button
            className="portfolio-edge-toggle"
            onClick={onOpenPortfolio}
            aria-label="Open portfolio"
          >
            <span className="toggle-icon">&#128188;</span>
            <span className="toggle-label">Portfolio</span>
          </button>
        )}

        <div className="ticker-sidebar-content">
          <div className="ticker-sidebar-header">
            <div className="ticker-sidebar-title-row">
              <span className="ticker-sidebar-title">My Watchlist</span>
              <div className="ticker-sidebar-search-wrapper" ref={searchWrapperRef}>
                <form onSubmit={handleSearchSubmit}>
                  <input
                    className="ticker-sidebar-search"
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onKeyDown={handleSearchKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </form>
                {showSuggestions && (
                  <ul className="ticker-sidebar-suggestions">
                    {suggestions.map((item, i) => (
                      <li
                        key={item.symbol}
                        className={`ticker-sidebar-suggestion${i === activeIndex ? ' ticker-sidebar-suggestion-active' : ''}`}
                        onMouseDown={() => selectSymbol(item.symbol)}
                        onMouseEnter={() => setActiveIndex(i)}
                      >
                        <button
                          className={`ticker-sidebar-suggestion-star${isFavorite(item.symbol) ? ' starred' : ''}`}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(item.symbol);
                          }}
                          aria-label={isFavorite(item.symbol) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {isFavorite(item.symbol) ? '\u2605' : '\u2606'}
                        </button>
                        <span className="ticker-sidebar-suggestion-symbol">{item.symbol}</span>
                        <span className="ticker-sidebar-suggestion-name">{item.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="ticker-sidebar-tabs">
            <button
              className={`ticker-sidebar-tab${activeWatchTab === 'favorites' ? ' ticker-sidebar-tab--active' : ''}`}
              onClick={() => setActiveWatchTab('favorites')}
            >
              Favorites{favorites.length > 0 ? ` (${favorites.length})` : ''}
            </button>
            <button
              className={`ticker-sidebar-tab${activeWatchTab === 'recent' ? ' ticker-sidebar-tab--active' : ''}`}
              onClick={() => setActiveWatchTab('recent')}
            >
              Recent{filteredRecent.length > 0 ? ` (${filteredRecent.length})` : ''}
            </button>
            <button
              className={`ticker-sidebar-tab ticker-sidebar-tab--portfolio${activeWatchTab === 'portfolio' ? ' ticker-sidebar-tab--active' : ''}`}
              onClick={() => setActiveWatchTab('portfolio')}
            >
              Portfolio{portfolio.length > 0 ? ` (${portfolio.length})` : ''}
            </button>
          </div>

          <div className="ticker-sidebar-list" ref={listRef}>
            {activeWatchTab === 'favorites' && (
              <>
                {favorites.map((stock, i) => (
                  <TickerRow
                    key={stock.symbol}
                    stock={stock}
                    index={i}
                    draggable={true}
                    onDragStart={startDrag}
                    starred={true}
                    onToggleStar={onToggleFavorite}
                    onClick={(e) => onSelectStock(stock, e)}
                    hasNews={hasNews(stock.symbol)}
                    newsArticles={getNews(stock.symbol)}
                    badgeMode={badgeMode}
                    onCycleBadge={cycleBadge}
                  />
                ))}
                {favorites.length === 0 && (
                  <div className="ticker-sidebar-empty">
                    Click ☆ on any stock to add it to your favorites
                  </div>
                )}
              </>
            )}

            {activeWatchTab === 'recent' && (
              <>
                {filteredRecent.map(stock => (
                  <TickerRow
                    key={stock.symbol}
                    stock={stock}
                    starred={isFavorite(stock.symbol)}
                    onToggleStar={onToggleFavorite}
                    onClick={(e) => onSelectStock(stock, e)}
                    hasNews={hasNews(stock.symbol)}
                    newsArticles={getNews(stock.symbol)}
                    badgeMode={badgeMode}
                    onCycleBadge={cycleBadge}
                  />
                ))}
                {filteredRecent.length === 0 && (
                  <div className="ticker-sidebar-empty">
                    Stocks you view will appear here
                  </div>
                )}
              </>
            )}

            {activeWatchTab === 'portfolio' && (
              <>
                {portfolio.length > 0 && (
                  <div className="pf-sidebar-summary">
                    <span className="pf-sidebar-total">
                      {portfolio.reduce((sum, h) => sum + (h.marketValue || 0), 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                    </span>
                    {(() => {
                      const totalPL = portfolio.reduce((sum, h) => sum + (h.pl || 0), 0);
                      return (
                        <span className={`pf-sidebar-pl ${totalPL >= 0 ? 'pf-up' : 'pf-down'}`}>
                          {totalPL >= 0 ? '+' : ''}{totalPL.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                        </span>
                      );
                    })()}
                  </div>
                )}
                {portfolio.map(h => (
                  <div
                    key={h.symbol}
                    className="ticker-row pf-sidebar-row"
                    onClick={() => onSelectStock({ symbol: h.symbol, name: h.name, price: h.price, change: h.change, changePercent: h.changePercent })}
                    role="button"
                    tabIndex={0}
                  >
                    <StockLogo symbol={h.symbol} size={28} />
                    <div className="ticker-row-info">
                      <div className="ticker-row-info-top">
                        <span className="ticker-row-symbol">{h.symbol}</span>
                      </div>
                      <span className="ticker-row-name">{h.shares} shares @ {formatPrice(h.avgCost)}</span>
                    </div>
                    <div className="ticker-row-right">
                      <span className={`ticker-row-badge ${(h.pl || 0) >= 0 ? 'badge-up' : 'badge-down'}`}>
                        {h.pl != null ? `${h.pl >= 0 ? '+' : ''}$${Math.abs(h.pl).toFixed(2)}` : '—'}
                      </span>
                      {h.price != null && (
                        <span className={`ticker-row-ext-line ${h.changePercent >= 0 ? 'change-up' : 'change-down'}`}>
                          {formatPrice(h.price)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {portfolio.length > 0 && onOpenPortfolio && (
                  <button className="pf-sidebar-open-btn" onClick={handleOpenPortfolio}>
                    Open Full Portfolio View
                  </button>
                )}
                {portfolio.length === 0 && (
                  <div className="ticker-sidebar-empty">
                    {onOpenPortfolio ? (
                      <button className="pf-sidebar-open-btn" onClick={handleOpenPortfolio}>
                        Open Portfolio to add holdings
                      </button>
                    ) : 'No holdings yet'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {isOpen && <div className="ticker-sidebar-backdrop" onClick={onToggle} />}
    </>
  );
}
