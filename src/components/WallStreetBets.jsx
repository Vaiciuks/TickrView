import { useState, useMemo } from 'react';
import { useWsb } from '../hooks/useWsb.js';

const FILTERS = [
  { key: 'all-stocks', label: 'All' },
  { key: 'wallstreetbets', label: 'WSB' },
  { key: 'stocks', label: 'r/stocks' },
  { key: 'investing', label: 'r/investing' },
];

function formatMentions(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function rankChangeLabel(change) {
  if (change > 0) return `+${change}`;
  if (change < 0) return String(change);
  return '---';
}

function sentimentLabel(s) {
  if (s === 'bullish') return 'Bullish';
  if (s === 'bearish') return 'Bearish';
  return 'Neutral';
}

export default function WallStreetBets({ active, onSelectStock }) {
  const [filter, setFilter] = useState('all-stocks');
  const { data, loading } = useWsb(active, filter);
  const [sortCol, setSortCol] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');

  const tickers = useMemo(() => {
    const list = data?.tickers || [];
    return [...list].sort((a, b) => {
      let aVal, bVal;
      switch (sortCol) {
        case 'rank': aVal = a.rank; bVal = b.rank; break;
        case 'ticker': aVal = a.ticker; bVal = b.ticker; break;
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'mentions': aVal = a.mentions; bVal = b.mentions; break;
        case 'mentionChange': aVal = a.mentionChange; bVal = b.mentionChange; break;
        case 'upvotes': aVal = a.upvotes; bVal = b.upvotes; break;
        case 'rankChange': aVal = a.rankChange; bVal = b.rankChange; break;
        case 'sentiment': aVal = a.sentimentScore; bVal = b.sentimentScore; break;
        default: aVal = a.rank; bVal = b.rank; break;
      }
      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'rank' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (col) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const handleRowClick = (item) => {
    if (item.ticker && onSelectStock) {
      onSelectStock({ symbol: item.ticker, name: item.name || item.ticker });
    }
  };

  if (loading && !data) {
    return (
      <div className="smartmoney-loading">
        <div className="smartmoney-loading-pulse" />
        <span>Loading Reddit sentiment data...</span>
      </div>
    );
  }

  if (!tickers.length) {
    return (
      <div className="smartmoney-empty">
        <span>No trending tickers found</span>
      </div>
    );
  }

  const topMovers = data?.topMovers || [];

  return (
    <div>
      {/* Subreddit Filter Toggle */}
      <div className="wsb-filter-bar">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`wsb-filter-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Top Movers Summary Cards */}
      {topMovers.length > 0 && (
        <div className="congress-summary-grid">
          {topMovers.map(t => (
            <div
              key={t.ticker}
              className="congress-summary-card wsb-summary-card"
              onClick={() => handleRowClick(t)}
            >
              <div className="congress-card-top">
                <span className="congress-card-name" title={t.name}>{t.ticker}</span>
                <span className="wsb-rank-badge wsb-rank-up" title="Rank change in last 24h">Rank +{t.rankChange}</span>
              </div>
              <div className="congress-card-row">
                <span className="congress-card-label">Mentions</span>
                <span className="congress-card-value">{formatMentions(t.mentions)}</span>
              </div>
              <div className="congress-card-row">
                <span className="congress-card-label">Sentiment</span>
                <span className={`sentiment-badge ${t.sentiment}`}>
                  {sentimentLabel(t.sentiment)}
                </span>
              </div>
              <div className="congress-card-row">
                <span className="congress-card-label">Upvotes</span>
                <span className="congress-card-value">{formatMentions(t.upvotes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tickers Table */}
      <div className="smartmoney-table-wrap">
        <table className="smartmoney-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('rank')} className={sortCol === 'rank' ? 'sorted' : ''}>
                #{sortIcon('rank')}
              </th>
              <th onClick={() => handleSort('ticker')} className={sortCol === 'ticker' ? 'sorted' : ''}>
                Ticker{sortIcon('ticker')}
              </th>
              <th onClick={() => handleSort('name')} className={`${sortCol === 'name' ? 'sorted' : ''} sm-hide-mobile`}>
                Name{sortIcon('name')}
              </th>
              <th onClick={() => handleSort('mentions')} className={sortCol === 'mentions' ? 'sorted' : ''}>
                Mentions{sortIcon('mentions')}
              </th>
              <th onClick={() => handleSort('sentiment')} className={sortCol === 'sentiment' ? 'sorted' : ''}>
                Sentiment{sortIcon('sentiment')}
              </th>
              <th onClick={() => handleSort('mentionChange')} className={`${sortCol === 'mentionChange' ? 'sorted' : ''} sm-hide-mobile`}>
                24h Chg{sortIcon('mentionChange')}
              </th>
              <th onClick={() => handleSort('rankChange')} className={sortCol === 'rankChange' ? 'sorted' : ''}>
                Rank Chg{sortIcon('rankChange')}
              </th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((item) => (
              <tr
                key={item.ticker}
                onClick={() => handleRowClick(item)}
              >
                <td className="wsb-rank">{item.rank}</td>
                <td className="sm-symbol">{item.ticker}</td>
                <td className="sm-name sm-hide-mobile">{item.name}</td>
                <td>{formatMentions(item.mentions)}</td>
                <td>
                  <span className={`sentiment-badge ${item.sentiment}`}>
                    {sentimentLabel(item.sentiment)}
                  </span>
                </td>
                <td className="sm-hide-mobile">
                  <span className={`wsb-mention-change ${item.mentionChange > 0 ? 'positive' : item.mentionChange < 0 ? 'negative' : ''}`}>
                    {item.mentionChange > 0 ? '+' : ''}{formatMentions(item.mentionChange)}
                    {item.mentionChangePct !== 0 && (
                      <span className="wsb-mention-pct"> ({item.mentionChangePct > 0 ? '+' : ''}{item.mentionChangePct}%)</span>
                    )}
                  </span>
                </td>
                <td>
                  <span className={`wsb-rank-badge ${item.rankChange > 0 ? 'wsb-rank-up' : item.rankChange < 0 ? 'wsb-rank-down' : 'wsb-rank-flat'}`}>
                    {rankChangeLabel(item.rankChange)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
