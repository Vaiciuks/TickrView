import { useState, useRef, useEffect, useCallback } from 'react';
import { formatPrice } from '../utils/formatters.js';
import StockLogo from './StockLogo.jsx';

const ALLOCATION_COLORS = [
  '#00c853', '#00bcd4', '#7c4dff', '#ff9100', '#ff1744',
  '#448aff', '#ffd600', '#00e676', '#d500f9', '#ff6d00',
  '#18ffff', '#76ff03', '#f50057', '#40c4ff', '#ffab40',
];

export default function Portfolio({
  holdings, addPosition, removePosition, editPosition,
  totalValue, totalCost, totalPL, totalPLPercent,
  dayChange, dayChangePercent, onSelectStock,
}) {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [editingSymbol, setEditingSymbol] = useState(null);
  const [editShares, setEditShares] = useState('');
  const [editCost, setEditCost] = useState('');
  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handle = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Fetch search suggestions — skip when a symbol was already picked
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selectedSymbol || search.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.results || []);
        setShowSuggestions((data.results || []).length > 0);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search, selectedSymbol]);

  const handleSelectSuggestion = (item) => {
    setSelectedSymbol(item);
    setSearch(item.symbol);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleAddPosition = (e) => {
    e.preventDefault();
    const sym = selectedSymbol?.symbol || search.trim().toUpperCase();
    const s = parseFloat(shares);
    const c = parseFloat(avgCost);
    if (!sym || isNaN(s) || s <= 0 || isNaN(c) || c <= 0) return;
    addPosition(sym, s, c, selectedSymbol?.name || sym);
    setSearch('');
    setShares('');
    setAvgCost('');
    setSelectedSymbol(null);
  };

  const handleStartEdit = (h) => {
    setEditingSymbol(h.symbol);
    setEditShares(String(h.shares));
    setEditCost(String(h.avgCost));
  };

  const handleSaveEdit = () => {
    const s = parseFloat(editShares);
    const c = parseFloat(editCost);
    if (editingSymbol && !isNaN(s) && s > 0 && !isNaN(c) && c > 0) {
      editPosition(editingSymbol, s, c);
    }
    setEditingSymbol(null);
  };

  const handleCancelEdit = () => setEditingSymbol(null);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleRowClick = useCallback((h) => {
    if (editingSymbol) return;
    onSelectStock({ symbol: h.symbol, name: h.name, price: h.price, change: h.change, changePercent: h.changePercent });
  }, [editingSymbol, onSelectStock]);

  // Sort holdings
  const sortedHoldings = [...holdings].sort((a, b) => {
    let av, bv;
    switch (sortKey) {
      case 'symbol': av = a.symbol; bv = b.symbol; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      case 'shares': av = a.shares; bv = b.shares; break;
      case 'avgCost': av = a.avgCost; bv = b.avgCost; break;
      case 'price': av = a.price ?? 0; bv = b.price ?? 0; break;
      case 'dayChg': av = a.changePercent ?? 0; bv = b.changePercent ?? 0; break;
      case 'pl': av = a.pl ?? 0; bv = b.pl ?? 0; break;
      case 'plPct': av = a.plPercent ?? 0; bv = b.plPercent ?? 0; break;
      case 'value': default: av = a.marketValue ?? 0; bv = b.marketValue ?? 0; break;
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const sortIcon = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const fmtDollar = (v) => {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtPercent = (v) => {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  };

  return (
    <main className="portfolio-main">
      <div className="pf-header">
        <h2 className="pf-title">Portfolio</h2>
      </div>

      {/* Summary bar */}
      <div className="pf-summary-bar">
        <div className="pf-stat-card">
          <span className="pf-stat-label">Total Value</span>
          <span className="pf-stat-value">{totalValue != null ? `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
        </div>
        <div className="pf-stat-card">
          <span className="pf-stat-label">Cost Basis</span>
          <span className="pf-stat-value">{`$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
        </div>
        <div className="pf-stat-card">
          <span className="pf-stat-label">Total P&L</span>
          <span className={`pf-stat-value ${totalPL != null ? (totalPL >= 0 ? 'pf-up' : 'pf-down') : ''}`}>
            {fmtDollar(totalPL)} {totalPLPercent != null && <span className="pf-stat-pct">({fmtPercent(totalPLPercent)})</span>}
          </span>
        </div>
        <div className="pf-stat-card">
          <span className="pf-stat-label">Day Change</span>
          <span className={`pf-stat-value ${dayChange !== 0 ? (dayChange >= 0 ? 'pf-up' : 'pf-down') : ''}`}>
            {fmtDollar(dayChange)} {dayChangePercent != null && <span className="pf-stat-pct">({fmtPercent(dayChangePercent)})</span>}
          </span>
        </div>
      </div>

      {/* Add position form */}
      <form className="pf-add-form" onSubmit={handleAddPosition} autoComplete="off">
        <div className="pf-search-wrapper" ref={searchRef}>
          <input
            className="pf-input pf-search-input"
            type="text"
            placeholder="Search symbol..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedSymbol(null); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            spellCheck={false}
            autoComplete="off"
            name="pf-sym-nofill"
            data-lpignore="true"
            data-1p-ignore="true"
          />
          {showSuggestions && (
            <ul className="pf-suggestions">
              {suggestions.map(item => (
                <li key={item.symbol} className="pf-suggestion" onMouseDown={() => handleSelectSuggestion(item)}>
                  <span className="pf-suggestion-sym">{item.symbol}</span>
                  <span className="pf-suggestion-name">{item.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pf-num-wrapper pf-shares-wrapper">
          <input className="pf-input" type="number" placeholder="Shares" value={shares} onChange={(e) => setShares(e.target.value)} min="0" step="any" autoComplete="off" name="pf-qty-nofill" data-lpignore="true" data-1p-ignore="true" />
          <div className="pf-num-arrows">
            <button type="button" className="pf-num-arrow" onClick={() => setShares(v => String(Math.max(0, (parseFloat(v) || 0) + 1)))} tabIndex={-1}>&#9650;</button>
            <button type="button" className="pf-num-arrow" onClick={() => setShares(v => String(Math.max(0, (parseFloat(v) || 0) - 1)))} tabIndex={-1}>&#9660;</button>
          </div>
        </div>
        <div className="pf-num-wrapper pf-cost-wrapper">
          <input className="pf-input" type="number" placeholder="Avg Cost" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} min="0" step="any" autoComplete="off" name="pf-cost-nofill" data-lpignore="true" data-1p-ignore="true" />
          <div className="pf-num-arrows">
            <button type="button" className="pf-num-arrow" onClick={() => setAvgCost(v => String(Math.max(0, (parseFloat(v) || 0) + 0.5).toFixed(2)))} tabIndex={-1}>&#9650;</button>
            <button type="button" className="pf-num-arrow" onClick={() => setAvgCost(v => String(Math.max(0, (parseFloat(v) || 0) - 0.5).toFixed(2)))} tabIndex={-1}>&#9660;</button>
          </div>
        </div>
        <button className="pf-add-btn" type="submit">Add</button>
      </form>

      {/* Allocation bar */}
      {holdings.length > 0 && totalValue > 0 && (
        <div className="pf-allocation-section">
          <div className="pf-allocation-bar">
            {sortedHoldings.map((h, i) => {
              const weight = h.marketValue != null && totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
              if (weight < 0.5) return null;
              return (
                <div
                  key={h.symbol}
                  className="pf-allocation-seg"
                  style={{ width: `${weight}%`, backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                  title={`${h.symbol}: ${weight.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div className="pf-allocation-legend">
            {sortedHoldings.map((h, i) => {
              const weight = h.marketValue != null && totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
              if (weight < 0.5) return null;
              return (
                <span key={h.symbol} className="pf-legend-item">
                  <span className="pf-legend-dot" style={{ backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
                  {h.symbol} {weight.toFixed(1)}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Holdings table */}
      {holdings.length > 0 ? (
        <div className="pf-table-wrapper">
          <table className="pf-holdings-table">
            <thead>
              <tr>
                <th className="pf-th pf-th-symbol" onClick={() => handleSort('symbol')}>Symbol{sortIcon('symbol')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('shares')}>Shares{sortIcon('shares')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('avgCost')}>Avg Cost{sortIcon('avgCost')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('price')}>Price{sortIcon('price')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('value')}>Value{sortIcon('value')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('dayChg')}>Day %{sortIcon('dayChg')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('pl')}>P&L{sortIcon('pl')}</th>
                <th className="pf-th pf-th-num" onClick={() => handleSort('plPct')}>P&L %{sortIcon('plPct')}</th>
                <th className="pf-th pf-th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map(h => (
                <tr key={h.symbol} className="pf-row" onClick={() => handleRowClick(h)}>
                  <td className="pf-td pf-td-symbol">
                    <StockLogo symbol={h.symbol} size={24} />
                    <div className="pf-symbol-info">
                      <span className="pf-symbol-name">{h.symbol}</span>
                      <span className="pf-symbol-full">{h.name}</span>
                    </div>
                  </td>
                  {editingSymbol === h.symbol ? (
                    <>
                      <td className="pf-td pf-td-num">
                        <input className="pf-edit-input" type="number" value={editShares} onChange={(e) => setEditShares(e.target.value)} min="0" step="any" onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td className="pf-td pf-td-num">
                        <input className="pf-edit-input" type="number" value={editCost} onChange={(e) => setEditCost(e.target.value)} min="0" step="any" onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td className="pf-td pf-td-num">{h.price != null ? formatPrice(h.price) : '—'}</td>
                      <td className="pf-td pf-td-num">{h.marketValue != null ? `$${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                      <td className="pf-td pf-td-num"><span className={h.changePercent >= 0 ? 'pf-up' : 'pf-down'}>{fmtPercent(h.changePercent)}</span></td>
                      <td className="pf-td pf-td-num"><span className={h.pl != null ? (h.pl >= 0 ? 'pf-up' : 'pf-down') : ''}>{fmtDollar(h.pl)}</span></td>
                      <td className="pf-td pf-td-num"><span className={h.plPercent != null ? (h.plPercent >= 0 ? 'pf-up' : 'pf-down') : ''}>{fmtPercent(h.plPercent)}</span></td>
                      <td className="pf-td pf-td-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="pf-action-btn pf-save-btn" onClick={handleSaveEdit} title="Save">&#10003;</button>
                        <button className="pf-action-btn pf-cancel-btn" onClick={handleCancelEdit} title="Cancel">&#10005;</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="pf-td pf-td-num">{h.shares}</td>
                      <td className="pf-td pf-td-num">{formatPrice(h.avgCost)}</td>
                      <td className="pf-td pf-td-num">{h.price != null ? formatPrice(h.price) : '—'}</td>
                      <td className="pf-td pf-td-num">{h.marketValue != null ? `$${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                      <td className="pf-td pf-td-num"><span className={h.changePercent >= 0 ? 'pf-up' : 'pf-down'}>{fmtPercent(h.changePercent)}</span></td>
                      <td className="pf-td pf-td-num"><span className={h.pl != null ? (h.pl >= 0 ? 'pf-up' : 'pf-down') : ''}>{fmtDollar(h.pl)}</span></td>
                      <td className="pf-td pf-td-num"><span className={h.plPercent != null ? (h.plPercent >= 0 ? 'pf-up' : 'pf-down') : ''}>{fmtPercent(h.plPercent)}</span></td>
                      <td className="pf-td pf-td-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="pf-action-btn pf-edit-btn" onClick={() => handleStartEdit(h)} title="Edit">&#9998;</button>
                        <button className="pf-action-btn pf-delete-btn" onClick={() => removePosition(h.symbol)} title="Delete">&#128465;</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pf-empty">
          <div className="pf-empty-icon">&#128188;</div>
          <h3>No Holdings Yet</h3>
          <p>Search for a symbol above and add your first position to start tracking your portfolio.</p>
        </div>
      )}

      {/* Mobile card layout */}
      {holdings.length > 0 && (
        <div className="pf-cards-mobile">
          {sortedHoldings.map(h => (
            <div key={h.symbol} className="pf-card" onClick={() => handleRowClick(h)}>
              <div className="pf-card-top">
                <div className="pf-card-symbol-row">
                  <StockLogo symbol={h.symbol} size={28} />
                  <div>
                    <div className="pf-card-sym">{h.symbol}</div>
                    <div className="pf-card-name">{h.name}</div>
                  </div>
                </div>
                <div className="pf-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="pf-action-btn pf-edit-btn" onClick={() => handleStartEdit(h)} title="Edit">&#9998;</button>
                  <button className="pf-action-btn pf-delete-btn" onClick={() => removePosition(h.symbol)} title="Delete">&#128465;</button>
                </div>
              </div>
              <div className="pf-card-grid">
                <div className="pf-card-cell"><span className="pf-card-label">Shares</span><span>{h.shares}</span></div>
                <div className="pf-card-cell"><span className="pf-card-label">Avg Cost</span><span>{formatPrice(h.avgCost)}</span></div>
                <div className="pf-card-cell"><span className="pf-card-label">Price</span><span>{h.price != null ? formatPrice(h.price) : '—'}</span></div>
                <div className="pf-card-cell"><span className="pf-card-label">Value</span><span>{h.marketValue != null ? `$${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span></div>
                <div className="pf-card-cell"><span className="pf-card-label">Day</span><span className={h.changePercent >= 0 ? 'pf-up' : 'pf-down'}>{fmtPercent(h.changePercent)}</span></div>
                <div className="pf-card-cell"><span className="pf-card-label">P&L</span><span className={h.pl != null ? (h.pl >= 0 ? 'pf-up' : 'pf-down') : ''}>{fmtDollar(h.pl)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
