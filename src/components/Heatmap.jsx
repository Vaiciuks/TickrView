import { useState, useEffect, useRef, useCallback } from 'react';

// Squarified treemap layout algorithm
function squarify(items, rect) {
  if (!items.length || rect.w <= 0 || rect.h <= 0) return [];

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];

  const results = [];
  let remaining = items.map(i => ({ ...i, area: (i.value / total) * rect.w * rect.h }));
  let currentRect = { ...rect };

  while (remaining.length > 0) {
    const row = layoutRow(remaining, currentRect);
    results.push(...row.placed);
    remaining = row.remaining;
    currentRect = row.nextRect;
  }

  return results;
}

function layoutRow(items, rect) {
  const isWide = rect.w >= rect.h;
  const side = isWide ? rect.h : rect.w;

  let row = [items[0]];
  let rowArea = items[0].area;

  for (let i = 1; i < items.length; i++) {
    const testRow = [...row, items[i]];
    const testArea = rowArea + items[i].area;
    if (worstRatio(testRow, testArea, side) <= worstRatio(row, rowArea, side)) {
      row = testRow;
      rowArea = testArea;
    } else {
      break;
    }
  }

  const rowSpan = rowArea / side;
  let offset = 0;
  const placed = row.map(item => {
    const itemSpan = item.area / rowSpan;
    const r = isWide
      ? { x: rect.x, y: rect.y + offset, w: rowSpan, h: itemSpan, ...item }
      : { x: rect.x + offset, y: rect.y, w: itemSpan, h: rowSpan, ...item };
    offset += itemSpan;
    return r;
  });

  const nextRect = isWide
    ? { x: rect.x + rowSpan, y: rect.y, w: rect.w - rowSpan, h: rect.h }
    : { x: rect.x, y: rect.y + rowSpan, w: rect.w, h: rect.h - rowSpan };

  return { placed, remaining: items.slice(row.length), nextRect };
}

function worstRatio(row, rowArea, side) {
  const s2 = side * side;
  let worst = 0;
  for (const item of row) {
    const r = Math.max(
      (s2 * item.area) / (rowArea * rowArea),
      (rowArea * rowArea) / (s2 * item.area)
    );
    if (r > worst) worst = r;
  }
  return worst;
}

function getColor(changePercent) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const clamped = Math.max(-5, Math.min(5, changePercent));
  const t = Math.abs(clamped) / 5;
  const intensity = Math.pow(t, 0.6);

  const base = isDark ? [18, 18, 26] : [240, 240, 245];
  const target = clamped >= 0
    ? (isDark ? [0, 155, 52] : [80, 200, 100])
    : (isDark ? [196, 3, 39] : [220, 100, 100]);

  const r = Math.round(base[0] + (target[0] - base[0]) * intensity);
  const g = Math.round(base[1] + (target[1] - base[1]) * intensity);
  const b = Math.round(base[2] + (target[2] - base[2]) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

function getCellColor(changePercent) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  if (Math.abs(changePercent) < 0.05) return isDark ? '#12121a' : '#f0f0f5';
  return getColor(changePercent);
}

