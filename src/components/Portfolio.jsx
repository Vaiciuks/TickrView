import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import { formatPrice } from "../utils/formatters.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useScrollLock } from "../hooks/useScrollLock.js";
import { usePortfolioChart } from "../hooks/usePortfolioChart.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import StockLogo from "./StockLogo.jsx";

const ALLOCATION_COLORS = [
  "#00c853",
  "#00bcd4",
  "#7c4dff",
  "#ff9100",
  "#ff1744",
  "#448aff",
  "#ffd600",
  "#00e676",
  "#d500f9",
  "#ff6d00",
  "#18ffff",
  "#76ff03",
  "#f50057",
  "#40c4ff",
  "#ffab40",
];

function hideWatermark(container) {
  requestAnimationFrame(() => {
    const el = container.querySelector('a[href*="tradingview"]');
    if (el)
      el.style.cssText =
        "position:absolute !important; left:8px !important; right:auto !important; bottom:4px !important; top:auto !important; opacity:0.08 !important; font-size:9px !important; z-index:1 !important;";
  });
}

function MobileEditModal({
  holding,
  editShares,
  editCost,
  onSharesChange,
  onCostChange,
  onSave,
  onCancel,
}) {
  const overlayRef = useRef(null);

  // Track visualViewport so modal stays above the soft keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !overlayRef.current) return;

    const update = () => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      className="pf-edit-overlay"
      ref={overlayRef}
      onClick={onCancel}
    >
      <div
        className="pf-edit-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-edit-sheet-header">
          <div className="pf-edit-sheet-symbol">
            <StockLogo symbol={holding.symbol} size={28} />
            <div>
              <div className="pf-edit-sheet-sym">{holding.symbol}</div>
              <div className="pf-edit-sheet-name">{holding.name}</div>
            </div>
          </div>
          <button className="pf-edit-sheet-close" onClick={onCancel}>
            &#10005;
          </button>
        </div>
        <div className="pf-edit-sheet-fields">
          <label className="pf-edit-sheet-label">
            Shares
            <input
              className="pf-edit-sheet-input"
              type="number"
              value={editShares}
              onChange={(e) => onSharesChange(e.target.value)}
              min="0"
              step="any"
              inputMode="decimal"
              autoFocus
            />
          </label>
          <label className="pf-edit-sheet-label">
            Avg Cost
            <input
              className="pf-edit-sheet-input"
              type="number"
              value={editCost}
              onChange={(e) => onCostChange(e.target.value)}
              min="0"
              step="any"
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="pf-edit-sheet-actions">
          <button
            className="pf-edit-sheet-btn pf-edit-sheet-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="pf-edit-sheet-btn pf-edit-sheet-save"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Portfolio({
  holdings,
  addPosition,
  removePosition,
  editPosition,
  totalValue,
  totalCost,
  totalPL,
  totalPLPercent,
  dayChange,
  dayChangePercent,
  onSelectStock,
}) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [editingSymbol, setEditingSymbol] = useState(null);
  const [editShares, setEditShares] = useState("");
  const [editCost, setEditCost] = useState("");
  const [sortKey, setSortKey] = useState("value");
  const [sortDir, setSortDir] = useState("desc");
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  useScrollLock(isMobile && editingSymbol !== null);

  // Portfolio chart
  const [chartTimeframe, setChartTimeframe] = useState("1D");
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [hoverValue, setHoverValue] = useState(null);

  // Price flash animation (matches StockCard pattern)
  const prevValueRef = useRef(totalValue);
  const [flash, setFlash] = useState(null);
  const { data: chartData, loading: chartLoading } = usePortfolioChart(
    holdings,
    chartTimeframe,
  );

  // Extended hours totals for chart display
  const extInfo = useMemo(() => {
    const first = holdings.find((h) => h.extMarketState != null);
    if (!first) return null;
    const state = first.extMarketState; // "pre" or "post"
    let extTotalValue = 0;
    let regTotalValue = 0;
    let hasExt = false;
    for (const h of holdings) {
      if (h.price != null) extTotalValue += h.price * h.shares;
      if (h.regPrice != null) regTotalValue += h.regPrice * h.shares;
      if (h.extChangePercent != null) hasExt = true;
    }
    if (!hasExt) return null;
    const extDollarChange = extTotalValue - regTotalValue;
    const extPctChange =
      regTotalValue > 0 ? (extDollarChange / regTotalValue) * 100 : 0;
    return { state, extDollarChange, extPctChange };
  }, [holdings]);

  // Animated summary values
  const animTotalValue = useAnimatedNumber(totalValue ?? 0);
  const animTotalCost = useAnimatedNumber(totalCost ?? 0);
  const animTotalPL = useAnimatedNumber(totalPL ?? 0);
  const animTotalPLPercent = useAnimatedNumber(totalPLPercent ?? 0);
  const animDayChange = useAnimatedNumber(dayChange ?? 0);
  const animDayChangePercent = useAnimatedNumber(dayChangePercent ?? 0);
  const animExtDollar = useAnimatedNumber(extInfo?.extDollarChange ?? 0);
  const animExtPct = useAnimatedNumber(extInfo?.extPctChange ?? 0);

  // Flash on total value change
  useEffect(() => {
    const prev = prevValueRef.current;
    if (prev != null && totalValue != null && totalValue !== prev) {
      setFlash(totalValue > prev ? "pf-flash-up" : "pf-flash-down");
      const timer = setTimeout(() => setFlash(null), 700);
      prevValueRef.current = totalValue;
      return () => clearTimeout(timer);
    }
    prevValueRef.current = totalValue;
  }, [totalValue]);

  // Close suggestions on outside click
  useEffect(() => {
    const handle = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
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
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(search.trim())}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.results || []);
        setShowSuggestions((data.results || []).length > 0);
      } catch {
        /* ignore */
      }
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
    setSearch("");
    setShares("");
    setAvgCost("");
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
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleRowClick = useCallback(
    (h) => {
      if (editingSymbol) return;
      onSelectStock({
        symbol: h.symbol,
        name: h.name,
        price: h.price,
        change: h.change,
        changePercent: h.changePercent,
      });
    },
    [editingSymbol, onSelectStock],
  );

  // Sort holdings
  const sortedHoldings = [...holdings].sort((a, b) => {
    let av, bv;
    switch (sortKey) {
      case "symbol":
        av = a.symbol;
        bv = b.symbol;
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      case "shares":
        av = a.shares;
        bv = b.shares;
        break;
      case "avgCost":
        av = a.avgCost;
        bv = b.avgCost;
        break;
      case "price":
        av = a.price ?? 0;
        bv = b.price ?? 0;
        break;
      case "dayChg":
        av = a.changePercent ?? 0;
        bv = b.changePercent ?? 0;
        break;
      case "pl":
        av = a.pl ?? 0;
        bv = b.pl ?? 0;
        break;
      case "plPct":
        av = a.plPercent ?? 0;
        bv = b.plPercent ?? 0;
        break;
      case "value":
      default:
        av = a.marketValue ?? 0;
        bv = b.marketValue ?? 0;
        break;
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const sortIcon = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const fmtDollar = (v) => {
    if (v == null) return "—";
    const sign = v >= 0 ? "+" : "";
    return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtPercent = (v) => {
    if (v == null) return "—";
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  };

  const editingHolding = editingSymbol
    ? holdings.find((h) => h.symbol === editingSymbol)
    : null;

  // ── Portfolio performance chart ──
  const getChartColors = useCallback(() => {
    const isDark =
      document.documentElement.getAttribute("data-theme") !== "light";
    return {
      bg: "transparent",
      grid: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.03)",
      text: isDark ? "#555" : "#aaa",
      crosshair: isDark ? "rgba(0, 229, 255, 0.25)" : "rgba(0, 0, 0, 0.15)",
      crosshairLabel: isDark ? "#1a1a28" : "#e0e0e8",
    };
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
      return;
    }

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const colors = getChartColors();
    const container = chartContainerRef.current;
    const chartHeight = isMobile ? 200 : 260;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: colors.bg },
        textColor: colors.text,
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: colors.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: colors.crosshairLabel,
        },
        horzLine: {
          color: colors.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: colors.crosshairLabel,
        },
      },
      timeScale: {
        borderColor: "transparent",
        timeVisible: chartTimeframe === "1D" || chartTimeframe === "1W",
        secondsVisible: false,
        barSpacing: 6,
        minBarSpacing: 1,
      },
      rightPriceScale: {
        visible: false,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: false },
    });

    const firstVal = chartData[0].value;
    const lastVal = chartData[chartData.length - 1].value;
    const isGain = lastVal >= firstVal;
    const lineColor = isGain ? "#00d66b" : "#ff2952";
    const topColor = isGain
      ? "rgba(0, 214, 107, 0.18)"
      : "rgba(255, 41, 82, 0.18)";
    const bottomColor = isGain
      ? "rgba(0, 214, 107, 0.01)"
      : "rgba(255, 41, 82, 0.01)";

    const series = chart.addAreaSeries({
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: "#fff",
    });

    series.setData(chartData);
    chart.timeScale().fitContent();
    hideWatermark(container);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.has(series)) {
        setHoverValue(null);
        return;
      }
      const point = param.seriesData.get(series);
      if (point) setHoverValue(point.value);
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartData, chartTimeframe, getChartColors, isMobile]);

  return (
    <main className="portfolio-main">
      <div className="pf-header">
        <h2 className="pf-title">Portfolio</h2>
      </div>

      {/* Summary bar */}
      <div className="pf-summary-bar">
        <div className={`pf-stat-card ${flash || ""}`}>
          <span className="pf-stat-label">Total Value</span>
          <span className={`pf-stat-value ${flash || ""}`}>
            {totalValue != null
              ? `$${animTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
        <div className="pf-stat-card">
          <span className="pf-stat-label">Cost Basis</span>
          <span className="pf-stat-value">{`$${animTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
        </div>
        <div className="pf-stat-card">
          <span className="pf-stat-label">Total P&L</span>
          <span
            className={`pf-stat-value ${totalPL != null ? (totalPL >= 0 ? "pf-up" : "pf-down") : ""}`}
          >
            {fmtDollar(animTotalPL)}{" "}
            {totalPLPercent != null && (
              <span className="pf-stat-pct">
                ({fmtPercent(animTotalPLPercent)})
              </span>
            )}
          </span>
        </div>
        <div className="pf-stat-card">
          <span className="pf-stat-label">
            {extInfo
              ? extInfo.state === "pre" ? "Pre-Market" : "After Hours"
              : "Day Change"}
          </span>
          <span
            className={`pf-stat-value ${
              extInfo
                ? (extInfo.extDollarChange >= 0 ? "pf-up" : "pf-down")
                : dayChange !== 0 ? (dayChange >= 0 ? "pf-up" : "pf-down") : ""
            }`}
          >
            {extInfo
              ? fmtDollar(animExtDollar)
              : fmtDollar(animDayChange)}{" "}
            <span className="pf-stat-pct">
              ({extInfo
                ? fmtPercent(animExtPct)
                : fmtPercent(animDayChangePercent)})
            </span>
          </span>
        </div>
      </div>

      {/* Portfolio performance chart */}
      {holdings.length > 0 && (
        <div className="pf-chart-section">
          <div className="pf-chart-header">
            <div className={`pf-chart-value ${hoverValue == null && flash ? flash : ""}`}>
              {(hoverValue != null ? hoverValue : totalValue) != null
                ? `$${(hoverValue != null ? hoverValue : animTotalValue).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}`
                : "—"}
            </div>
            {extInfo && (
              <div
                className="pf-chart-changes"
                style={{ visibility: hoverValue != null ? "hidden" : "visible" }}
              >
                <span
                  className={`pf-chart-ext-change ${extInfo.extDollarChange >= 0 ? "pf-up" : "pf-down"}`}
                >
                  {extInfo.state === "pre" ? "Pre-Market" : "After Hours"}{" "}
                  {fmtDollar(animExtDollar)} ({fmtPercent(animExtPct)})
                </span>
              </div>
            )}
          </div>
          <div className="pf-chart-container" ref={chartContainerRef}>
            {chartLoading && chartData.length === 0 && (
              <div className="pf-chart-loading">Loading chart...</div>
            )}
          </div>
          <div className="pf-chart-timeframes">
            {["1D", "1W", "1M", "YTD", "All"].map((tf) => (
              <button
                key={tf}
                className={`pf-tf-btn ${chartTimeframe === tf ? "pf-tf-active" : ""}`}
                onClick={() => setChartTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add position form */}
      <form
        className="pf-add-form"
        onSubmit={handleAddPosition}
        autoComplete="off"
      >
        <div className="pf-search-wrapper" ref={searchRef}>
          <input
            className="pf-input pf-search-input"
            type="text"
            placeholder="Search symbol..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedSymbol(null);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            spellCheck={false}
            autoComplete="off"
            name="pf-sym-nofill"
            data-lpignore="true"
            data-1p-ignore="true"
          />
          {showSuggestions && (
            <ul className="pf-suggestions">
              {suggestions.map((item) => (
                <li
                  key={item.symbol}
                  className="pf-suggestion"
                  onMouseDown={() => handleSelectSuggestion(item)}
                >
                  <span className="pf-suggestion-sym">{item.symbol}</span>
                  <span className="pf-suggestion-name">{item.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pf-num-wrapper pf-shares-wrapper">
          <input
            className="pf-input"
            type="number"
            placeholder="Shares"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            min="0"
            step="any"
            autoComplete="off"
            name="pf-qty-nofill"
            data-lpignore="true"
            data-1p-ignore="true"
          />
          <div className="pf-num-arrows">
            <button
              type="button"
              className="pf-num-arrow"
              onClick={() =>
                setShares((v) => String(Math.max(0, (parseFloat(v) || 0) + 1)))
              }
              tabIndex={-1}
            >
              &#9650;
            </button>
            <button
              type="button"
              className="pf-num-arrow"
              onClick={() =>
                setShares((v) => String(Math.max(0, (parseFloat(v) || 0) - 1)))
              }
              tabIndex={-1}
            >
              &#9660;
            </button>
          </div>
        </div>
        <div className="pf-num-wrapper pf-cost-wrapper">
          <input
            className="pf-input"
            type="number"
            placeholder="Avg Cost"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            min="0"
            step="any"
            autoComplete="off"
            name="pf-cost-nofill"
            data-lpignore="true"
            data-1p-ignore="true"
          />
          <div className="pf-num-arrows">
            <button
              type="button"
              className="pf-num-arrow"
              onClick={() =>
                setAvgCost((v) =>
                  String(Math.max(0, (parseFloat(v) || 0) + 0.5).toFixed(2)),
                )
              }
              tabIndex={-1}
            >
              &#9650;
            </button>
            <button
              type="button"
              className="pf-num-arrow"
              onClick={() =>
                setAvgCost((v) =>
                  String(Math.max(0, (parseFloat(v) || 0) - 0.5).toFixed(2)),
                )
              }
              tabIndex={-1}
            >
              &#9660;
            </button>
          </div>
        </div>
        <button className="pf-add-btn" type="submit">
          Add
        </button>
      </form>

      {/* Allocation bar */}
      {holdings.length > 0 && totalValue > 0 && (
        <div className="pf-allocation-section">
          <div className="pf-allocation-bar">
            {sortedHoldings.map((h, i) => {
              const weight =
                h.marketValue != null && totalValue > 0
                  ? (h.marketValue / totalValue) * 100
                  : 0;
              if (weight < 0.5) return null;
              return (
                <div
                  key={h.symbol}
                  className="pf-allocation-seg"
                  style={{
                    width: `${weight}%`,
                    backgroundColor:
                      ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                  }}
                  title={`${h.symbol}: ${weight.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div className="pf-allocation-legend">
            {sortedHoldings.map((h, i) => {
              const weight =
                h.marketValue != null && totalValue > 0
                  ? (h.marketValue / totalValue) * 100
                  : 0;
              if (weight < 0.5) return null;
              return (
                <span key={h.symbol} className="pf-legend-item">
                  <span
                    className="pf-legend-dot"
                    style={{
                      backgroundColor:
                        ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                    }}
                  />
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
                <th
                  className="pf-th pf-th-symbol"
                  onClick={() => handleSort("symbol")}
                >
                  Symbol{sortIcon("symbol")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("shares")}
                >
                  Shares{sortIcon("shares")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("avgCost")}
                >
                  Avg Cost{sortIcon("avgCost")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("price")}
                >
                  Price{sortIcon("price")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("value")}
                >
                  Value{sortIcon("value")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("dayChg")}
                >
                  Day %{sortIcon("dayChg")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("pl")}
                >
                  P&L{sortIcon("pl")}
                </th>
                <th
                  className="pf-th pf-th-num"
                  onClick={() => handleSort("plPct")}
                >
                  P&L %{sortIcon("plPct")}
                </th>
                <th className="pf-th pf-th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => (
                <tr
                  key={h.symbol}
                  className="pf-row"
                  onClick={() => handleRowClick(h)}
                >
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
                        <input
                          className="pf-edit-input"
                          type="number"
                          value={editShares}
                          onChange={(e) => setEditShares(e.target.value)}
                          min="0"
                          step="any"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="pf-td pf-td-num">
                        <input
                          className="pf-edit-input"
                          type="number"
                          value={editCost}
                          onChange={(e) => setEditCost(e.target.value)}
                          min="0"
                          step="any"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="pf-td pf-td-num">
                        {h.price != null ? formatPrice(h.price) : "—"}
                      </td>
                      <td className="pf-td pf-td-num">
                        {h.marketValue != null
                          ? `$${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="pf-td pf-td-num">
                        <span
                          className={h.changePercent >= 0 ? "pf-up" : "pf-down"}
                        >
                          {fmtPercent(h.changePercent)}
                        </span>
                        {h.extChangePercent != null && (
                          <div className="pf-ext-line">
                            <span className="pf-ext-label">
                              {h.extMarketState === "pre" ? "PM" : "AH"}
                            </span>
                            <span
                              className={
                                h.extChangePercent >= 0 ? "pf-up" : "pf-down"
                              }
                            >
                              {fmtPercent(h.extChangePercent)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="pf-td pf-td-num">
                        <span
                          className={
                            h.pl != null
                              ? h.pl >= 0
                                ? "pf-up"
                                : "pf-down"
                              : ""
                          }
                        >
                          {fmtDollar(h.pl)}
                        </span>
                      </td>
                      <td className="pf-td pf-td-num">
                        <span
                          className={
                            h.plPercent != null
                              ? h.plPercent >= 0
                                ? "pf-up"
                                : "pf-down"
                              : ""
                          }
                        >
                          {fmtPercent(h.plPercent)}
                        </span>
                      </td>
                      <td
                        className="pf-td pf-td-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="pf-action-btn pf-save-btn"
                          onClick={handleSaveEdit}
                          title="Save"
                        >
                          &#10003;
                        </button>
                        <button
                          className="pf-action-btn pf-cancel-btn"
                          onClick={handleCancelEdit}
                          title="Cancel"
                        >
                          &#10005;
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="pf-td pf-td-num">{h.shares}</td>
                      <td className="pf-td pf-td-num">
                        {formatPrice(h.avgCost)}
                      </td>
                      <td className="pf-td pf-td-num">
                        {h.price != null ? formatPrice(h.price) : "—"}
                      </td>
                      <td className="pf-td pf-td-num">
                        {h.marketValue != null
                          ? `$${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="pf-td pf-td-num">
                        <span
                          className={h.changePercent >= 0 ? "pf-up" : "pf-down"}
                        >
                          {fmtPercent(h.changePercent)}
                        </span>
                        {h.extChangePercent != null && (
                          <div className="pf-ext-line">
                            <span className="pf-ext-label">
                              {h.extMarketState === "pre" ? "PM" : "AH"}
                            </span>
                            <span
                              className={
                                h.extChangePercent >= 0 ? "pf-up" : "pf-down"
                              }
                            >
                              {fmtPercent(h.extChangePercent)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="pf-td pf-td-num">
                        <span
                          className={
                            h.pl != null
                              ? h.pl >= 0
                                ? "pf-up"
                                : "pf-down"
                              : ""
                          }
                        >
                          {fmtDollar(h.pl)}
                        </span>
                      </td>
                      <td className="pf-td pf-td-num">
                        <span
                          className={
                            h.plPercent != null
                              ? h.plPercent >= 0
                                ? "pf-up"
                                : "pf-down"
                              : ""
                          }
                        >
                          {fmtPercent(h.plPercent)}
                        </span>
                      </td>
                      <td
                        className="pf-td pf-td-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="pf-action-btn pf-edit-btn"
                          onClick={() => handleStartEdit(h)}
                          title="Edit"
                        >
                          &#9998;
                        </button>
                        <button
                          className="pf-action-btn pf-delete-btn"
                          onClick={() => removePosition(h.symbol)}
                          title="Delete"
                        >
                          &#128465;
                        </button>
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
          <p>
            Search for a symbol above and add your first position to start
            tracking your portfolio.
          </p>
        </div>
      )}

      {/* Mobile card layout */}
      {holdings.length > 0 && (
        <div className="pf-cards-mobile">
          {sortedHoldings.map((h) => (
            <div
              key={h.symbol}
              className="pf-card"
              onClick={() => handleRowClick(h)}
            >
              <div className="pf-card-top">
                <div className="pf-card-symbol-row">
                  <StockLogo symbol={h.symbol} size={28} />
                  <div>
                    <div className="pf-card-sym">{h.symbol}</div>
                    <div className="pf-card-name">{h.name}</div>
                  </div>
                </div>
                <div
                  className="pf-card-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="pf-action-btn pf-edit-btn"
                    onClick={() => handleStartEdit(h)}
                    title="Edit"
                  >
                    &#9998;
                  </button>
                  <button
                    className="pf-action-btn pf-delete-btn"
                    onClick={() => removePosition(h.symbol)}
                    title="Delete"
                  >
                    &#128465;
                  </button>
                </div>
              </div>
              <div className="pf-card-grid">
                <div className="pf-card-cell">
                  <span className="pf-card-label">Shares</span>
                  <span>{h.shares}</span>
                </div>
                <div className="pf-card-cell">
                  <span className="pf-card-label">Avg Cost</span>
                  <span>{formatPrice(h.avgCost)}</span>
                </div>
                <div className="pf-card-cell">
                  <span className="pf-card-label">Price</span>
                  <span>{h.price != null ? formatPrice(h.price) : "—"}</span>
                </div>
                <div className="pf-card-cell">
                  <span className="pf-card-label">Value</span>
                  <span>
                    {h.marketValue != null
                      ? `$${h.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </div>
                <div className="pf-card-cell">
                  <span className="pf-card-label">Day</span>
                  <span
                    className={
                      h.changePercent >= 0 ? "pf-up" : "pf-down"
                    }
                  >
                    {fmtPercent(h.changePercent)}
                  </span>
                </div>
                {h.extChangePercent != null && (
                  <div className="pf-card-cell">
                    <span className="pf-card-label">
                      {h.extMarketState === "pre" ? "PM" : "AH"}
                    </span>
                    <span
                      className={
                        h.extChangePercent >= 0 ? "pf-up" : "pf-down"
                      }
                    >
                      {fmtPercent(h.extChangePercent)}
                    </span>
                  </div>
                )}
                <div className="pf-card-cell">
                  <span className="pf-card-label">P&L</span>
                  <span
                    className={
                      h.pl != null ? (h.pl >= 0 ? "pf-up" : "pf-down") : ""
                    }
                  >
                    {fmtDollar(h.pl)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile edit modal */}
      {isMobile && editingSymbol && editingHolding && (
        <MobileEditModal
          holding={editingHolding}
          editShares={editShares}
          editCost={editCost}
          onSharesChange={setEditShares}
          onCostChange={setEditCost}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      )}
    </main>
  );
}
