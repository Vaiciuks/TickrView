import { useRef, useState, useEffect, useCallback } from 'react';
import { lockScroll, unlockScroll } from '../hooks/useScrollLock.js';
import StockCard from './StockCard.jsx';

const LONG_PRESS_MS = 400;

export default function FavoritesGrid({
  favorites = [],
  chartMap,
  onSelectStock,
  isFavorite,
  onToggleFavorite,
  hasNews,
  getNews,
  hasStockNote,
  getStockNote,
  setStockNote,
  onReorderFavorites,
  isInGrid,
}) {
  const gridRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const startDragRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressStart = useRef(null);
  const longPressFired = useRef(false);
  const [heldIndex, setHeldIndex] = useState(-1);

  // Block selectstart during long-press detection & drag
  const preventSelect = useCallback((e) => { e.preventDefault(); }, []);
  const startSelectionBlock = useCallback(() => {
    document.addEventListener('selectstart', preventSelect, { capture: true });
  }, [preventSelect]);
  const stopSelectionBlock = useCallback(() => {
    document.removeEventListener('selectstart', preventSelect, { capture: true });
    window.getSelection()?.removeAllRanges();
  }, [preventSelect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) dragCleanupRef.current();
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      stopSelectionBlock();
    };
  }, [stopSelectionBlock]);

  const startDrag = useCallback((fromIndex, x, y, cardEl) => {
    if (dragCleanupRef.current) dragCleanupRef.current();
    const gridEl = gridRef.current;
    if (!gridEl || !cardEl) return;

    window.getSelection()?.removeAllRanges();

    const cardRect = cardEl.getBoundingClientRect();

    // Ghost element
    const ghost = cardEl.cloneNode(true);
    ghost.className = 'fav-drag-ghost';
    ghost.style.cssText = `
      position:fixed;z-index:9999;pointer-events:none;
      width:${cardRect.width}px;height:${cardRect.height}px;
      left:0;top:0;will-change:transform;
    `;
    document.body.appendChild(ghost);

    // Mark source card
    cardEl.classList.add('fav-card--dragging');

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    // Capture doc height BEFORE locking scroll
    const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const maxScroll = Math.max(0, docHeight - window.innerHeight);

    // Lock scroll (iOS-compatible: position:fixed on body)
    let scrollY = lockScroll();

    // Prevent browser touch handling (scroll, pull-to-refresh)
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.touchAction = 'none';
    const prevOverscroll = document.documentElement.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = 'contain';

    const offsetX = x - cardRect.left;
    const offsetY = y - cardRect.top;
    let lastX = x, lastY = y;
    let moved = false;
    let currentOverEl = null;
    let scrollRaf = null;

    // Unified render loop: auto-scroll + ghost + hit-testing
    const frame = () => {
      const edge = 60;
      const topDist = lastY;
      const bottomDist = window.innerHeight - lastY;

      if (topDist < edge && scrollY > 0) {
        const t = 1 - topDist / edge;
        const speed = Math.round(t * t * 12) + 1;
        scrollY = Math.max(0, scrollY - speed);
        document.body.style.top = `-${scrollY}px`;
      } else if (bottomDist < edge && scrollY < maxScroll) {
        const t = 1 - bottomDist / edge;
        const speed = Math.round(t * t * 12) + 1;
        scrollY = Math.min(maxScroll, scrollY + speed);
        document.body.style.top = `-${scrollY}px`;
      }

      ghost.style.transform = `translate3d(${lastX - offsetX}px,${lastY - offsetY}px,0)`;

      // Hit-test every frame (cards shift during auto-scroll)
      let foundEl = null;
      const cards = gridEl.querySelectorAll('[data-fav-index]');
      for (const el of cards) {
        if (el === cardEl) continue;
        const r = el.getBoundingClientRect();
        if (lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom) {
          foundEl = el;
          break;
        }
      }

      if (foundEl !== currentOverEl) {
        if (currentOverEl) currentOverEl.classList.remove('fav-card--dragover');
        currentOverEl = foundEl;
        if (currentOverEl) currentOverEl.classList.add('fav-card--dragover');
      }

      scrollRaf = requestAnimationFrame(frame);
    };
    scrollRaf = requestAnimationFrame(frame);

    const onMove = (ev) => {
      ev.preventDefault();
      let cx, cy;
      if (ev.touches) {
        const touch = ev.touches[0];
        if (!touch) return;
        cx = touch.clientX;
        cy = touch.clientY;
      } else {
        cx = ev.clientX;
        cy = ev.clientY;
      }
      lastX = cx;
      lastY = cy;
      moved = true;
    };

    const cleanup = () => {
      cancelAnimationFrame(scrollRaf);
      unlockScroll(scrollY);
      document.body.style.touchAction = prevTouchAction;
      document.documentElement.style.overscrollBehavior = prevOverscroll;
      ghost.remove();
      cardEl.classList.remove('fav-card--dragging');
      if (currentOverEl) currentOverEl.classList.remove('fav-card--dragover');
      setHeldIndex(-1);
      stopSelectionBlock();
      dragCleanupRef.current = null;

      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove, { passive: false });
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onEnd = () => {
      const targetIdx = currentOverEl
        ? parseInt(currentOverEl.getAttribute('data-fav-index'), 10)
        : -1;
      cleanup();
      if (moved && targetIdx >= 0 && targetIdx !== fromIndex) {
        onReorderFavorites(fromIndex, targetIdx);
      }
    };

    const onKeyDown = (e) => { if (e.key === 'Escape') cleanup(); };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    window.addEventListener('keydown', onKeyDown);

    dragCleanupRef.current = cleanup;
  }, [onReorderFavorites, stopSelectionBlock]);

  // Keep startDrag accessible to the long-press timeout closure
  startDragRef.current = startDrag;

  // Pointer events: unified mouse + touch long-press handling
  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    const wrapper = e.target.closest('[data-fav-index]');
    if (!wrapper) return;
    const idx = parseInt(wrapper.getAttribute('data-fav-index'), 10);
    if (isNaN(idx)) return;

    longPressFired.current = false;
    longPressStart.current = { x: e.clientX, y: e.clientY, idx, el: wrapper };

    // Immediately block text selection while finger is down
    startSelectionBlock();

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      window.getSelection()?.removeAllRanges();
      setHeldIndex(idx);
      startDragRef.current(idx, longPressStart.current.x, longPressStart.current.y, wrapper);
    }, LONG_PRESS_MS);
  }, [startSelectionBlock]);

  const handlePointerMove = useCallback((e) => {
    if (!longPressTimer.current) return;
    const dx = Math.abs(e.clientX - longPressStart.current.x);
    const dy = Math.abs(e.clientY - longPressStart.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      stopSelectionBlock();
    }
  }, [stopSelectionBlock]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    stopSelectionBlock();
  }, [stopSelectionBlock]);

  // Suppress clicks after drag so cards don't open
  const handleClick = useCallback((e) => {
    if (longPressFired.current) {
      e.stopPropagation();
      e.preventDefault();
      longPressFired.current = false;
    }
  }, []);

  const handleContextMenu = useCallback((e) => {
    if (longPressFired.current || longPressTimer.current) {
      e.preventDefault();
    }
  }, []);

  return (
    <main className="fav-main">
      <div className="fav-header">
        <h2 className="fav-title">
          Favorites
          {favorites.length > 0 && (
            <span className="fav-count">{favorites.length}</span>
          )}
        </h2>
        <span className="fav-hint">Long-press a card to rearrange</span>
      </div>

      {favorites.length === 0 ? (
        <div className="fav-empty">
          <svg className="fav-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p className="fav-empty-text">Star stocks from any tab to build your favorites</p>
          <p className="fav-empty-sub">Click the star icon on any stock card to add it here</p>
        </div>
      ) : (
        <div
          className="stock-grid fav-grid"
          ref={gridRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onClickCapture={handleClick}
          onContextMenu={handleContextMenu}
        >
          {favorites.map((stock, idx) => (
            <div
              key={stock.symbol}
              data-fav-index={idx}
              className={`fav-card-wrap${heldIndex === idx ? ' fav-card--held' : ''}`}
            >
              <StockCard
                stock={stock}
                chartData={chartMap[stock.symbol] || null}
                isSelected={isInGrid(stock.symbol)}
                onClick={(e) => onSelectStock(stock, e)}
                hasNews={hasNews(stock.symbol)}
                newsArticles={getNews(stock.symbol)}
                isFavorite={isFavorite(stock.symbol)}
                onToggleFavorite={() => onToggleFavorite(stock.symbol)}
                hasNote={hasStockNote(stock.symbol)}
                note={getStockNote(stock.symbol)}
                onSetNote={(text) => setStockNote(stock.symbol, text)}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
