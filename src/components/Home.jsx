import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNewsFeed } from "../hooks/useNewsFeed.js";
import { useEarningsCalendar } from "../hooks/useEarningsCalendar.js";
import { useEconomicCalendar } from "../hooks/useEconomicCalendar.js";
import { useMovers } from "../hooks/useMovers.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { useHomeLayout } from "../hooks/useHomeLayout.js";
import { lockScroll, unlockScroll } from "../hooks/useScrollLock.js";
import { formatPrice, formatRelativeTime } from "../utils/formatters.js";
import StockLogo from "./StockLogo.jsx";

const SECTIONS = [
  { key: "pulse", label: "Market Overview", span: 2 },
  { key: "runners", label: "Top Runners", span: 1 },
  { key: "news", label: "Latest News", span: "full" },
  { key: "breadth", label: "Market Breadth", span: "full" },
  { key: "heatmap", label: "Heatmap", span: "full" },
  { key: "feargreed", label: "Fear & Greed", span: 1 },
  { key: "losers", label: "Top Losers", span: 1 },
  { key: "movers", label: "Pre/After", span: 1 },
  { key: "trending", label: "Trending", span: 1 },
  { key: "futures", label: "Futures", span: 1 },
  { key: "crypto", label: "Crypto", span: 1 },
  { key: "earnings", label: "Earnings", span: 1 },
  { key: "economy", label: "Economy", span: 1 },
  { key: "favorites", label: "Favorites", span: 1 },
];
const SECTION_MAP = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

function usePriceFlash(price) {
  const prevRef = useRef(price);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev != null && price !== prev) {
      setFlash(price > prev ? "flash-up" : "flash-down");
      const timer = setTimeout(() => setFlash(null), 700);
      prevRef.current = price;
      return () => clearTimeout(timer);
    }
    prevRef.current = price;
  }, [price]);

  return flash;
}

function detectSession() {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return "pre"; // 4:00 AM – 9:30 AM ET
  if (mins >= 570 && mins < 960) return "market"; // 9:30 AM – 4:00 PM ET
  if (mins >= 960 && mins < 1200) return "post"; // 4:00 PM – 8:00 PM ET
  return "closed"; // 8:00 PM – 4:00 AM ET
}

// US stock market holidays (NYSE/NASDAQ)
function getMarketHolidays(year) {
  const holidays = [];

  // New Year's Day — Jan 1 (observed Fri if Sat, Mon if Sun)
  holidays.push(observedDate(year, 0, 1, "New Year's Day"));

  // MLK Day — 3rd Monday in January
  holidays.push({ date: nthWeekday(year, 0, 1, 3), name: "MLK Jr. Day" });

  // Presidents' Day — 3rd Monday in February
  holidays.push({ date: nthWeekday(year, 1, 1, 3), name: "Presidents' Day" });

  // Good Friday — Friday before Easter
  const easter = computeEaster(year);
  const gf = new Date(easter);
  gf.setDate(gf.getDate() - 2);
  holidays.push({ date: fmt(gf), name: "Good Friday" });

  // Memorial Day — last Monday in May
  holidays.push({ date: lastWeekday(year, 4, 1), name: "Memorial Day" });

  // Juneteenth — Jun 19
  holidays.push(observedDate(year, 5, 19, "Juneteenth"));

  // Independence Day — Jul 4
  holidays.push(observedDate(year, 6, 4, "Independence Day"));

  // Labor Day — 1st Monday in September
  holidays.push({ date: nthWeekday(year, 8, 1, 1), name: "Labor Day" });

  // Thanksgiving — 4th Thursday in November
  holidays.push({ date: nthWeekday(year, 10, 4, 4), name: "Thanksgiving" });

  // Christmas — Dec 25
  holidays.push(observedDate(year, 11, 25, "Christmas"));

  return holidays;
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nthWeekday(year, month, dow, n) {
  const d = new Date(year, month, 1);
  let count = 0;
  while (count < n) {
    if (d.getDay() === dow) count++;
    if (count < n) d.setDate(d.getDate() + 1);
  }
  return fmt(d);
}

function lastWeekday(year, month, dow) {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
  return fmt(d);
}

function observedDate(year, month, day, name) {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() - 1); // Sat → Fri
  if (dow === 0) d.setDate(d.getDate() + 1); // Sun → Mon
  return { date: fmt(d), name };
}

function computeEaster(year) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const dayOfMonth = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, dayOfMonth);
}

function getMarketStatus() {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  const isWeekend = day === 0 || day === 6;

  // Check holidays
  const todayStr = fmt(et);
  const holidays = getMarketHolidays(et.getFullYear());
  const holiday = holidays.find((h) => h.date === todayStr);

  if (holiday)
    return { status: "closed", label: "Markets Closed", sub: holiday.name };
  if (isWeekend)
    return { status: "closed", label: "Markets Closed", sub: "Weekend" };
  if (mins >= 570 && mins < 960)
    return { status: "open", label: "Markets Open", sub: "Regular Session" };
  if (mins >= 240 && mins < 570)
    return { status: "pre", label: "Pre-Market", sub: "Opens at 9:30 AM ET" };
  if (mins >= 960 && mins < 1200)
    return {
      status: "after",
      label: "After-Hours",
      sub: "Regular session ended",
    };
  return { status: "closed", label: "Markets Closed", sub: "Opens 4:00 AM ET" };
}

function timeAgo(unixTimestamp) {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Loading skeletons ──
function SkeletonStockList({ rows = 4 }) {
  return (
    <div className="skeleton-stock-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-circle" style={{ width: 18, height: 18 }} />
          <div className="skeleton-line" style={{ width: 42, height: 12 }} />
          <div className="skeleton-line" style={{ flex: 1, height: 10 }} />
          <div className="skeleton-line" style={{ width: 52, height: 12 }} />
          <div
            className="skeleton-line"
            style={{ width: 44, height: 18, borderRadius: 9 }}
          />
        </div>
      ))}
    </div>
  );
}

function SkeletonFuturesList() {
  return (
    <div className="skeleton-futures-list">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-line" style={{ width: 70, height: 12 }} />
          <div className="skeleton-line" style={{ flex: 1, height: 0 }} />
          <div className="skeleton-line" style={{ width: 60, height: 12 }} />
          <div
            className="skeleton-line"
            style={{ width: 44, height: 18, borderRadius: 9 }}
          />
        </div>
      ))}
    </div>
  );
}