function formatPrice(price) {
  if (!price) return '--';
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const GAP = 2;

export default function Heatmap({ theme }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hoveredSector, setHoveredSector] = useState(null);
  const [hoveredStock, setHoveredStock] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const res = await fetch('/api/heatmap');
        if (!res.ok) return;
        const json = await res.json();
        if (mounted && json?.sectors) {
          setData(json.sectors);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    const id = setInterval(fetchData, 120_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isMobileView = dims.w > 0 && dims.w <= 480;

  const handleContainerLeave = useCallback(() => {
    setHoveredSector(null);
    setHoveredStock(null);
  }, []);

  const handleMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  if (loading || !data) {
    return (
      <div className="heatmap-container" ref={containerRef}>
        <div className="heatmap-skeleton">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className={`skeleton-line heatmap-skeleton-cell heatmap-skeleton-cell--${i}`} />
          ))}
        </div>
      </div>
    );
  }

  // Flatten all stocks in a sector for tooltip
  const getAllStocks = (sector) => {
    return sector.industries.flatMap(ind => ind.stocks);
  };

  // Calculate sector total market cap
  const sectorItems = data.map(s => ({
    ...s,
    value: getAllStocks(s).reduce((sum, st) => sum + (st.marketCap || 0), 0),
  })).filter(s => s.value > 0);

  const sectorRects = squarify(sectorItems, { x: GAP, y: GAP, w: dims.w - GAP * 2, h: dims.h - GAP * 2 });

  const activeSector = hoveredSector
    ? data.find(s => s.name === hoveredSector)
    : null;

  const activeSectorStocks = activeSector ? getAllStocks(activeSector) : [];

  // Find the hovered stock data
  const activeStock = activeSector && hoveredStock
    ? activeSectorStocks.find(st => st.symbol === hoveredStock)
    : null;

  // Tooltip sizing
  const rowCount = activeSectorStocks.length;
  const industryCount = activeSector ? activeSector.industries.length : 0;
  const featuredH = activeStock ? 58 : 0;
  const tipH = featuredH + 28 + industryCount * 18 + rowCount * 20 + 12;
  const tipW = 250;

  let tipX = mousePos.x + 16;
  let tipY = mousePos.y + 16;
  if (tipX + tipW > dims.w) tipX = mousePos.x - tipW - 12;
  if (tipY + tipH > dims.h) tipY = Math.max(4, dims.h - tipH - 4);

  return (
    <div
      className="heatmap-container"
      ref={containerRef}
      onMouseLeave={handleContainerLeave}
      onMouseMove={handleMouseMove}
    >
      {dims.w > 0 && sectorRects.map((sector) => {
        const sectorHeaderH = dims.w <= 480 ? 14 : 18;
        const sectorInnerW = sector.w - GAP * 2;
        const sectorInnerH = sector.h - sectorHeaderH - GAP;
        const isDimmed = hoveredSector && hoveredSector !== sector.name;

        // Layout industries within sector
        const industryItems = sector.industries.map(ind => ({
          ...ind,
          value: ind.stocks.reduce((sum, st) => sum + (st.marketCap || 0), 0),
        })).filter(ind => ind.value > 0);

        const industryRects = squarify(industryItems, {
          x: 0, y: sectorHeaderH,
          w: sectorInnerW > 0 ? sectorInnerW : 0,
          h: sectorInnerH > 0 ? sectorInnerH : 0,
        });

        return (
          <div
            key={sector.name}
            className={`heatmap-sector${isDimmed ? ' heatmap-sector--dimmed' : ''}${hoveredSector === sector.name ? ' heatmap-sector--active' : ''}`}
            style={{
              left: sector.x + GAP / 2,
              top: sector.y + GAP / 2,
              width: sector.w - GAP,
              height: sector.h - GAP,
            }}
            onMouseEnter={() => !isMobileView && setHoveredSector(sector.name)}
            onClick={() => isMobileView && setHoveredSector(sector.name)}
          >
            <div className="heatmap-sector-label">{sector.name}</div>

            {industryRects.map((ind) => {
              const indW = ind.w - GAP;
              const indH = ind.h - GAP;
              if (indW <= 0 || indH <= 0) return null;

              // Show industry header only if there's enough room
              const showIndHeader = indW > 40 && indH > 24;
              const indHeaderH = showIndHeader ? 13 : 0;
              const stockAreaW = indW - GAP;
              const stockAreaH = indH - indHeaderH - GAP / 2;

              const visibleStocks = isMobileView ? ind.stocks.slice(0, 6) : ind.stocks;
              const stockItems = visibleStocks.map(st => ({
                ...st,
                value: st.marketCap || 1,
              }));

              const stockRects = squarify(stockItems, {
                x: 0, y: indHeaderH,
                w: stockAreaW > 0 ? stockAreaW : 0,
                h: stockAreaH > 0 ? stockAreaH : 0,
              });

              return (
                <div
                  key={ind.name}
                  className="heatmap-industry"
                  style={{
                    left: ind.x + GAP,
                    top: ind.y + GAP / 2,
                    width: indW,
                    height: indH,
                  }}
                >
                  {showIndHeader && (
                    <div className="heatmap-industry-label">{ind.name}</div>
                  )}
                  {stockRects.map(st => {
                    const cellW = st.w - GAP;
                    const cellH = st.h - GAP;
                    if (cellW <= 0 || cellH <= 0) return null;

                    const showTicker = cellW > 16 && cellH > 10;
                    const showPercent = cellW > 28 && cellH > 20;
                    const showName = cellW > 50 && cellH > 38;
                    const fontSize = Math.max(6, Math.min(14, Math.min(cellW / 4.5, cellH / 3.5)));
                    const isHovered = hoveredStock === st.symbol;

                    return (
                      <div
                        key={st.symbol}
                        className={`heatmap-cell${isHovered ? ' heatmap-cell--hovered' : ''}`}
                        style={{
                          left: st.x + GAP / 2,
                          top: st.y + GAP / 2,
                          width: cellW,
                          height: cellH,
                          backgroundColor: getCellColor(st.changePercent),
                        }}
                        onMouseEnter={() => setHoveredStock(st.symbol)}
                        onMouseLeave={() => setHoveredStock(null)}
                        onClick={isMobileView ? (e) => {
                          e.stopPropagation();
                          setHoveredSector(sector.name);
                          setHoveredStock(st.symbol);
                        } : undefined}
                      >
                        {showTicker && (
                          <span className="heatmap-cell-symbol" style={{ fontSize: Math.max(6, fontSize + 1) }}>
                            {st.symbol}
                          </span>
                        )}
                        {showPercent && (
                          <span className="heatmap-cell-change" style={{ fontSize: Math.max(5, fontSize - 1) }}>
                            {st.changePercent >= 0 ? '+' : ''}{st.changePercent.toFixed(2)}%
                          </span>
                        )}
                        {showName && (
                          <span className="heatmap-cell-name" style={{ fontSize: Math.max(5, fontSize - 3) }}>
                            {st.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Cursor-following tooltip (desktop) / bottom panel (mobile) */}
      {activeSector && (
        <div
          className="heatmap-tooltip"
          style={isMobileView ? {} : { left: tipX, top: tipY }}
        >
          {isMobileView && (
            <button
              className="heatmap-tooltip-close"
              onClick={() => { setHoveredSector(null); setHoveredStock(null); }}
            >&times;</button>
          )}
          {/* Featured stock — big display at top */}
          {activeStock && (
            <div className="heatmap-tooltip-featured">
              <div className="heatmap-tooltip-featured-top">
                <span className="heatmap-tooltip-featured-symbol">{activeStock.symbol}</span>
                <span className="heatmap-tooltip-featured-price">{formatPrice(activeStock.price)}</span>
                <span className={`heatmap-tooltip-featured-change ${activeStock.changePercent >= 0 ? 'positive' : 'negative'}`}>
                  {activeStock.changePercent >= 0 ? '+' : ''}{activeStock.changePercent.toFixed(2)}%
                </span>
              </div>
              <div className="heatmap-tooltip-featured-name">{activeStock.name}</div>
            </div>
          )}
          <div className="heatmap-tooltip-header">{activeSector.name}</div>
          {activeSector.industries.map(ind => (
            <div key={ind.name}>
              <div className="heatmap-tooltip-industry">{ind.name}</div>
              {ind.stocks.map(st => (
                <div
                  key={st.symbol}
                  className={`heatmap-tooltip-row${hoveredStock === st.symbol ? ' heatmap-tooltip-row--active' : ''}`}
                >
                  <span className="heatmap-tooltip-symbol">{st.symbol}</span>
                  <span className="heatmap-tooltip-price">{formatPrice(st.price)}</span>
                  <span className={`heatmap-tooltip-change ${st.changePercent >= 0 ? 'positive' : 'negative'}`}>
                    {st.changePercent >= 0 ? '+' : ''}{st.changePercent.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
