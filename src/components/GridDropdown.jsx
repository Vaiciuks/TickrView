import { useState, useEffect, useRef } from 'react';
import { formatPrice } from '../utils/formatters.js';
import { useScrollLock } from '../hooks/useScrollLock.js';
import StockLogo from './StockLogo.jsx';

export default function GridDropdown({ label, stocks = [], onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useScrollLock(open);

  return (
    <div className="grid-dropdown" ref={ref}>
      <button className="grid-dropdown-btn" onClick={() => setOpen(o => !o)}>
        {label}
        <span className="grid-dropdown-count">{stocks.length}</span>
        <svg className={`grid-dropdown-arrow${open ? ' grid-dropdown-arrow--open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4L5 6.5L7.5 4" />
        </svg>
      </button>
      {open && stocks.length > 0 && (
        <div className="grid-dropdown-panel">
          <div className="grid-dropdown-header">{label} <span>{stocks.length} stocks</span></div>
          <div className="grid-dropdown-list">
            {stocks.slice(0, 30).map(stock => {
              const isPos = stock.changePercent >= 0;
              return (
                <button
                  key={stock.symbol}
                  className="grid-dropdown-row"
                  onClick={() => { setOpen(false); onSelect(stock); }}
                >
                  <StockLogo symbol={stock.symbol} size={16} />
                  <span className="grid-dropdown-symbol">{stock.symbol}</span>
                  <span className="grid-dropdown-price">{formatPrice(stock.price)}</span>
                  <span className={`grid-dropdown-change ${isPos ? 'positive' : 'negative'}`}>
                    {isPos ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
