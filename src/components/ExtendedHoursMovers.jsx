import { useState, useRef, useEffect } from 'react';
import { useMovers } from '../hooks/useMovers.js';
import StockLogo from './StockLogo.jsx';

function detectSession() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return 'pre';    // 4:00 AM – 9:30 AM ET
  if (mins >= 570 && mins < 960) return 'market';  // 9:30 AM – 4:00 PM ET
  if (mins >= 960 && mins < 1200) return 'post';   // 4:00 PM – 8:00 PM ET
  return 'closed';                                   // 8:00 PM – 4:00 AM ET
}

function formatVolume(v) {
  if (!v) return '--';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function formatPrice(p) {
  if (p == null) return '--';
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCap(mc) {
  if (!mc) return '';
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(0)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return '';
}

function MoverRow({ stock, rank, type, onClick }) {
  const isGainer = type === 'gainer';
  const prevPriceRef = useRef(stock.price);
  const mountedRef = useRef(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevPriceRef.current = stock.price;
      return;
    }
    const prev = prevPriceRef.current;
    if (prev != null && stock.price !== prev) {
      setFlash(stock.price > prev ? 'flash-up' : 'flash-down');
      const timer = setTimeout(() => setFlash(null), 700);
      prevPriceRef.current = stock.price;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = stock.price;
  }, [stock.price]);

  return (
    <button className={`movers-row${flash ? ` ${flash}` : ''}`} onClick={() => onClick(stock)}>
      <span className="movers-row-rank">{rank}</span>
      <StockLogo symbol={stock.symbol} size={18} />
      <div className="movers-row-info">
        <span className="movers-row-symbol">{stock.symbol}</span>
        <span className="movers-row-name">{stock.name}</span>
      </div>
      <div className="movers-row-data">
        <span className={`movers-row-price${flash ? ` ${flash}` : ''}`}>${formatPrice(stock.price)}</span>
        <span className="movers-row-mcap">{formatMarketCap(stock.marketCap)}</span>
      </div>
      <div className="movers-row-right">
        <span className={`movers-row-change ${isGainer ? 'positive' : 'negative'}`}>
          {isGainer ? '+' : ''}{stock.change?.toFixed(2)}%
        </span>
        <span className="movers-row-volume">Vol: {formatVolume(stock.volume)}</span>
      </div>
    </button>
  );
}

function SkeletonLoader() {
  return (
    <div className="movers-columns">
      {[0, 1].map(col => (
        <div key={col} className="movers-section">
          <div className="movers-section-title">{col === 0 ? 'Gainers' : 'Losers'}</div>
          <div className="movers-list">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className="movers-skeleton-row">
                <div className="skeleton-line" style={{ width: 14, height: 10 }} />
                <div className="skeleton-circle" style={{ width: 18, height: 18 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div className="skeleton-line" style={{ width: 40, height: 11 }} />
                  <div className="skeleton-line" style={{ width: 70, height: 9 }} />
                </div>
                <div className="skeleton-line" style={{ width: 48, height: 12 }} />
                <div className="skeleton-line" style={{ width: 42, height: 18, borderRadius: 9 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExtendedHoursMovers({ active, onSelectStock }) {
  const detectedSession = detectSession();
  // During market/closed, default to the most relevant ext session for fetching
  const apiSession = detectedSession === 'pre' ? 'pre'
    : detectedSession === 'market' ? 'pre'   // show most recent pre-market data
    : 'post';                                  // post or closed
  const [session, setSession] = useState(apiSession);
  const isMarketOpen = detectedSession === 'market';
  const isClosed = detectedSession === 'closed';
  // Stop polling when the selected session isn't actively trading
  const pollingStopped = (session === 'pre' && detectedSession !== 'pre')
    || (session === 'post' && detectedSession !== 'post');
  const { gainers, losers, loading, lastUpdated } = useMovers(active, session, isClosed || isMarketOpen || pollingStopped);

  const handleClick = (stock) => {
    if (onSelectStock) {
      onSelectStock({ symbol: stock.symbol, name: stock.name });
    }
  };

  const sessionLabel = session === 'pre' ? 'Pre-Market' : 'After-Hours';
  const statusLabel = isMarketOpen ? 'Market Open'
    : isClosed ? 'Market Closed'
    : `${sessionLabel} active`;

  return (
    <main className="movers-main">
      <div className="movers-header">
        <div className="movers-header-left">
          <h2 className="movers-title">Extended Hours Movers</h2>
          <span className="movers-status">
            <span className={`movers-status-dot${isMarketOpen ? ' movers-status-dot--market' : isClosed ? ' movers-status-dot--closed' : ''}`} />
            {statusLabel}
          </span>
        </div>
        <div className="movers-header-right">
          <div className="movers-session-toggle">
            <button
              className={`movers-session-btn${session === 'pre' ? ' active' : ''}`}
              onClick={() => setSession('pre')}
            >
              Pre-Market
            </button>
            <button
              className={`movers-session-btn${session === 'post' ? ' active' : ''}`}
              onClick={() => setSession('post')}
            >
              After-Hours
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader />
      ) : (
        <div className="movers-columns">
          <div className="movers-section">
            <div className="movers-section-header">
              <span className="movers-section-title movers-section-title--gain">Gainers</span>
              <span className="movers-section-count">{gainers.length}</span>
            </div>
            <div className="movers-list">
              {gainers.length > 0 ? (
                gainers.map((stock, i) => (
                  <MoverRow key={stock.symbol} stock={stock} rank={i + 1} type="gainer" onClick={handleClick} />
                ))
              ) : (
                <div className="movers-empty">No {sessionLabel.toLowerCase()} gainers</div>
              )}
            </div>
          </div>
          <div className="movers-section">
            <div className="movers-section-header">
              <span className="movers-section-title movers-section-title--lose">Losers</span>
              <span className="movers-section-count">{losers.length}</span>
            </div>
            <div className="movers-list">
              {losers.length > 0 ? (
                losers.map((stock, i) => (
                  <MoverRow key={stock.symbol} stock={stock} rank={i + 1} type="loser" onClick={handleClick} />
                ))
              ) : (
                <div className="movers-empty">No {sessionLabel.toLowerCase()} losers</div>
              )}
            </div>
          </div>
        </div>
      )}

      {lastUpdated && (
        <div className="movers-footer">
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </main>
  );
}
