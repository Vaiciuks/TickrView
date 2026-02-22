import { useState, useMemo } from 'react';
import { useEarningsCalendar } from '../hooks/useEarningsCalendar.js';
import StockLogo from './StockLogo.jsx';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getSunday(weekOffset = 0) {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day + weekOffset * 7);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function getWeekDays(weekOffset) {
  const sunday = getSunday(weekOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function formatPrice(price) {
  if (!price) return '--';
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCap(mc) {
  if (!mc) return '';
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(0)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return '';
}

function formatEps(val) {
  if (val == null) return null;
  return val >= 0 ? `$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
}

function buildHighlight(stock) {
  const parts = [];
  const epsEst = formatEps(stock.epsEstimate);
  const epsTTM = formatEps(stock.epsTTM);

  if (epsEst) {
    parts.push(`Expected EPS: ${epsEst}`);
  }
  if (epsTTM) {
    parts.push(`Trailing EPS: ${epsTTM}`);
  }
  if (stock.sector && stock.sector !== 'Other') {
    parts.push(stock.sector);
  }
  const mcap = formatMarketCap(stock.marketCap);
  if (mcap) {
    parts.push(`${mcap} market cap`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function EarningsCard({ stock, onClick }) {
  const highlight = buildHighlight(stock);

  return (
    <button className="ecal-card" onClick={() => onClick(stock)}>
      <div className="ecal-card-left">
        <StockLogo symbol={stock.symbol} size={36} />
        <div className="ecal-card-info">
          <div className="ecal-card-top-row">
            <span className="ecal-card-symbol">{stock.symbol}</span>
            <span className="ecal-card-name">{stock.name}</span>
          </div>
          {highlight && (
            <p className="ecal-card-highlight">{highlight}</p>
          )}
        </div>
      </div>
      <div className="ecal-card-right">
        <span className="ecal-card-price">${formatPrice(stock.price)}</span>
        <span className={`ecal-card-change ${stock.changePercent >= 0 ? 'positive' : 'negative'}`}>
          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

export default function EarningsCalendar({ active, onSelectStock }) {
  const { earnings, loading } = useEarningsCalendar(active);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState(null);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  // Auto-select: prefer today if it has earnings, otherwise first day with earnings, fallback to today
  const activeIdx = useMemo(() => {
    if (selectedDayIdx !== null) return selectedDayIdx;
    const todayIdx = weekDays.findIndex(d => isToday(d));
    // If today is in this week and has earnings, pick it
    if (todayIdx >= 0 && (earnings[formatDateKey(weekDays[todayIdx])]?.length || 0) > 0) {
      return todayIdx;
    }
    // Otherwise pick first day with earnings
    const firstWithEarnings = weekDays.findIndex(d => (earnings[formatDateKey(d)]?.length || 0) > 0);
    if (firstWithEarnings >= 0) return firstWithEarnings;
    // Fallback to today or first day
    return todayIdx >= 0 ? todayIdx : 0;
  }, [weekDays, earnings, selectedDayIdx]);

  const selectedDate = weekDays[activeIdx];
  const selectedKey = formatDateKey(selectedDate);
  const selectedStocks = earnings[selectedKey] || [];

  const handleStockClick = (stock) => {
    if (onSelectStock) {
      onSelectStock({ symbol: stock.symbol, name: stock.name });
    }
  };

  const goToToday = () => {
    setWeekOffset(0);
    setSelectedDayIdx(null);
  };

  const prevWeek = () => {
    setWeekOffset(o => o - 1);
    setSelectedDayIdx(null);
  };

  const nextWeek = () => {
    setWeekOffset(o => o + 1);
    setSelectedDayIdx(null);
  };

  return (
    <div className="ecal">
      {/* Header with title and navigation */}
      <div className="ecal-header">
        <h3 className="ecal-title">Earnings Calendar</h3>
        <div className="ecal-nav">
          <button className="ecal-nav-btn" onClick={prevWeek} aria-label="Previous week">&#8249;</button>
          {weekOffset !== 0 && (
            <button className="ecal-today-btn" onClick={goToToday}>Today</button>
          )}
          <button className="ecal-nav-btn" onClick={nextWeek} aria-label="Next week">&#8250;</button>
        </div>
      </div>

      {/* Date strip */}
      <div className="ecal-strip">
        {weekDays.map((day, i) => {
          const key = formatDateKey(day);
          const count = earnings[key]?.length || 0;
          const today = isToday(day);
          const selected = i === activeIdx;

          return (
            <button
              key={key}
              className={`ecal-day${selected ? ' ecal-day--selected' : ''}${today ? ' ecal-day--today' : ''}`}
              onClick={() => setSelectedDayIdx(i)}
            >
              <span className="ecal-day-name">{DAY_NAMES[i]}</span>
              <span className="ecal-day-date">{MONTH_NAMES[day.getMonth()]} {day.getDate()}</span>
              <span className={`ecal-day-count${count === 0 ? ' ecal-day-count--empty' : ''}`}>
                {count > 0 ? `${count} Calls` : 'No Calls'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day label */}
      {selectedStocks.length > 0 && (
        <div className="ecal-day-label">
          {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()} — {selectedStocks.length} Earnings Call{selectedStocks.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Selected day stocks list */}
      <div className="ecal-list">
        {loading ? (
          <div className="smartmoney-loading">
            <div className="smartmoney-loading-pulse" />
            <span>Loading earnings data...</span>
          </div>
        ) : selectedStocks.length > 0 ? (
          selectedStocks.map((stock) => (
            <EarningsCard
              key={stock.symbol}
              stock={stock}
              onClick={handleStockClick}
            />
          ))
        ) : (
          <div className="ecal-empty">
            No earnings scheduled for {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()}
          </div>
        )}
      </div>
    </div>
  );
}
