import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useStocks } from "./hooks/useStocks.js";
import { useBatchChartData } from "./hooks/useBatchChartData.js";
import { useNewsData } from "./hooks/useNewsData.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { useFavorites } from "./hooks/useFavorites.js";
import { useAlerts } from "./hooks/useAlerts.js";
import { useStockNotes } from "./hooks/useStockNotes.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAuth } from "./contexts/AuthContext.jsx";
import { formatRelativeTime } from "./utils/formatters.js";
import Header from "./components/Header.jsx";
import GridDropdown from "./components/GridDropdown.jsx";
import StockCard from "./components/StockCard.jsx";
import TickerSidebar from "./components/TickerSidebar.jsx";
import LoadingState from "./components/LoadingState.jsx";
import EmptyState from "./components/EmptyState.jsx";
import Home from "./components/Home.jsx";
import Footer from "./components/Footer.jsx";
import ParticleBackground from "./components/ParticleBackground.jsx";
import TabErrorBoundary from "./components/TabErrorBoundary.jsx";
import { usePortfolio } from "./hooks/usePortfolio.js";

// Lazy-loaded tab components — each gets its own chunk
const ExpandedChart = lazy(() => import("./components/ExpandedChart.jsx"));
const Heatmap = lazy(() => import("./components/Heatmap.jsx"));
const NewsFeed = lazy(() => import("./components/NewsFeed.jsx"));
const Earnings = lazy(() => import("./components/Earnings.jsx"));
const EconomicCalendar = lazy(() => import("./components/EconomicCalendar.jsx"));
const ExtendedHoursMovers = lazy(() => import("./components/ExtendedHoursMovers.jsx"));
const Screener = lazy(() => import("./components/Screener.jsx"));
const FuturesIndices = lazy(() => import("./components/FuturesIndices.jsx"));
const FavoritesGrid = lazy(() => import("./components/FavoritesGrid.jsx"));
const SmartMoney = lazy(() => import("./components/SmartMoney.jsx"));
const Portfolio = lazy(() => import("./components/Portfolio.jsx"));

const TABS = [
  { key: "home", label: "Home" },
  { key: "gainers", label: "Top Runners", endpoint: "/api/gainers" },
  { key: "losers", label: "Top Losers", endpoint: "/api/losers" },
  { key: "movers", label: "Pre/After" },
  { key: "trending", label: "Trending", endpoint: "/api/trending" },
  { key: "favorites", label: "Favorites" },
  { key: "futures", label: "Futures" },
  { key: "crypto", label: "Crypto", endpoint: "/api/crypto" },
  { key: "screener", label: "Screener" },
  { key: "heatmap", label: "Heatmap" },
  { key: "news", label: "News" },
  { key: "earnings", label: "Earnings" },
  { key: "economy", label: "Economy" },
  { key: "smartmoney", label: "Smart Money" },
];

const VALID_TABS = new Set([...TABS.map((t) => t.key), "portfolio"]);