function SkeletonMoversSplit() {
  return (
    <div className="skeleton-movers-split">
      {[0, 1].map((col) => (
        <div key={col} className="skeleton-movers-col">
          <div
            className="skeleton-line"
            style={{ width: 50, height: 10, marginBottom: 4 }}
          />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton-row">
              <div
                className="skeleton-circle"
                style={{ width: 16, height: 16 }}
              />
              <div
                className="skeleton-line"
                style={{ width: 36, height: 12 }}
              />
              <div
                className="skeleton-line"
                style={{
                  width: 38,
                  height: 16,
                  borderRadius: 8,
                  marginLeft: "auto",
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SkeletonEarnings() {
  return (
    <>
      <div
        className="skeleton-line"
        style={{ width: 160, height: 10, marginBottom: 8 }}
      />
      <SkeletonStockList rows={3} />
    </>
  );
}

function SkeletonEconList() {
  return (
    <div className="skeleton-econ-list">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <div className="skeleton-line" style={{ width: "80%", height: 12 }} />
          <div className="skeleton-line" style={{ width: 100, height: 10 }} />
        </div>
      ))}
    </div>
  );
}

function SkeletonNews() {
  return (
    <div className="skeleton-news-layout">
      <div
        className="skeleton-line skeleton-news-featured"
        style={{ minHeight: 240 }}
      />
      <div className="skeleton-news-side">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton-news-item">
            <div
              className="skeleton-line"
              style={{ width: 60, height: 44, borderRadius: 6, flexShrink: 0 }}
            />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                className="skeleton-line"
                style={{ width: "90%", height: 11 }}
              />
              <div
                className="skeleton-line"
                style={{ width: "60%", height: 11 }}
              />
              <div className="skeleton-line" style={{ width: 70, height: 9 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonHeatmap() {
  return (
    <div className="skeleton-heatmap-grid">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="skeleton-line skeleton-heatmap-cell" />
      ))}
    </div>
  );
}

function SkeletonHero() {
  return (
    <>
      <div className="skeleton-hero-main">
        <div className="skeleton-hero-text">
          <div className="skeleton-line" style={{ width: 60, height: 10 }} />
          <div className="skeleton-line" style={{ width: 180, height: 32 }} />
          <div className="skeleton-line" style={{ width: 120, height: 14 }} />
        </div>
        <div
          className="skeleton-line skeleton-hero-chart"
          style={{ width: 200, height: 48 }}
        />
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div className="skeleton-line" style={{ width: 50, height: 8 }} />
            <div
              className="skeleton-line"
              style={{ width: "80%", height: 14 }}
            />
            <div className="skeleton-line" style={{ width: 40, height: 10 }} />
            <div
              className="skeleton-line"
              style={{ width: "100%", height: 20 }}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function SkeletonGauge() {
  return (
    <div className="skeleton-gauge">
      <div
        className="skeleton-circle"
        style={{ width: 160, height: 80, borderRadius: "80px 80px 0 0" }}
      />
      <div className="skeleton-line" style={{ width: 80, height: 14 }} />
      <div style={{ display: "flex", gap: 12 }}>
        <div className="skeleton-line" style={{ width: 50, height: 10 }} />
        <div className="skeleton-line" style={{ width: 50, height: 10 }} />
      </div>
    </div>
  );
}

function SectionCard({ title, tabKey, onNavigate, children, className = "" }) {
  const cardRef = useRef(null);
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty("--x", `${e.clientX - rect.left}px`);
    cardRef.current.style.setProperty("--y", `${e.clientY - rect.top}px`);
  };
  return (
    <div
      ref={cardRef}
      className={`home-card ${className}`}
      onClick={() => onNavigate(tabKey)}
      onMouseMove={handleMouseMove}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onNavigate(tabKey);
      }}
    >
      <div className="home-card-header">
        <span className="home-card-title">{title}</span>
        <span className="home-card-link">View All &rarr;</span>
      </div>
      <div className="home-card-body">{children}</div>
    </div>
  );
}

function StockRow({ stock, rank }) {
  const flash = usePriceFlash(stock.price);
  const animatedPrice = useAnimatedNumber(stock.price);
  const animatedPercent = useAnimatedNumber(stock.changePercent);
  const isPos = animatedPercent >= 0;
  return (
    <div className={`home-stock-row ${flash || ""}`}>
      {rank != null && <span className="home-stock-rank">{rank}</span>}
      <StockLogo symbol={stock.symbol} size={18} />
      <span className="home-stock-symbol">{stock.symbol}</span>
      <span className="home-stock-name">{stock.name}</span>
      <span className={`home-stock-price ${flash || ""}`}>
        {formatPrice(animatedPrice)}
      </span>
      <span
        className={`home-badge ${isPos ? "home-badge--green" : "home-badge--red"}`}
      >
        {isPos ? "+" : ""}
        {animatedPercent.toFixed(2)}%
      </span>
    </div>
  );
}

const SPARKLINE_SYMBOLS = ["ES=F", "NQ=F", "YM=F", "RTY=F", "^VIX"];

function useSparklineData(active) {
  const [sparklines, setSparklines] = useState({});

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    const fetchSparklines = async () => {
      try {
        const params = new URLSearchParams({
          symbols: SPARKLINE_SYMBOLS.join(","),
          range: "1d",
          interval: "5m",
          prepost: "true",
        });
        const res = await fetch(`/api/charts?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        const map = {};
        for (const [sym, candles] of Object.entries(json.charts || {})) {
          if (Array.isArray(candles) && candles.length > 0) {
            map[sym] = candles.map((c) => c.close).filter((v) => v != null);
          }
        }
        // If most symbols have no data (e.g. weekend), retry with 5d range
        const filled = Object.keys(map).length;
        if (filled < SPARKLINE_SYMBOLS.length - 1 && mounted) {
          const params5d = new URLSearchParams({
            symbols: SPARKLINE_SYMBOLS.join(","),
            range: "5d",
            interval: "15m",
            prepost: "true",
          });
          const res5d = await fetch(`/api/charts?${params5d}`);
          if (res5d.ok) {
            const json5d = await res5d.json();
            for (const [sym, candles] of Object.entries(json5d.charts || {})) {
              if (!map[sym] && Array.isArray(candles) && candles.length > 0) {
                map[sym] = candles.map((c) => c.close).filter((v) => v != null);
              }
            }
          }
        }
        if (mounted) setSparklines(map);
      } catch {
        /* sparklines are decorative */
      }
    };

    fetchSparklines();
    const id = setInterval(fetchSparklines, 120_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [active]);

  return sparklines;
}

function Sparkline({
  data,
  width = 120,
  height = 32,
  isPositive = true,
  hero = false,
}) {
  if (!data || data.length < 2)
    return <div style={{ width: "100%", height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = height * 0.1;
  const innerH = height - padY * 2;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = padY + innerH - ((val - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const gradId = hero ? "hero-spark-fill" : undefined;

  return (
    <svg
      className={hero ? "hero-sparkline-svg" : "sparkline-svg"}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
    >
      {hero && (
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={
                isPositive ? "rgba(0,200,83,0.2)" : "rgba(255,23,68,0.2)"
              }
            />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      {hero && (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={`url(#${gradId})`}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "var(--green-primary)" : "var(--red-primary)"}
        strokeWidth={hero ? 2 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function HeroPrice({ stock }) {
  const flash = usePriceFlash(stock.price);
  const animatedPrice = useAnimatedNumber(stock.price);
  return (
    <span className={`hero-price-value ${flash || ""}`}>
      {formatPrice(animatedPrice)}
    </span>
  );
}

function HeroChange({ stock }) {
  const animatedChange = useAnimatedNumber(stock.change || 0);
  const animatedPercent = useAnimatedNumber(stock.changePercent);
  const isPos = animatedPercent >= 0;
  return (
    <span className={`hero-change ${isPos ? "change-up" : "change-down"}`}>
      {isPos ? "+" : ""}
      {animatedChange.toFixed(2)} ({isPos ? "+" : ""}
      {animatedPercent.toFixed(2)}%)
    </span>
  );
}

function SecondaryIndex({ stock, label, sparkData }) {
  const flash = usePriceFlash(stock.price);
  const animatedPrice = useAnimatedNumber(stock.price);
  const animatedPercent = useAnimatedNumber(stock.changePercent);
  const isPos = animatedPercent >= 0;
  return (
    <div className={`hero-secondary ${flash || ""}`}>
      <div className="hero-secondary-label">{label}</div>
      <div className={`hero-secondary-price ${flash || ""}`}>
        {formatPrice(animatedPrice)}
      </div>
      <div
        className={`hero-secondary-change ${isPos ? "change-up" : "change-down"}`}
      >
        {isPos ? "+" : ""}
        {animatedPercent.toFixed(2)}%
      </div>
      <div
        className={`hero-secondary-spark ${isPos ? "spark-glow--up" : "spark-glow--down"}`}
      >
        <Sparkline data={sparkData} width={80} height={24} isPositive={isPos} />
      </div>
    </div>
  );
}

function MarketPulseCard({ futures, sparklines, onNavigate }) {
  const INDEX_MAP = {
    "ES=F": "S&P 500",
    "NQ=F": "Nasdaq",
    "YM=F": "Dow Jones",
    "RTY=F": "Russell 2000",
    "^VIX": "VIX",
  };
  const SECONDARY_ORDER = ["NQ=F", "YM=F", "RTY=F", "^VIX"];

  const sp = futures.find((s) => s.symbol === "ES=F");
  const isUp = sp ? sp.changePercent >= 0 : true;
  const secondaryIndices = SECONDARY_ORDER.map((sym) =>
    futures.find((s) => s.symbol === sym),
  ).filter(Boolean);

  const [mktStatus, setMktStatus] = useState(getMarketStatus);
  useEffect(() => {
    const id = setInterval(() => setMktStatus(getMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);

  const heroRef = useRef(null);
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    heroRef.current.style.setProperty("--x", `${e.clientX - rect.left}px`);
    heroRef.current.style.setProperty("--y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={heroRef}
      className={`home-card home-card--hero ${isUp ? "home-card--hero-up" : "home-card--hero-down"}`}
      onClick={() => onNavigate("futures")}
      onMouseMove={handleHeroMouseMove}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onNavigate("futures");
      }}
    >
      <div className="home-card-header">
        <span className="home-card-title">
          <span
            className={`hero-status-dot hero-status-dot--${mktStatus.status}`}
          />
          <span className="hero-status-label" title={mktStatus.sub}>
            {mktStatus.sub &&
            mktStatus.sub !== "Weekend" &&
            !mktStatus.sub.startsWith("Opens") &&
            !mktStatus.sub.startsWith("Regular")
              ? `${mktStatus.sub} · ${mktStatus.label}`
              : mktStatus.label}
          </span>
        </span>
        <span className="home-card-link">Futures &rarr;</span>
      </div>

      {sp ? (
        <div className="hero-main">
          <div className="hero-main-left">
            <div className="hero-main-label">S&P 500</div>
            <div className="hero-main-price">
              <HeroPrice stock={sp} />
            </div>
            <div className="hero-main-changes">
              <HeroChange stock={sp} />
            </div>
          </div>
          <div
            className={`hero-main-chart ${isUp ? "spark-glow--up" : "spark-glow--down"}`}
          >
            <Sparkline
              data={sparklines["ES=F"]}
              width={200}
              height={48}
              isPositive={isUp}
              hero
            />
          </div>
        </div>
      ) : (
        <SkeletonHero />
      )}

      {secondaryIndices.length > 0 && (
        <div className="hero-secondary-row">
          {secondaryIndices.map((stock) => (
            <SecondaryIndex
              key={stock.symbol}
              stock={stock}
              label={INDEX_MAP[stock.symbol]}
              sparkData={sparklines[stock.symbol]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsSection({ articles, onNavigate }) {
  // Featured article (with thumbnail) + side articles
  const featured = articles.filter((a) => a.thumbnail).slice(0, 1)[0];
  const sideArticles = articles.filter((a) => a !== featured).slice(0, 4);

  if (articles.length === 0) {
    return (
      <div
        className="home-news-section"
        onClick={() => onNavigate("news")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onNavigate("news");
        }}
      >
        <div className="home-section-header">
          <span className="home-section-title">Latest News</span>
          <span className="home-card-link">View All &rarr;</span>
        </div>
        <SkeletonNews />
      </div>
    );
  }

  return (
    <div className="home-news-section">
      <div
        className="home-section-header"
        onClick={() => onNavigate("news")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onNavigate("news");
        }}
      >
        <span className="home-section-title">Latest News</span>
        <span className="home-card-link">View All &rarr;</span>
      </div>
      <div className="home-news-grid">
        {featured && (
          <a
            className="home-news-featured"
            href={featured.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div
              className="home-news-featured-img"
              style={{ backgroundImage: `url(${featured.thumbnail})` }}
            />
            <div className="home-news-featured-overlay" />
            <div className="home-news-featured-content">
              <span className="home-news-pub-badge">{featured.publisher}</span>
              <h3 className="home-news-featured-title">{featured.title}</h3>
              {featured.publishedAt && (
                <span className="home-news-featured-time">
                  {timeAgo(featured.publishedAt)}
                </span>
              )}
            </div>
          </a>
        )}
        <div className="home-news-side">
          {sideArticles.map((a, i) => (
            <a
              key={i}
              className="home-news-side-item"
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {a.thumbnail && (
                <div
                  className="home-news-side-thumb"
                  style={{ backgroundImage: `url(${a.thumbnail})` }}
                />
              )}
              <div className="home-news-side-text">
                <span className="home-news-side-title">{a.title}</span>
                <span className="home-news-side-meta">
                  <span className="home-news-publisher">{a.publisher}</span>
                  {a.publishedAt && (
                    <span className="home-news-time">
                      {timeAgo(a.publishedAt)}
                    </span>
                  )}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function EarningsPreview({ earnings, onNavigate }) {
  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const allStocks = [];
    for (const [date, stocks] of Object.entries(earnings)) {
      if (date >= today) {
        for (const s of stocks) {
          allStocks.push({ ...s, date });
        }
      }
    }
    allStocks.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (b.marketCap || 0) - (a.marketCap || 0),
    );
    return allStocks;
  }, [earnings]);

  const weekCount = upcoming.length;
  const top3 = upcoming.slice(0, 3);

  return (
    <SectionCard title="Earnings" tabKey="earnings" onNavigate={onNavigate}>
      {Object.keys(earnings).length === 0 ? (
        <SkeletonEarnings />
      ) : weekCount > 0 ? (
        <>
          <div className="home-card-stat">
            {weekCount} companies reporting soon
          </div>
          <div className="home-stock-list">
            {top3.map((s) => (
              <div key={s.symbol} className="home-stock-row">
                <StockLogo symbol={s.symbol} size={16} />
                <span className="home-stock-symbol">{s.symbol}</span>
                <span className="home-stock-name">{s.name}</span>
                <span className="home-earnings-date">
                  {new Date(s.date + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="home-card-empty">No upcoming earnings</div>
      )}
    </SectionCard>
  );
}

function EconomicPreview({ events, onNavigate }) {
  const upcoming = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.date) >= now && e.importance === 1)
      .slice(0, 3);
  }, [events]);

  return (
    <SectionCard title="Economy" tabKey="economy" onNavigate={onNavigate}>
      {events.length === 0 ? (
        <SkeletonEconList />
      ) : upcoming.length > 0 ? (
        <div className="home-econ-list">
          {upcoming.map((e) => (
            <div key={e.id} className="home-econ-item">
              <span className="home-econ-title">{e.title}</span>
              <span className="home-econ-date">
                {new Date(e.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="home-card-empty">No upcoming high-impact events</div>
      )}
    </SectionCard>
  );
}

function getScoreLabel(score) {
  if (score <= 20) return "Extreme Fear";
  if (score <= 40) return "Fear";
  if (score <= 60) return "Neutral";
  if (score <= 80) return "Greed";
  return "Extreme Greed";
}

function getScoreColor(score) {
  if (score <= 20) return "#e01535";
  if (score <= 40) return "#f5652a";
  if (score <= 60) return "#f5a623";
  if (score <= 80) return "#8bc34a";
  return "#00d66b";
}

function FearGreedGauge({ active, futures }) {
  const [breadthData, setBreadthData] = useState(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    fetch("/api/heatmap")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!mounted || !json?.sectors) return;
        const allStocks = json.sectors.flatMap((s) =>
          s.industries.flatMap((i) => i.stocks),
        );
        const advancing = allStocks.filter(
          (s) => s.changePercent > 0.05,
        ).length;
        const total = allStocks.length;
        setBreadthData({ advancing, total });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [active]);

  // Compute score from VIX + breadth
  const vixStock = futures.find(
    (s) => s.symbol === "^VIX" || s.symbol === "VX=F",
  );
  const vixPrice = vixStock?.price || null;

  // VIX component: VIX 10 → 100 (extreme greed), VIX 35 → 0 (extreme fear), linear
  const vixScore =
    vixPrice != null
      ? Math.max(0, Math.min(100, ((35 - vixPrice) / 25) * 100))
      : null;

  // Breadth component: 80%+ advancing → 100, 20%- → 0
  const breadthScore = breadthData
    ? Math.max(
        0,
        Math.min(
          100,
          ((breadthData.advancing / breadthData.total - 0.2) / 0.6) * 100,
        ),
      )
    : null;

  // Weighted average (VIX has more weight since it's more reliable)
  let score = null;
  if (vixScore != null && breadthScore != null) {
    score = Math.round(vixScore * 0.6 + breadthScore * 0.4);
  } else if (vixScore != null) {
    score = Math.round(vixScore);
  } else if (breadthScore != null) {
    score = Math.round(breadthScore);
  }

  if (score === null)
    return (
      <div className="home-feargreed">
        <div className="home-card-header" style={{ width: "100%" }}>
          <span className="home-card-title">Fear & Greed</span>
        </div>
        <SkeletonGauge />
      </div>
    );

  const label = getScoreLabel(score);
  const color = getScoreColor(score);

  // Fan/wedge gauge — 3D colored segments fanning from center hub
  const cx = 100;
  const cy = 100;
  const outerR = 82;
  const innerR = 36;
  const hubR = 28;

  // Needle angle: score 0 → angle 0 (right/fear), score 100 → angle π (left/greed)
  const needleAngle = (score / 100) * Math.PI;

  // 7 wedge segments from left (greed) to right (fear)
  const segColors = [
    { base: "#00c853", light: "#69f0ae", dark: "#00701a" },
    { base: "#43a047", light: "#76d275", dark: "#1b5e20" },
    { base: "#7cb342", light: "#aee571", dark: "#4b830d" },
    { base: "#fdd835", light: "#ffff6b", dark: "#c6a700" },
    { base: "#ffb300", light: "#ffe54c", dark: "#c68400" },
    { base: "#f4511e", light: "#ff8a50", dark: "#b91400" },
    { base: "#c62828", light: "#ff5f52", dark: "#8e0000" },
  ];
  const segCount = segColors.length;
  const gapAngle = 0.03;
  const totalGap = gapAngle * (segCount - 1);
  const segSpan = (Math.PI - totalGap) / segCount;

  // Build wedge path
  const wedgePath = (a1, a2) => {
    const x1o = cx + outerR * Math.cos(a1);
    const y1o = cy - outerR * Math.sin(a1);
    const x2o = cx + outerR * Math.cos(a2);
    const y2o = cy - outerR * Math.sin(a2);
    const x1i = cx + innerR * Math.cos(a1);
    const y1i = cy - innerR * Math.sin(a1);
    const x2i = cx + innerR * Math.cos(a2);
    const y2i = cy - innerR * Math.sin(a2);
    return `M ${x1o.toFixed(2)} ${y1o.toFixed(2)} A ${outerR} ${outerR} 0 0 1 ${x2o.toFixed(2)} ${y2o.toFixed(2)} L ${x2i.toFixed(2)} ${y2i.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${x1i.toFixed(2)} ${y1i.toFixed(2)} Z`;
  };

  // Highlight arc (thinner, shifted inward from outer edge for glossy sheen)
  const highlightR = outerR - 6;
  const highlightArc = (a1, a2) => {
    const x1 = cx + highlightR * Math.cos(a1);
    const y1 = cy - highlightR * Math.sin(a1);
    const x2 = cx + highlightR * Math.cos(a2);
    const y2 = cy - highlightR * Math.sin(a2);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${highlightR} ${highlightR} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  // Needle tip
  const ntx = cx + (outerR + 5) * Math.cos(needleAngle);
  const nty = cy - (outerR + 5) * Math.sin(needleAngle);
  // Needle triangle base (perpendicular to needle direction)
  const perpAngle = needleAngle + Math.PI / 2;
  const baseW = 3.5;
  const nb1x = cx + baseW * Math.cos(perpAngle);
  const nb1y = cy - baseW * Math.sin(perpAngle);
  const nb2x = cx - baseW * Math.cos(perpAngle);
  const nb2y = cy + baseW * Math.sin(perpAngle);

  // Which segment is the needle in?
  const activeSegIdx = Math.min(
    segCount - 1,
    Math.floor((1 - score / 100) * segCount),
  );

  return (
    <div className="home-feargreed">
      <div className="home-feargreed-header">
        <span className="home-section-title">Fear & Greed</span>
      </div>
      <div className="home-feargreed-gauge">
        <svg viewBox="0 0 200 125" className="home-feargreed-svg">
          <defs>
            {/* Per-segment radial gradients for 3D depth */}
            {segColors.map((seg, i) => {
              const midA = Math.PI - (i + 0.5) * (segSpan + gapAngle);
              const gx = cx + outerR * 0.6 * Math.cos(midA);
              const gy = cy - outerR * 0.6 * Math.sin(midA);
              return (
                <radialGradient
                  key={`grad-${i}`}
                  id={`fg-seg-${i}`}
                  cx={gx / 200}
                  cy={gy / 125}
                  r="0.5"
                  gradientUnits="objectBoundingBox"
                >
                  <stop offset="0%" stopColor={seg.light} />
                  <stop offset="60%" stopColor={seg.base} />
                  <stop offset="100%" stopColor={seg.dark} />
                </radialGradient>
              );
            })}
            {/* Hub 3D radial gradient */}
            <radialGradient id="fg-hub-grad" cx="0.4" cy="0.35" r="0.6">
              <stop offset="0%" stopColor="#2a2a3e" />
              <stop offset="70%" stopColor="#12121a" />
              <stop offset="100%" stopColor="#08080e" />
            </radialGradient>
            {/* Hub ring gradient */}
            <radialGradient id="fg-hub-ring" cx="0.5" cy="0.5" r="0.5">
              <stop offset="80%" stopColor={color} stopOpacity="0.15" />
              <stop offset="100%" stopColor={color} stopOpacity="0.5" />
            </radialGradient>
            {/* Needle glow */}
            <filter
              id="fg-needle-glow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="2"
                floodColor={color}
                floodOpacity="0.8"
              />
            </filter>
            {/* Shadow under gauge */}
            <filter id="fg-shadow" x="-10%" y="-5%" width="120%" height="130%">
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="4"
                floodColor="#000"
                floodOpacity="0.4"
              />
            </filter>
          </defs>

          {/* Shadow layer */}
          <g filter="url(#fg-shadow)">
            {/* Wedge segments with 3D gradient fills */}
            {segColors.map((seg, i) => {
              const a1 = Math.PI - i * (segSpan + gapAngle);
              const a2 = a1 - segSpan;
              const isActive = i === activeSegIdx;
              return (
                <path
                  key={i}
                  d={wedgePath(a1, a2)}
                  fill={`url(#fg-seg-${i})`}
                  opacity={isActive ? 1 : 0.4}
                />
              );
            })}
          </g>

          {/* Glossy highlight arcs on each segment (top sheen) */}
          {segColors.map((seg, i) => {
            const a1 = Math.PI - i * (segSpan + gapAngle) - 0.02;
            const a2 = a1 - segSpan + 0.04;
            const isActive = i === activeSegIdx;
            return (
              <path
                key={`hl-${i}`}
                d={highlightArc(a1, a2)}
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity={isActive ? 0.5 : 0.15}
              />
            );
          })}

          {/* Inner edge shadow (dark ring at inner radius for depth) */}
          <path
            d={`M ${cx - innerR} ${cy} A ${innerR} ${innerR} 0 0 1 ${cx + innerR} ${cy}`}
            fill="none"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="3"
          />

          {/* Needle — solid triangle */}
          <polygon
            points={`${ntx.toFixed(2)},${nty.toFixed(2)} ${nb1x.toFixed(2)},${nb1y.toFixed(2)} ${nb2x.toFixed(2)},${nb2y.toFixed(2)}`}
            fill="#fff"
            filter="url(#fg-needle-glow)"
          />

          {/* Hub — 3D sphere */}
          <circle cx={cx} cy={cy} r={hubR + 3} fill="url(#fg-hub-ring)" />
          <circle
            cx={cx}
            cy={cy}
            r={hubR}
            fill="url(#fg-hub-grad)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
          {/* Hub specular highlight */}
          <ellipse
            cx={cx - 5}
            cy={cy - 6}
            rx="12"
            ry="8"
            fill="rgba(255,255,255,0.06)"
          />

          {/* Score number */}
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize="22"
            fontWeight="800"
            fontFamily="var(--font-mono)"
          >
            {score}
          </text>

          {/* GREED / FEAR labels */}
          <text
            x={22}
            y={cy + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.35)"
            fontSize="6.5"
            fontWeight="700"
            letterSpacing="0.08em"
          >
            GREED
          </text>
          <text
            x={178}
            y={cy + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.35)"
            fontSize="6.5"
            fontWeight="700"
            letterSpacing="0.08em"
          >
            FEAR
          </text>

          {/* Label below hub */}
          <text
            x={cx}
            y={cy + hubR + 14}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize="8"
            fontWeight="600"
            letterSpacing="0.1em"
          >
            {label.toUpperCase()}
          </text>
        </svg>
      </div>
      <div className="home-feargreed-factors">
        {vixPrice != null && (
          <span className="home-feargreed-factor">
            VIX: {vixPrice.toFixed(1)}
          </span>
        )}
        {breadthData && (
          <span className="home-feargreed-factor">
            Breadth:{" "}
            {((breadthData.advancing / breadthData.total) * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function MarketBreadthWidget({ active }) {
  const [breadth, setBreadth] = useState(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    fetch("/api/heatmap")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!mounted || !json?.sectors) return;
        const allStocks = json.sectors.flatMap((s) =>
          s.industries.flatMap((i) => i.stocks),
        );
        const advancing = allStocks.filter(
          (s) => s.changePercent > 0.05,
        ).length;
        const declining = allStocks.filter(
          (s) => s.changePercent < -0.05,
        ).length;
        const unchanged = allStocks.length - advancing - declining;
        const total = allStocks.length;
        const adRatio =
          declining > 0 ? (advancing / declining).toFixed(2) : "N/A";
        const pct = total > 0 ? ((advancing / total) * 100).toFixed(1) : "0";
        setBreadth({ advancing, declining, unchanged, total, adRatio, pct });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [active]);

  if (!breadth) return null;

  const { advancing, declining, unchanged, total } = breadth;
  const advPct = total > 0 ? (advancing / total) * 100 : 0;
  const unchPct = total > 0 ? (unchanged / total) * 100 : 0;
  const decPct = total > 0 ? (declining / total) * 100 : 0;

  return (
    <div className="home-breadth-section">
      <div className="home-breadth-header">
        <span className="home-section-title">Market Breadth</span>
        <span className="home-breadth-pct">{breadth.pct}% advancing</span>
      </div>
      <div className="home-breadth-bar">
        <div className="home-breadth-bar-adv" style={{ width: `${advPct}%` }} />
        <div
          className="home-breadth-bar-unch"
          style={{ width: `${unchPct}%` }}
        />
        <div className="home-breadth-bar-dec" style={{ width: `${decPct}%` }} />
      </div>
      <div className="home-breadth-stats">
        <span className="home-breadth-stat home-breadth-stat--adv">
          {advancing} Advancing
        </span>
        <span className="home-breadth-stat home-breadth-stat--unch">
          {unchanged} Unchanged
        </span>
        <span className="home-breadth-stat home-breadth-stat--dec">
          {declining} Declining
        </span>
        <span className="home-breadth-stat">A/D Ratio: {breadth.adRatio}</span>
      </div>
    </div>
  );
}

function getHeatmapColor(changePercent) {
  const isDark =
    document.documentElement.getAttribute("data-theme") !== "light";
  const clamped = Math.max(-5, Math.min(5, changePercent));
  const t = Math.abs(clamped) / 5;
  const intensity = Math.pow(t, 0.6);

  const base = isDark ? [18, 18, 26] : [240, 240, 245];
  const target =
    clamped >= 0
      ? isDark
        ? [0, 155, 52]
        : [80, 200, 100]
      : isDark
        ? [196, 3, 39]
        : [220, 100, 100];

  const r = Math.round(base[0] + (target[0] - base[0]) * intensity);
  const g = Math.round(base[1] + (target[1] - base[1]) * intensity);
  const b = Math.round(base[2] + (target[2] - base[2]) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

function HeatmapPreview({ active, onNavigate }) {
  const [sectors, setSectors] = useState(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    fetch("/api/heatmap")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (mounted && json?.sectors) setSectors(json.sectors);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [active]);

  const sectorData = useMemo(() => {
    if (!sectors) return [];
    return sectors
      .map((s) => {
        const stocks = s.industries.flatMap((i) => i.stocks);
        const totalCap = stocks.reduce(
          (sum, st) => sum + (st.marketCap || 0),
          0,
        );
        const weightedChange =
          totalCap > 0
            ? stocks.reduce(
                (sum, st) =>
                  sum + (st.changePercent || 0) * (st.marketCap || 0),
                0,
              ) / totalCap
            : 0;
        return {
          name: s.name,
          change: weightedChange,
          cap: totalCap,
          count: stocks.length,
        };
      })
      .filter((s) => s.cap > 0)
      .sort((a, b) => b.cap - a.cap);
  }, [sectors]);

  return (
    <div className="home-heatmap-section">
      <div
        className="home-section-header"
        onClick={() => onNavigate("heatmap")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onNavigate("heatmap");
        }}
      >
        <span className="home-section-title">Market Heatmap</span>
        <span className="home-card-link">Full View &rarr;</span>
      </div>
      {sectorData.length > 0 ? (
        <div
          className="home-heatmap-grid"
          onClick={() => onNavigate("heatmap")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") onNavigate("heatmap");
          }}
        >
          {sectorData.map((s) => (
            <div
              key={s.name}
              className="home-heatmap-cell"
              style={{ backgroundColor: getHeatmapColor(s.change) }}
            >
              <span className="home-heatmap-cell-name">{s.name}</span>
              <span
                className={`home-heatmap-cell-change ${s.change >= 0 ? "change-up" : "change-down"}`}
              >
                {s.change >= 0 ? "+" : ""}
                {s.change.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <SkeletonHeatmap />
      )}
    </div>
  );
}

function MoverRow({ stock, isGainer }) {
  const flash = usePriceFlash(stock.change);
  const animatedChange = useAnimatedNumber(stock.change);
  return (
    <div className={`home-movers-row ${flash || ""}`}>
      <StockLogo symbol={stock.symbol} size={16} />
      <span className="home-stock-symbol">{stock.symbol}</span>
      <span
        className={`home-badge ${isGainer ? "home-badge--green" : "home-badge--red"}`}
      >
        {isGainer ? "+" : ""}
        {animatedChange.toFixed(1)}%
      </span>
    </div>
  );
}

function FuturesRow({ stock, label }) {
  const flash = usePriceFlash(stock.price);
  const animatedPrice = useAnimatedNumber(stock.price);
  const animatedPercent = useAnimatedNumber(stock.changePercent);
  const isPos = animatedPercent >= 0;
  return (
    <div className={`home-futures-row ${flash || ""}`}>
      <span className="home-futures-name">{label}</span>
      <span className={`home-stock-price ${flash || ""}`}>
        {formatPrice(animatedPrice)}
      </span>
      <span
        className={`home-badge home-badge--sm ${isPos ? "home-badge--green" : "home-badge--red"}`}
      >
        {isPos ? "+" : ""}
        {animatedPercent.toFixed(2)}%
      </span>
    </div>
  );
}

function MoversPreview({ gainers, losers, session, onNavigate }) {
  const isMarketOpen = session === "market";
  const isClosed = session === "closed";
  const label =
    session === "pre"
      ? "Pre-Market"
      : session === "post"
        ? "After-Hours"
        : isMarketOpen
          ? "Market Open"
          : "Market Closed";
  const topG = gainers.slice(0, 3);
  const topL = losers.slice(0, 3);
  const hasData = topG.length > 0 || topL.length > 0;

  return (
    <SectionCard title="Pre/After" tabKey="movers" onNavigate={onNavigate}>
      <div className="home-card-stat">
        {label}
        {!isMarketOpen && !isClosed ? " active" : ""}
      </div>
      {hasData ? (
        <div className="home-movers-split">
          <div className="home-movers-col">
            <span className="home-movers-label home-movers-label--up">
              Gainers
            </span>
            {topG.map((s) => (
              <MoverRow key={s.symbol} stock={s} isGainer />
            ))}
          </div>
          <div className="home-movers-col">
            <span className="home-movers-label home-movers-label--down">
              Losers
            </span>
            {topL.map((s) => (
              <MoverRow key={s.symbol} stock={s} isGainer={false} />
            ))}
          </div>
        </div>
      ) : (
        <div className="home-card-empty">
          {isMarketOpen
            ? "Market is open — ext. hours data after close"
            : "No extended hours movers available"}
        </div>
      )}
    </SectionCard>
  );
}

export default function Home({
  active,
  gainers = [],
  losers = [],
  trending = [],
  futures = [],
  crypto = [],
  favorites = [],
  onTabChange,
}) {
  const { articles } = useNewsFeed(active);
  const { earnings } = useEarningsCalendar(active);
  const { events } = useEconomicCalendar(active);
  const detectedSession = useMemo(() => detectSession(), []);
  const apiSession =
    detectedSession === "pre"
      ? "pre"
      : detectedSession === "market"
        ? "pre"
        : "post";
  const { gainers: preGainers, losers: preLosers } = useMovers(
    active,
    apiSession,
  );
  const {
    order,
    hidden,
    moveUp,
    moveDown,
    reorder,
    toggleVisibility,
    resetLayout,
  } = useHomeLayout();
  const sparklines = useSparklineData(active);
  const [editMode, setEditMode] = useState(false);

  // ── Long-press to activate edit mode + immediate drag ──
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const longPressStart = useRef({ x: 0, y: 0, key: null });
  const startDragRef = useRef(null);

  // Key futures for the dedicated card
  const KEY_FUTURES = ["ES=F", "NQ=F", "YM=F", "CL=F", "GC=F"];
  const keyFutures = futures.filter((s) => KEY_FUTURES.includes(s.symbol));
  const FUTURE_NAMES = {
    "ES=F": "S&P 500",
    "NQ=F": "Nasdaq",
    "YM=F": "Dow",
    "CL=F": "Crude Oil",
    "GC=F": "Gold",
  };

  const visibleSections = order.filter((k) => !hidden.includes(k));
  const hiddenSections = order.filter((k) => hidden.includes(k));

  const getSpanClass = (key) => {
    const section = SECTION_MAP[key];
    if (!section) return "";
    if (section.span === "full") return "home-section--full";
    if (section.span === 2) return "home-section--wide";
    return "";
  };

  // ── Drag-and-drop — all visuals via direct DOM (zero React re-renders) ──
  const dragRef = useRef({ scrollRaf: null, cancelled: false, active: false });
  const gridRef = useRef(null);

  const getPointerXY = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  };

  const startDrag = useCallback(
    (key, x, y) => {
      if (!gridRef.current) return;
      dragRef.current.cancelled = false;
      dragRef.current.active = true;

      // Source element + label for ghost
      const sourceEl = gridRef.current.querySelector(
        `[data-section-key="${key}"]`,
      );
      if (!sourceEl) return;
      const sectionMeta = SECTION_MAP[key];
      const sourceRect = sourceEl.getBoundingClientRect();

      // Mark source as dragging via DOM class
      sourceEl.classList.add("home-section--dragging");

      // Collect other section elements for hit-testing (rects read live each frame)
      const hitTargets = [];
      gridRef.current.querySelectorAll("[data-section-key]").forEach((el) => {
        if (el.getAttribute("data-section-key") !== key) hitTargets.push(el);
      });

      // Create simple ghost — just a small labeled card
      const ghostEl = document.createElement("div");
      ghostEl.className = "home-drag-ghost";
      const ghostW = Math.min(sourceRect.width, 220);
      const ghostH = 48;
      ghostEl.textContent = sectionMeta?.label || key;
      ghostEl.style.cssText =
        `position:fixed;z-index:9999;pointer-events:none;` +
        `width:${ghostW}px;height:${ghostH}px;` +
        `left:0;top:0;will-change:transform;` +
        `transform:translate3d(${x - ghostW / 2}px,${y - ghostH / 2}px,0);`;
      document.body.appendChild(ghostEl);
      const offX = ghostW / 2,
        offY = ghostH / 2;

      // Capture full document height BEFORE locking (lockScroll sets position:fixed
      // which collapses scrollHeight)
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      const maxScroll = Math.max(0, docHeight - window.innerHeight);

      // Lock body scroll (iOS-compatible)
      let scrollY = lockScroll();
      const prevTouchAction = document.body.style.touchAction;
      document.body.style.touchAction = "none";
      // Prevent pull-to-refresh on Android during drag
      const prevOverscroll = document.documentElement.style.overscrollBehavior;
      document.documentElement.style.overscrollBehavior = "contain";

      let lastX = x,
        lastY = y;
      let currentOverEl = null;
      let dirty = true;

      // Unified render loop — auto-scroll + ghost + hit-testing in a single rAF
      // to avoid layout thrashing from multiple independent loops
      const frame = () => {
        // ── Velocity-based edge auto-scroll ──
        const edge = 80;
        const topDist = lastY;
        const bottomDist = window.innerHeight - lastY;
        if (topDist < edge && scrollY > 0) {
          const t = 1 - topDist / edge; // 0 at edge boundary → 1 at screen edge
          const speed = Math.round(t * t * 14) + 1; // quadratic ease, 1–15 px/frame
          scrollY = Math.max(0, scrollY - speed);
          document.body.style.top = `-${scrollY}px`;
          dirty = true;
        } else if (bottomDist < edge && scrollY < maxScroll) {
          const t = 1 - bottomDist / edge;
          const speed = Math.round(t * t * 14) + 1;
          scrollY = Math.min(maxScroll, scrollY + speed);
          document.body.style.top = `-${scrollY}px`;
          dirty = true;
        }

        // ── Ghost position + hit-testing (only when something changed) ──
        if (dirty) {
          ghostEl.style.transform = `translate3d(${lastX - offX}px,${lastY - offY}px,0)`;
          let foundEl = null;
          for (const el of hitTargets) {
            const r = el.getBoundingClientRect();
            if (
              lastX >= r.left &&
              lastX <= r.right &&
              lastY >= r.top &&
              lastY <= r.bottom
            ) {
              foundEl = el;
              break;
            }
          }
          if (foundEl !== currentOverEl) {
            if (currentOverEl)
              currentOverEl.classList.remove("home-section--dragover");
            currentOverEl = foundEl;
            if (currentOverEl)
              currentOverEl.classList.add("home-section--dragover");
          }
          dirty = false;
        }

        dragRef.current.scrollRaf = requestAnimationFrame(frame);
      };
      dragRef.current.scrollRaf = requestAnimationFrame(frame);

      const onMove = (ev) => {
        ev.preventDefault();
        const { x: cx, y: cy } = getPointerXY(ev);
        lastX = cx;
        lastY = cy;
        dirty = true;
      };

      // Allow mouse wheel scrolling while dragging (desktop)
      const onWheel = (ev) => {
        ev.preventDefault();
        const delta = Math.max(-60, Math.min(60, ev.deltaY));
        scrollY = Math.max(0, Math.min(maxScroll, scrollY + delta));
        document.body.style.top = `-${scrollY}px`;
        dirty = true;
      };

      const cleanup = () => {
        cancelAnimationFrame(dragRef.current.scrollRaf);
        unlockScroll(scrollY);
        document.body.style.touchAction = prevTouchAction;
        document.documentElement.style.overscrollBehavior = prevOverscroll;
        ghostEl.remove();
        sourceEl.classList.remove("home-section--dragging");
        if (currentOverEl)
          currentOverEl.classList.remove("home-section--dragover");
        dragRef.current.active = false;
        window.getSelection()?.removeAllRanges();
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onEnd);
        window.removeEventListener("touchmove", onMove, { passive: false });
        window.removeEventListener("touchend", onEnd);
        window.removeEventListener("touchcancel", onEnd);
        window.removeEventListener("wheel", onWheel, { passive: false });
        window.removeEventListener("keydown", onKeyDown);
      };

      const onEnd = () => {
        const targetKey = currentOverEl?.getAttribute("data-section-key");
        const wasCancelled = dragRef.current.cancelled;
        cleanup();
        if (!wasCancelled && targetKey) reorder(key, targetKey);
      };

      const onKeyDown = (ev) => {
        if (ev.key === "Escape") {
          dragRef.current.cancelled = true;
          onEnd();
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
      window.addEventListener("touchcancel", onEnd);
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("keydown", onKeyDown);
    },
    [reorder],
  );

  // Keep startDrag accessible to long-press timeout
  startDragRef.current = startDrag;

  // Block native text selection during long-press detection
  const preventSelect = useCallback((e) => {
    e.preventDefault();
  }, []);

  const startSelectionBlock = useCallback(() => {
    document.addEventListener("selectstart", preventSelect, { capture: true });
  }, [preventSelect]);

  const stopSelectionBlock = useCallback(() => {
    document.removeEventListener("selectstart", preventSelect, {
      capture: true,
    });
    window.getSelection()?.removeAllRanges();
  }, [preventSelect]);

  // Long-press handler — works in both normal and edit mode
  const handlePointerDown = useCallback(
    (e) => {
      if (
        e.target.closest(".home-section-controls-btns") ||
        e.target.closest(".home-section-ctrl-btn")
      )
        return;
      if (e.target.closest("button") || e.target.closest("a")) return;
      const wrapper =
        e.currentTarget.closest("[data-section-key]") || e.currentTarget;
      const key = wrapper?.getAttribute("data-section-key");
      if (!key) return;
      longPressFired.current = false;
      longPressStart.current = { x: e.clientX, y: e.clientY, key };
      const cx = e.clientX;
      const cy = e.clientY;

      // Immediately block text selection while finger is down
      startSelectionBlock();

      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        window.getSelection()?.removeAllRanges();
        if (!editMode) setEditMode(true);
        if (navigator.vibrate) navigator.vibrate(50);
        startDragRef.current(key, cx, cy);
      }, 500);
    },
    [editMode, startSelectionBlock],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!longPressTimer.current) return;
      const dx = e.clientX - longPressStart.current.x;
      const dy = e.clientY - longPressStart.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        stopSelectionBlock();
      }
    },
    [stopSelectionBlock],
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    stopSelectionBlock();
  }, [stopSelectionBlock]);

  const handleSectionClick = useCallback(
    (e) => {
      // In edit mode, suppress all card navigation clicks
      if (editMode) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (longPressFired.current) {
        e.stopPropagation();
        e.preventDefault();
        longPressFired.current = false;
      }
    },
    [editMode],
  );

  // Escape exits edit mode (when not mid-drag — drag's own Escape handler fires first)
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !dragRef.current.active) setEditMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  const handleContextMenu = useCallback((e) => {
    if (longPressFired.current || longPressTimer.current) {
      e.preventDefault();
    }
  }, []);

  const renderSection = (key) => {
    switch (key) {
      case "pulse":
        return (
          <MarketPulseCard
            futures={futures}
            sparklines={sparklines}
            onNavigate={onTabChange}
          />
        );
      case "runners":
        return (
          <SectionCard
            title="Top Runners"
            tabKey="gainers"
            onNavigate={onTabChange}
          >
            {gainers.length > 0 ? (
              <div className="home-stock-list">
                {gainers.slice(0, 4).map((s, i) => (
                  <StockRow key={s.symbol} stock={s} rank={i + 1} />
                ))}
              </div>
            ) : (
              <SkeletonStockList />
            )}
          </SectionCard>
        );
      case "feargreed":
        return <FearGreedGauge active={active} futures={futures} />;
      case "news":
        return <NewsSection articles={articles} onNavigate={onTabChange} />;
      case "breadth":
        return <MarketBreadthWidget active={active} />;
      case "heatmap":
        return <HeatmapPreview active={active} onNavigate={onTabChange} />;
      case "losers":
        return (
          <SectionCard
            title="Top Losers"
            tabKey="losers"
            onNavigate={onTabChange}
          >
            {losers.length > 0 ? (
              <div className="home-stock-list">
                {losers.slice(0, 4).map((s, i) => (
                  <StockRow key={s.symbol} stock={s} rank={i + 1} />
                ))}
              </div>
            ) : (
              <SkeletonStockList />
            )}
          </SectionCard>
        );
      case "movers":
        return (
          <MoversPreview
            gainers={preGainers}
            losers={preLosers}
            session={detectedSession}
            onNavigate={onTabChange}
          />
        );
      case "trending":
        return (
          <SectionCard
            title="Trending"
            tabKey="trending"
            onNavigate={onTabChange}
          >
            {trending.length > 0 ? (
              <div className="home-stock-list">
                {trending.slice(0, 4).map((s) => (
                  <StockRow key={s.symbol} stock={s} />
                ))}
              </div>
            ) : (
              <SkeletonStockList />
            )}
          </SectionCard>
        );
      case "futures":
        return (
          <SectionCard
            title="Futures"
            tabKey="futures"
            onNavigate={onTabChange}
          >
            {keyFutures.length > 0 ? (
              <div className="home-futures-list">
                {keyFutures.map((s) => (
                  <FuturesRow
                    key={s.symbol}
                    stock={s}
                    label={FUTURE_NAMES[s.symbol] || s.symbol}
                  />
                ))}
              </div>
            ) : (
              <SkeletonFuturesList />
            )}
          </SectionCard>
        );
      case "crypto":
        return (
          <SectionCard title="Crypto" tabKey="crypto" onNavigate={onTabChange}>
            {crypto.length > 0 ? (
              <div className="home-stock-list">
                {crypto.slice(0, 4).map((s) => (
                  <StockRow key={s.symbol} stock={s} />
                ))}
              </div>
            ) : (
              <SkeletonStockList />
            )}
          </SectionCard>
        );
      case "earnings":
        return <EarningsPreview earnings={earnings} onNavigate={onTabChange} />;
      case "economy":
        return <EconomicPreview events={events} onNavigate={onTabChange} />;
      case "favorites":
        return (
          <SectionCard
            title="Favorites"
            tabKey="favorites"
            onNavigate={onTabChange}
          >
            {favorites.length > 0 ? (
              <div className="home-stock-list">
                {favorites.slice(0, 4).map((s) => (
                  <StockRow key={s.symbol} stock={s} />
                ))}
              </div>
            ) : (
              <div className="home-card-empty">
                Star stocks to build your favorites
              </div>
            )}
          </SectionCard>
        );
      default:
        return null;
    }
  };

  return (
    <main className="home-main">
      {/* Brand hero — always first, not reorderable */}
      <div className="home-brand">
        <div className="home-brand-top">
          <h1 className="home-brand-name">
            <span className="home-brand-tickr">Tickr</span>
            <span className="home-brand-pulse">Pulse</span>
          </h1>
          <button
            className={`home-edit-toggle ${editMode ? "home-edit-toggle--active" : ""}`}
            onClick={() => setEditMode((e) => !e)}
            title={editMode ? "Exit edit mode" : "Customize layout"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
        <p className="home-brand-tagline">
          Real-time market intelligence at your fingertips
        </p>
      </div>

      {/* Edit mode toolbar — centered at top */}
      {editMode && (
        <div className="home-edit-toolbar">
          <div className="home-edit-toolbar-inner">
            <button className="home-reset-btn" onClick={resetLayout}>
              Reset to Default
            </button>
            <span className="home-edit-toolbar-label">Editing Layout</span>
            <button
              className="home-edit-done-btn"
              onClick={() => setEditMode(false)}
            >
              Done
            </button>
          </div>
          {hiddenSections.length > 0 && (
            <div className="home-hidden-inline">
              <span className="home-hidden-inline-label">Hidden:</span>
              {hiddenSections.map((key) => {
                const section = SECTION_MAP[key];
                if (!section) return null;
                return (
                  <button
                    key={key}
                    className="home-hidden-item"
                    onClick={() => toggleVisibility(key)}
                  >
                    {section.label}
                    <span className="home-hidden-show">+</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dynamic sections grid */}
      <div className="home-sections-grid" ref={gridRef}>
        {visibleSections.map((key) => {
          const section = SECTION_MAP[key];
          if (!section) return null;
          return (
            <div
              key={key}
              data-section-key={key}
              className={`home-section-wrapper ${getSpanClass(key)} ${editMode ? "home-section-wrapper--editing" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onClickCapture={handleSectionClick}
              onContextMenu={handleContextMenu}
            >
              {editMode && (
                <div
                  className="home-section-controls"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="home-section-controls-label">
                    {section.label}
                  </span>
                  <div className="home-section-controls-btns">
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={() => toggleVisibility(key)}
                      title="Hide section"
                      className="home-section-ctrl-btn home-section-ctrl-btn--hide"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              {renderSection(key)}
            </div>
          );
        })}
      </div>
    </main>
  );
}