export default function App() {
  const { session } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("home");
  const [expandedStock, setExpandedStock] = useState(null);
  const [gridStocks, setGridStocks] = useState([]);
  const [gridMinimized, setGridMinimized] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const skipPushRef = useRef(false);
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("stock-scanner-sidebar");
    return saved !== null ? saved === "true" : false;
  });
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("stock-scanner-sidebar", String(next));
      return next;
    });
  }, []);

  const [recentStocks, setRecentStocks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("stock-scanner-recent") || "[]");
    } catch {
      return [];
    }
  });

  const addRecent = useCallback((stock) => {
    if (!stock?.symbol) return;
    setRecentStocks((prev) => {
      const filtered = prev.filter((s) => s.symbol !== stock.symbol);
      const next = [stock, ...filtered].slice(0, 15);
      localStorage.setItem("stock-scanner-recent", JSON.stringify(next));
      return next;
    });
  }, []);

  // All hooks load initial data; only the active tab polls individual quotes
  const gainersData = useStocks(
    "/api/gainers",
    activeTab === "gainers" || activeTab === "home",
  );
  const losersData = useStocks(
    "/api/losers",
    activeTab === "losers" || activeTab === "home",
  );
  const trendingData = useStocks(
    "/api/trending",
    activeTab === "trending" || activeTab === "home",
  );
  const futuresData = useStocks("/api/futures", activeTab === "home");
  const cryptoData = useStocks(
    "/api/crypto",
    activeTab === "crypto" || activeTab === "home",
  );
  const tabData = {
    gainers: gainersData,
    losers: losersData,
    trending: trendingData,
    crypto: cryptoData,
  };
  const isHome = activeTab === "home";
  const isHeatmap = activeTab === "heatmap";
  const isNews = activeTab === "news";
  const isEarnings = activeTab === "earnings";
  const isEconomy = activeTab === "economy";
  const isMovers = activeTab === "movers";
  const isScreener = activeTab === "screener";
  const isFutures = activeTab === "futures";
  const isFavorites = activeTab === "favorites";
  const isSmartMoney = activeTab === "smartmoney";
  const isPortfolio = activeTab === "portfolio";
  const isSpecialTab =
    isHome ||
    isHeatmap ||
    isNews ||
    isEarnings ||
    isEconomy ||
    isMovers ||
    isScreener ||
    isFutures ||
    isFavorites ||
    isSmartMoney ||
    isPortfolio;
  const { stocks, loading, error, lastUpdated } = isSpecialTab
    ? {
        stocks: [],
        loading: false,
        error: null,
        lastUpdated: gainersData.lastUpdated,
      }
    : tabData[activeTab];

  const { favorites, toggleFavorite, isFavorite, reorderFavorites } =
    useFavorites(
      gainersData.stocks,
      losersData.stocks,
      trendingData.stocks,
      futuresData.stocks,
      cryptoData.stocks,
      session,
    );

  // Price alerts
  const {
    alerts,
    addAlert,
    removeAlert,
    toggleAlert,
    getAlerts,
    checkAlerts,
    alertCount,
  } = useAlerts(session);

  // Stock notes
  const {
    notes: stockNotes,
    setNote: setStockNote,
    getNote: getStockNote,
    hasNote: hasStockNote,
  } = useStockNotes();

  // Portfolio
  const {
    holdings: portfolioHoldings,
    positions: portfolioPositions,
    addPosition,
    removePosition,
    editPosition,
    totalValue: pfTotalValue,
    totalCost: pfTotalCost,
    totalPL: pfTotalPL,
    totalPLPercent: pfTotalPLPercent,
    dayChange: pfDayChange,
    dayChangePercent: pfDayChangePercent,
  } = usePortfolio();

  // Check alerts across ALL data sources (not just active tab)
  useEffect(() => {
    const allStocks = [
      ...gainersData.stocks,
      ...losersData.stocks,
      ...trendingData.stocks,
      ...futuresData.stocks,
      ...cryptoData.stocks,
    ];
    const seen = new Set();
    for (const s of allStocks) {
      if (s.price && !seen.has(s.symbol)) {
        seen.add(s.symbol);
        checkAlerts(s.symbol, s.price);
      }
    }
  }, [
    gainersData.stocks,
    losersData.stocks,
    trendingData.stocks,
    futuresData.stocks,
    cryptoData.stocks,
    checkAlerts,
  ]);

  // Batch-fetch all mini chart data in one request instead of per-card
  const allSymbols = useMemo(() => {
    const g = gainersData.stocks.map((s) => s.symbol);
    const l = losersData.stocks.map((s) => s.symbol);
    const t = trendingData.stocks.map((s) => s.symbol);
    const f = futuresData.stocks.map((s) => s.symbol);
    const c = cryptoData.stocks.map((s) => s.symbol);
    const fav = favorites.map((s) => s.symbol);
    return [...new Set([...g, ...l, ...t, ...f, ...c, ...fav])];
  }, [
    gainersData.stocks,
    losersData.stocks,
    trendingData.stocks,
    futuresData.stocks,
    cryptoData.stocks,
    favorites,
  ]);
  const { chartMap } = useBatchChartData(allSymbols);
  const { hasNews, getNews } = useNewsData(allSymbols);

  // Minimize grid (keep selections) so user can Ctrl+click more cards
  const minimizeGrid = useCallback(() => setGridMinimized(true), []);

  // Clear everything
  const clearAll = useCallback(() => {
    setGridStocks([]);
    setGridMinimized(false);
    setExpandedStock(null);
    setFocusedIdx(-1);
  }, []);

  const removeFromGrid = useCallback((symbol) => {
    setGridStocks((prev) => {
      const next = prev.filter((s) => s.symbol !== symbol);
      if (next.length === 1) {
        // Last remaining chart → show as single expanded view
        setExpandedStock(next[0]);
        return [];
      }
      return next;
    });
  }, []);

  const handleStockClick = useCallback(
    (stock, event) => {
      if (event && (event.ctrlKey || event.metaKey)) {
        // Ctrl+click: toggle in grid selection
        setExpandedStock(null);
        setGridMinimized(false); // Re-open grid when adding/removing
        setGridStocks((prev) => {
          const exists = prev.find((s) => s.symbol === stock.symbol);
          return exists
            ? prev.filter((s) => s.symbol !== stock.symbol)
            : [...prev, stock];
        });
      } else {
        // Normal click: single chart, clear grid
        setGridStocks([]);
        setGridMinimized(false);
        setExpandedStock(stock);
        addRecent(stock);
      }
    },
    [addRecent],
  );

  const isInGrid = useCallback(
    (symbol) => {
      return gridStocks.some((s) => s.symbol === symbol);
    },
    [gridStocks],
  );

  const handleSearch = async (symbol) => {
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`);
      if (!res.ok) return;
      const stock = await res.json();
      setGridStocks([]);
      setGridMinimized(false);
      setExpandedStock(stock);
      addRecent(stock);
    } catch {
      // silently ignore
    }
  };

  const handleEarningsClick = useCallback(async (stock) => {
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(stock.symbol)}`);
      if (!res.ok) return;
      const fullStock = await res.json();
      setGridStocks([]);
      setGridMinimized(false);
      setExpandedStock(fullStock);
      addRecent(fullStock);
    } catch {
      // silently ignore
    }
  }, []);

  // Persist tab selection + push to browser history
  const changeTab = useCallback((tab) => {
    setActiveTab(tab);
    if (session) localStorage.setItem("stock-scanner-tab", tab);
    // Close any open chart when switching tabs
    setExpandedStock(null);
    setGridStocks([]);
    setGridMinimized(false);
    if (!skipPushRef.current) {
      window.history.pushState({ tab, stock: null }, "", `#${tab}`);
    }
    skipPushRef.current = false;
    window.scrollTo(0, 0);
  }, []);

  // Push expanded stock to history so back closes it
  const expandedStockRef = useRef(expandedStock);
  useEffect(() => {
    const prev = expandedStockRef.current;
    expandedStockRef.current = expandedStock;
    // Only push when opening a stock (not when closing)
    if (expandedStock && !prev) {
      window.history.pushState(
        { tab: activeTab, stock: expandedStock.symbol },
        "",
        `#${activeTab}/${expandedStock.symbol}`,
      );
    }
  }, [expandedStock, activeTab]);

  // Set initial history state on mount + detect /stock/:symbol path
  useEffect(() => {
    const pathMatch = window.location.pathname.match(/^\/stock\/([A-Za-z0-9.\-^=]+)$/);
    if (pathMatch) {
      const symbol = pathMatch[1].toUpperCase();
      fetch(`/api/quote/${encodeURIComponent(symbol)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((stock) => {
          if (stock) {
            setExpandedStock(stock);
            addRecent(stock);
            window.history.replaceState(
              { tab: activeTab, stock: symbol },
              "",
              `/stock/${symbol}`,
            );
          }
        })
        .catch(() => {});
    } else {
      window.history.replaceState(
        { tab: activeTab, stock: null },
        "",
        `#${activeTab}`,
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle browser back/forward
  useEffect(() => {
    const handlePop = (e) => {
      const state = e.state;
      if (!state) return;
      if (state.stock) {
        // We were on a stock view, but user hit back — close it
        // The previous state should be the tab without stock
        setExpandedStock(null);
        setGridStocks([]);
        setGridMinimized(false);
      } else if (state.tab && VALID_TABS.has(state.tab)) {
        skipPushRef.current = true;
        changeTab(state.tab);
        setExpandedStock(null);
        setGridStocks([]);
        setGridMinimized(false);
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [changeTab]);

  // Reset focus when tab changes
  useEffect(() => {
    setFocusedIdx(-1);
  }, [activeTab]);

  // Keyboard shortcuts: J/K/Enter/F/Esc/?
  useEffect(() => {
    const handleKey = (e) => {
      // Don't intercept when typing in inputs
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "SELECT"
      )
        return;
      // Don't handle J/K/F/Enter when a chart is expanded (ExpandedChart handles its own keys)
      const chartOpen = expandedStock || gridStocks.length >= 2;

      if (e.key === "Escape") {
        if (focusedIdx >= 0 && !chartOpen) {
          setFocusedIdx(-1);
        } else {
          clearAll();
        }
        return;
      }

      // Only handle navigation keys when no chart is expanded and not on heatmap
      if (chartOpen || isSpecialTab) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIdx((prev) => {
          if (stocks.length === 0) return -1;
          return prev < stocks.length - 1 ? prev + 1 : 0;
        });
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIdx((prev) => {
          if (stocks.length === 0) return -1;
          return prev > 0 ? prev - 1 : stocks.length - 1;
        });
      } else if (
        e.key === "Enter" &&
        focusedIdx >= 0 &&
        focusedIdx < stocks.length
      ) {
        e.preventDefault();
        setExpandedStock(stocks[focusedIdx]);
      } else if (
        (e.key === "f" || e.key === "F") &&
        focusedIdx >= 0 &&
        focusedIdx < stocks.length
      ) {
        e.preventDefault();
        toggleFavorite(stocks[focusedIdx].symbol);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    clearAll,
    expandedStock,
    gridStocks.length,
    stocks,
    focusedIdx,
    isSpecialTab,
    toggleFavorite,
  ]);

  return (
    <div className="app">
      <ParticleBackground />
      <Header
        lastUpdated={lastUpdated}
        count={stocks.length}
        error={error}
        onSearch={handleSearch}
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={changeTab}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        onToggleSidebar={toggleSidebar}
        alerts={alerts}
        alertCount={alertCount}
        onToggleAlert={toggleAlert}
        onRemoveAlert={removeAlert}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className={`app-body${isHome ? "" : " app-body--opaque"}`}>
        <TickerSidebar
          favorites={favorites}
          recentStocks={recentStocks}
          onToggleFavorite={toggleFavorite}
          isFavorite={isFavorite}
          onReorderFavorites={reorderFavorites}
          onSelectStock={handleStockClick}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          hasNews={hasNews}
          getNews={getNews}
          onSearch={handleSearch}
          portfolio={portfolioHoldings}
          onOpenPortfolio={() => changeTab("portfolio")}
        />
        <div className="app-content">
          <TabErrorBoundary key={activeTab} tabName={TABS.find((t) => t.key === activeTab)?.label || activeTab}>
          <Suspense fallback={<LoadingState />}>
          {isHome ? (
            <Home
              active={isHome}
              gainers={gainersData.stocks}
              losers={losersData.stocks}
              trending={trendingData.stocks}
              futures={futuresData.stocks}
              crypto={cryptoData.stocks}
              favorites={favorites}
              onTabChange={changeTab}
              theme={theme}
            />
          ) : isHeatmap ? (
            <main className="heatmap-main">
              <Heatmap theme={theme} />
            </main>
          ) : isEarnings ? (
            <Earnings active={isEarnings} onSelectStock={handleEarningsClick} />
          ) : isEconomy ? (
            <EconomicCalendar active={isEconomy} />
          ) : isMovers ? (
            <ExtendedHoursMovers
              active={isMovers}
              onSelectStock={handleEarningsClick}
            />
          ) : isScreener ? (
            <Screener
              active={isScreener}
              onSelectStock={handleEarningsClick}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          ) : isFavorites ? (
            <FavoritesGrid
              favorites={favorites}
              chartMap={chartMap}
              onSelectStock={handleStockClick}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
              hasNews={hasNews}
              getNews={getNews}
              hasStockNote={hasStockNote}
              getStockNote={getStockNote}
              setStockNote={setStockNote}
              onReorderFavorites={reorderFavorites}
              isInGrid={isInGrid}
            />
          ) : isFutures ? (
            <FuturesIndices
              active={isFutures}
              onSelectStock={handleEarningsClick}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          ) : isPortfolio ? (
            <Portfolio
              holdings={portfolioHoldings}
              addPosition={addPosition}
              removePosition={removePosition}
              editPosition={editPosition}
              totalValue={pfTotalValue}
              totalCost={pfTotalCost}
              totalPL={pfTotalPL}
              totalPLPercent={pfTotalPLPercent}
              dayChange={pfDayChange}
              dayChangePercent={pfDayChangePercent}
              onSelectStock={handleEarningsClick}
            />
          ) : isSmartMoney ? (
            <SmartMoney
              active={isSmartMoney}
              onSelectStock={handleEarningsClick}
            />
          ) : isNews ? (
            <NewsFeed active={isNews} />
          ) : (
            <main className="stock-grid">
              <div className="grid-status-bar">
                <GridDropdown
                  label={
                    TABS.find((t) => t.key === activeTab)?.label || activeTab
                  }
                  stocks={stocks}
                  onSelect={handleStockClick}
                />
                <span className="grid-status-meta">
                  <span
                    className={`status-dot ${error ? "status-error" : "status-live"}`}
                  />
                  <span>
                    {lastUpdated
                      ? formatRelativeTime(lastUpdated)
                      : "Loading..."}
                  </span>
                </span>
              </div>
              {loading && stocks.length === 0 && <LoadingState />}
              {!loading && stocks.length === 0 && <EmptyState error={error} />}
              {stocks.map((stock, idx) => (
                <StockCard
                  key={stock.symbol}
                  stock={stock}
                  chartData={chartMap[stock.symbol] || null}
                  isSelected={isInGrid(stock.symbol)}
                  isFocused={focusedIdx === idx}
                  onClick={(e) => handleStockClick(stock, e)}
                  hasNews={hasNews(stock.symbol)}
                  newsArticles={getNews(stock.symbol)}
                  isFavorite={isFavorite(stock.symbol)}
                  onToggleFavorite={() => toggleFavorite(stock.symbol)}
                  hasNote={hasStockNote(stock.symbol)}
                  note={getStockNote(stock.symbol)}
                  onSetNote={(text) => setStockNote(stock.symbol, text)}
                />
              ))}
            </main>
          )}
          </Suspense>
          </TabErrorBoundary>
        </div>
      </div>
      <Footer onSelectStock={handleEarningsClick} />
      {expandedStock && gridStocks.length === 0 && (
        <Suspense fallback={<LoadingState />}>
          <ExpandedChart
            stock={expandedStock}
            onClose={() => {
              setExpandedStock(null);
              window.history.replaceState({ tab: activeTab, stock: null }, '', `#${activeTab}`);
            }}
            isFavorite={isFavorite(expandedStock.symbol)}
            onToggleFavorite={() => toggleFavorite(expandedStock.symbol)}
            newsArticles={getNews(expandedStock.symbol)}
            alerts={getAlerts(expandedStock.symbol)}
            onAddAlert={addAlert}
            onRemoveAlert={removeAlert}
            theme={theme}
            note={getStockNote(expandedStock.symbol)}
            onSetNote={(text) => setStockNote(expandedStock.symbol, text)}
          />
        </Suspense>
      )}
      {gridStocks.length >= 2 && !gridMinimized && (
        <Suspense fallback={<LoadingState />}>
          <div className="expanded-overlay" onClick={minimizeGrid}>
            <div className="expanded-grid" onClick={(e) => e.stopPropagation()}>
              {gridStocks.map((stock) => (
                <ExpandedChart
                  key={stock.symbol}
                  stock={stock}
                  compact
                  onClose={() => removeFromGrid(stock.symbol)}
                  isFavorite={isFavorite(stock.symbol)}
                  onToggleFavorite={() => toggleFavorite(stock.symbol)}
                  newsArticles={getNews(stock.symbol)}
                />
              ))}
            </div>
          </div>
        </Suspense>
      )}
      {gridStocks.length >= 2 && gridMinimized && (
        <button className="grid-badge" onClick={() => setGridMinimized(false)}>
          {gridStocks.length} charts selected
        </button>
      )}
    </div>
  );
}
