import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import { useScrollLock } from '../hooks/useScrollLock.js';
import { useChartData } from '../hooks/useChartData.js';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber.js';
import { formatPrice, formatVolume } from '../utils/formatters.js';
import { CHART_REFRESH_FACTOR } from '../utils/constants.js';
import { calcEMA, calcRSI, calcMACD, calcVWAP } from '../utils/indicators.js';
import { SessionHighlighter, projectForwardTimestamps } from '../utils/sessionHighlight.js';
import { RoundedCandleSeries } from '../utils/roundedCandles.js';
import StockLogo from './StockLogo.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

// Yahoo Finance caps intraday data at ~60 days for 5m/15m/30m and ~730 days for 1h.
// Requesting a range beyond these limits causes Yahoo to silently return daily candles.
const MINUTE_TIMEFRAMES = [
  { label: '1m',  range: '5d',  interval: '1m',  refreshMs: 10_000, visibleBars: 80 },
  { label: '2m',  range: '5d',  interval: '2m',  refreshMs: 15_000, visibleBars: 70 },
  { label: '5m',  range: '1mo', interval: '5m',  refreshMs: 30_000, visibleBars: 60 },
  { label: '15m', range: '1mo', interval: '15m', refreshMs: 60_000, visibleBars: 50 },
  { label: '30m', range: '1mo', interval: '30m', refreshMs: 60_000, visibleBars: 40 },
  { label: '1h',  range: '2y',  interval: '1h',  refreshMs: 60_000, visibleBars: 40 },
  { label: '2h',  range: '2y',  interval: '1h',  refreshMs: 0, visibleBars: 40, aggregate: 2 },
  { label: '4h',  range: '2y',  interval: '1h',  refreshMs: 0, visibleBars: 40, aggregate: 4 },
];

// Crypto: 1m uses Coinbase API (Yahoo doesn't provide real OHLC at 1m for crypto)
// Yahoo caps intraday crypto data at ~60 days — use conservative ranges to avoid
// Yahoo silently downgrading the interval to daily candles.
const CRYPTO_MINUTE_TIMEFRAMES = [
  { label: '1m',  range: '5d',  interval: '1m',  refreshMs: 10_000, visibleBars: 80 },
  { label: '5m',  range: '5d',  interval: '5m',  refreshMs: 30_000, visibleBars: 60 },
  { label: '15m', range: '1mo', interval: '15m', refreshMs: 60_000, visibleBars: 50 },
  { label: '30m', range: '1mo', interval: '30m', refreshMs: 60_000, visibleBars: 40 },
  { label: '1h',  range: '6mo', interval: '1h',  refreshMs: 60_000, visibleBars: 40 },
  { label: '2h',  range: '6mo', interval: '1h',  refreshMs: 0, visibleBars: 40, aggregate: 2 },
  { label: '4h',  range: '1y',  interval: '1h',  refreshMs: 0, visibleBars: 40, aggregate: 4 },
];

const RANGE_TIMEFRAMES = [
  { label: 'D',   range: '10y', interval: '1d',  refreshMs: 0, visibleBars: 120, prepost: false },
  { label: 'W',   range: '10y', interval: '1wk', refreshMs: 0, visibleBars: 80, prepost: false },
  { label: '1M',  range: 'max', interval: '1mo', refreshMs: 0, visibleBars: 80, prepost: false },
  { label: 'YTD', range: 'ytd', interval: '1d',  refreshMs: 0, visibleBars: 120, prepost: false },
  { label: '1Y',  range: '1y',  interval: '1d',  refreshMs: 0, visibleBars: 120, prepost: false },
  { label: '5Y',  range: '5y',  interval: '1wk', refreshMs: 0, visibleBars: 80, prepost: false },
  { label: 'Max', range: 'max', interval: '1mo', refreshMs: 0, visibleBars: 80, prepost: false },
];

const INTERVAL_SECONDS = {
  '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600,
};

function aggregateCandles(data, factor) {
  if (factor <= 1 || data.length === 0) return data;
  const result = [];
  for (let i = 0; i < data.length; i += factor) {
    const chunk = data.slice(i, Math.min(i + factor, data.length));
    result.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + (c.volume || 0), 0),
    });
  }
  return result;
}

function toHeikinAshi(data) {
  if (!data || data.length === 0) return [];
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const prev = result[i - 1] || { open: data[0].open, close: data[0].close };
    const haClose = (data[i].open + data[i].high + data[i].low + data[i].close) / 4;
    const haOpen = (prev.open + prev.close) / 2;
    result.push({
      time: data[i].time,
      open: haOpen, high: Math.max(data[i].high, haOpen, haClose),
      low: Math.min(data[i].low, haOpen, haClose), close: haClose,
      volume: data[i].volume,
    });
  }
  return result;
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ['#787b86', '#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#787b86'];

const FONT = "'SF Mono', 'Fira Code', 'Consolas', monospace";

function getChartThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    bg: isDark ? '#0a0a0f' : '#ffffff',
    grid: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)',
    text: isDark ? '#555' : '#aaa',
    crosshair: isDark ? 'rgba(0, 229, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)',
    crosshairLabel: isDark ? '#1a1a28' : '#e0e0e8',
    border: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    brandedBg: isDark ? '#12121a' : '#f0f0f5',
    brandedText: isDark ? '#e0e0e0' : '#1a1a2e',
    brandedDim: isDark ? '#888' : '#666',
  };
}

// Stats panel helpers
function fmtStatPrice(v) { return v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'; }
function fmtStatNum(v) { return v != null ? v.toFixed(2) : '--'; }
function fmtStatVol(v) {
  if (v == null) return '--';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString();
}
function fmtStatCap(v) {
  if (v == null) return '--';
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  return '$' + v.toLocaleString();
}

function StatsRow({ label, value, color, highlight }) {
  let valueClass = 'stats-value';
  if (color === 'green') valueClass += ' stats-green';
  else if (color === 'red') valueClass += ' stats-red';
  if (highlight) valueClass += ' stats-highlight';
  return (
    <div className="stats-row">
      <span className="stats-label">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function makeChartOptions(container, opts = {}) {
  const tc = getChartThemeColors();
  return {
    width: container.clientWidth,
    height: opts.height || container.clientHeight,
    layout: {
      background: { type: ColorType.Solid, color: tc.bg },
      textColor: tc.text,
      fontFamily: FONT,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: tc.grid },
      horzLines: { color: tc.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: tc.crosshair, width: 1, style: 2, labelBackgroundColor: tc.crosshairLabel },
      horzLine: { color: tc.crosshair, width: 1, style: 2, labelBackgroundColor: tc.crosshairLabel },
    },
    localization: {
      timeFormatter: (time) => {
        const d = new Date(time * 1000);
        if (opts.timeVisible) {
          return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
      },
    },
    timeScale: {
      borderColor: tc.border,
      timeVisible: opts.timeVisible ?? false,
      secondsVisible: false,
      visible: opts.timeScaleVisible ?? true,
      barSpacing: 9,
      minBarSpacing: 2,
    },
    rightPriceScale: {
      borderColor: tc.border,
      scaleMargins: opts.scaleMargins || { top: 0.08, bottom: 0.25 },
      autoScale: true,
    },
    handleScroll: opts.handleScroll ?? { vertTouchDrag: true },
    handleScale: opts.handleScale ?? {
      axisPressedMouseMove: { price: true, time: true },
      axisDoubleClickReset: { price: true, time: true },
      mouseWheel: true,
      pinch: true,
    },
  };
}

function hideWatermark(container) {
  requestAnimationFrame(() => {
    const el = container.querySelector('a[href*="tradingview"]');
    if (el) el.style.cssText = 'position:absolute !important; left:8px !important; right:auto !important; bottom:4px !important; top:auto !important; opacity:0.12 !important; font-size:9px !important; z-index:1 !important;';
  });
}

const TF_STORAGE_KEY = 'stock-scanner-timeframes';

function loadTimeframe(symbol) {
  try {
    const map = JSON.parse(localStorage.getItem(TF_STORAGE_KEY)) || {};
    return map[symbol] || null;
  } catch { return null; }
}

function saveTimeframe(symbol, minuteIdx, rangeIdx) {
  try {
    const map = JSON.parse(localStorage.getItem(TF_STORAGE_KEY)) || {};
    map[symbol] = { minuteIdx, rangeIdx };
    // Keep map from growing unbounded — trim to last 50 symbols
    const keys = Object.keys(map);
    if (keys.length > 50) delete map[keys[0]];
    localStorage.setItem(TF_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function timeAgo(unixTimestamp) {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function ExpandedChart({ stock, onClose, isFavorite, onToggleFavorite, compact = false, newsArticles = [], alerts = [], onAddAlert, onRemoveAlert, theme, note, onSetNote }) {
  const { session } = useAuth();
  const mainContainerRef = useRef(null);
  const rsiContainerRef = useRef(null);
  const macdContainerRef = useRef(null);

  const mainChartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const ema9Ref = useRef(null);
  const ema21Ref = useRef(null);
  const vwapRef = useRef(null);
  const spacerRef = useRef(null);

  const rsiChartRef = useRef(null);
  const rsiSeriesRef = useRef(null);

  const macdChartRef = useRef(null);
  const macdLineRef = useRef(null);
  const macdSignalRef = useRef(null);
  const macdHistRef = useRef(null);

  const fittedTfRef = useRef(null);
  const sessionRef = useRef(null);
  const rsiSessionRef = useRef(null);
  const macdSessionRef = useRef(null);
  const syncingRef = useRef(false);

  const [crosshairData, setCrosshairData] = useState(null);
  const [crosshairPoint, setCrosshairPoint] = useState(null);
  const [minuteIdx, setMinuteIdx] = useState(() => {
    if (!session) return 0;
    const saved = loadTimeframe(stock.symbol);
    if (saved && saved.minuteIdx != null) return saved.minuteIdx;
    return 0;
  });
  const [rangeIdx, setRangeIdx] = useState(() => {
    if (!session) return null;
    const saved = loadTimeframe(stock.symbol);
    if (saved && saved.rangeIdx != null) return saved.rangeIdx;
    return null;
  });
  const [indicators, setIndicators] = useState({ ema: false, vwap: false, rsi: false, macd: false });
  const [chartType, setChartType] = useState('candle');
  const [chartVersion, setChartVersion] = useState(0);
  const [activePanel, setActivePanel] = useState(null);
  const panelRef = useRef(null);
  const [showNews, setShowNews] = useState(false);
  const hasNews = newsArticles.length > 0;
  const effectiveIndicators = compact ? { ema: false, vwap: false, rsi: false, macd: false } : indicators;

  // Screenshot / snip state
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [snipMode, setSnipMode] = useState(false);
  const [snipRect, setSnipRect] = useState(null);
  const snipStartRef = useRef(null);

  // Price alerts state
  const [showAlertInput, setShowAlertInput] = useState(false);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertDirection, setAlertDirection] = useState('above');

  // Stock notes
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState(note?.text || '');

  useScrollLock(showNoteInput);

  // Key statistics panel
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!showStats || stats) return;
    let cancelled = false;
    setStatsLoading(true);
    fetch(`/api/stats/${encodeURIComponent(stock.symbol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setStats(d); setStatsLoading(false); } })
      .catch(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [showStats, stock.symbol, stats]);

  // Smart Money panel
  const [showSmartMoney, setShowSmartMoney] = useState(false);
  const [smartMoneyData, setSmartMoneyData] = useState(null);
  const [smartMoneyLoading, setSmartMoneyLoading] = useState(false);
  const [smartMoneySections, setSmartMoneySections] = useState({ insider: true, options: true, short: true });

  useEffect(() => {
    if (!showSmartMoney || smartMoneyData) return;
    let cancelled = false;
    setSmartMoneyLoading(true);
    const sym = encodeURIComponent(stock.symbol);
    Promise.all([
      fetch(`/api/insider-trading/${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/options-flow/${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/short-interest/${sym}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([insider, options, short]) => {
      if (!cancelled) {
        setSmartMoneyData({ insider, options, short });
        setSmartMoneyLoading(false);
      }
    }).catch(() => { if (!cancelled) setSmartMoneyLoading(false); });
    return () => { cancelled = true; };
  }, [showSmartMoney, stock.symbol, smartMoneyData]);

  // Drawing tools state
  const [drawMode, setDrawMode] = useState('none');
  const [drawings, setDrawings] = useState([]);
  const [drawClickCount, setDrawClickCount] = useState(0);
  const trendStartRef = useRef(null);
  const drawModeRef = useRef('none');
  const measureRef = useRef(null);

  // Compare overlay state
  const [compareSymbol, setCompareSymbol] = useState(null);
  const [compareQuery, setCompareQuery] = useState('');
  const [compareData, setCompareData] = useState(null);
  const compareSeriesRef = useRef(null);
  const [compareSuggestions, setCompareSuggestions] = useState([]);
  const [compareActiveIdx, setCompareActiveIdx] = useState(-1);
  const compareDebounceRef = useRef(null);
  const compareAbortRef = useRef(null);
  const compareWrapperRef = useRef(null);

  const isCrypto = stock.symbol.endsWith('-USD') || stock.symbol.endsWith('=X');
  const minuteTfs = isCrypto ? CRYPTO_MINUTE_TIMEFRAMES : MINUTE_TIMEFRAMES;
  const activeTf = minuteIdx !== null ? minuteTfs[minuteIdx] : RANGE_TIMEFRAMES[rangeIdx];
  const refreshMs = activeTf.refreshMs * CHART_REFRESH_FACTOR;
  const prepost = isCrypto ? false : activeTf.prepost !== false;
  const { data, loading } = useChartData(stock.symbol, activeTf.range, activeTf.interval, refreshMs, prepost);
  const isIntraday = ['1m', '2m', '5m', '15m', '30m', '1h'].includes(activeTf.interval);
  const showSessions = isIntraday && !isCrypto;

  // Derive live price from latest candle
  const previousClose = stock.change != null ? stock.price - stock.change : null;
  const livePrice = data && data.length > 0 ? data[data.length - 1].close : stock.price;
  const liveChange = previousClose != null ? livePrice - previousClose : stock.change;
  const liveChangePercent = previousClose != null && previousClose !== 0
    ? (liveChange / previousClose) * 100
    : stock.changePercent;
  const isPositive = liveChangePercent >= 0;
  const animatedPrice = useAnimatedNumber(livePrice);
  const animatedPercent = useAnimatedNumber(liveChangePercent);
  const animatedChange = useAnimatedNumber(liveChange ?? 0);

  const selectMinute = (i) => { setMinuteIdx(i); setRangeIdx(null); fittedTfRef.current = null; if (session) saveTimeframe(stock.symbol, i, null); };
  const selectRange = (i) => { setRangeIdx(i); setMinuteIdx(null); fittedTfRef.current = null; if (session) saveTimeframe(stock.symbol, null, i); };
  const toggleIndicator = (key) => setIndicators(prev => ({ ...prev, [key]: !prev[key] }));

  // Sync time scales: main -> sub-charts
  const syncFromMain = useCallback((range) => {
    if (syncingRef.current || !range) return;
    syncingRef.current = true;
    if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
    if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range);
    syncingRef.current = false;
  }, []);

  const syncToMain = useCallback((range) => {
    if (syncingRef.current || !range || !mainChartRef.current) return;
    syncingRef.current = true;
    mainChartRef.current.timeScale().setVisibleLogicalRange(range);
    if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
    if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range);
    syncingRef.current = false;
  }, []);

  // ── Main chart creation ──
  useEffect(() => {
    if (!mainContainerRef.current) return;
    const container = mainContainerRef.current;

    const chart = createChart(container, makeChartOptions(container, {
      timeVisible: isIntraday,
      timeScaleVisible: !effectiveIndicators.rsi && !effectiveIndicators.macd,
      scaleMargins: { top: 0.08, bottom: 0.25 },
    }));

    let mainSeries;
    if (chartType === 'line') {
      mainSeries = chart.addLineSeries({ color: '#00d66b', lineWidth: 2, priceLineVisible: true, lastValueVisible: true });
    } else if (chartType === 'area') {
      mainSeries = chart.addAreaSeries({ lineColor: '#00e5ff', topColor: 'rgba(0,229,255,0.25)', bottomColor: 'rgba(0,229,255,0.02)', lineWidth: 2, priceLineVisible: true, lastValueVisible: true, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: '#00e5ff', crosshairMarkerBackgroundColor: 'rgba(0,229,255,0.3)' });
    } else if (chartType === 'bar') {
      mainSeries = chart.addBarSeries({ upColor: '#00d66b', downColor: '#ff2952', thinBars: false });
    } else {
      mainSeries = chart.addCustomSeries(new RoundedCandleSeries(), {
        upColor: '#00d66b', downColor: '#ff2952', radius: 2.5,
        priceLineVisible: true, lastValueVisible: true,
      });
    }
    candleSeriesRef.current = mainSeries;

    const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, drawTicks: false, borderVisible: false });
    volumeSeriesRef.current = volumeSeries;

    // EMA overlay series
    const ema9 = chart.addLineSeries({ color: '#f5c842', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ema21 = chart.addLineSeries({ color: '#7b68ee', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema9Ref.current = ema9;
    ema21Ref.current = ema21;

    // VWAP overlay series
    const vwapLine = chart.addLineSeries({ color: '#ff6d00', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    vwapRef.current = vwapLine;

    // Invisible spacer series — extends the time axis into future session zones
    const spacer = chart.addLineSeries({ color: 'transparent', lineWidth: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    spacerRef.current = spacer;

    // Session highlighting for extended hours (intraday stocks only, not crypto)
    if (showSessions) {
      const sh = new SessionHighlighter();
      mainSeries.attachPrimitive(sh);
      sessionRef.current = sh;
    } else {
      sessionRef.current = null;
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) { setCrosshairData(null); setCrosshairPoint(null); return; }
      if (param.point) {
        setCrosshairPoint({ x: param.point.x, y: param.point.y });
      }
      const d = param.seriesData.get(candleSeriesRef.current);
      const vol = param.seriesData.get(volumeSeriesRef.current);
      if (d) {
        // Line/Area series return { time, value }, OHLC series return { open, high, low, close }
        if (d.open != null) {
          setCrosshairData({
            open: d.open, high: d.high, low: d.low, close: d.close,
            volume: vol?.value || 0, isUp: d.close >= d.open,
          });
        } else if (d.value != null) {
          setCrosshairData({
            open: d.value, high: d.value, low: d.value, close: d.value,
            volume: vol?.value || 0, isUp: true,
          });
        }
      }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(syncFromMain);
    mainChartRef.current = chart;
    setChartVersion(v => v + 1);
    hideWatermark(container);

    const handleResize = () => {
      if (container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    };
    window.addEventListener('resize', handleResize);

    // Custom price axis pinch handler for mobile
    const pinchState = { active: false, initialDist: 0, initialTop: 0.08, initialBottom: 0.25 };
    const priceAxisWidth = 60;

    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      const rect = container.getBoundingClientRect();
      const axisX = rect.right - priceAxisWidth;
      // Both fingers must be on the price axis area
      if (e.touches[0].clientX < axisX || e.touches[1].clientX < axisX) return;
      pinchState.active = true;
      pinchState.initialDist = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
      const opts = chart.priceScale('right').options();
      pinchState.initialTop = opts.scaleMargins?.top ?? 0.08;
      pinchState.initialBottom = opts.scaleMargins?.bottom ?? 0.25;
      e.stopPropagation();
    };

    const onTouchMove = (e) => {
      if (!pinchState.active || e.touches.length !== 2) return;
      const currentDist = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
      if (pinchState.initialDist < 5) return;
      // Spread fingers apart = zoom in (candles taller) = smaller margins
      // Squeeze fingers = zoom out (candles shorter) = larger margins
      const scale = pinchState.initialDist / currentDist;
      const newTop = Math.max(0.01, Math.min(0.45, pinchState.initialTop * scale));
      const newBottom = Math.max(0.01, Math.min(0.45, pinchState.initialBottom * scale));
      chart.priceScale('right').applyOptions({
        autoScale: false,
        scaleMargins: { top: newTop, bottom: newBottom },
      });
      e.stopPropagation();
      e.preventDefault();
    };

    const onTouchEnd = () => { pinchState.active = false; };

    container.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    container.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    container.addEventListener('touchend', onTouchEnd, { capture: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart, { capture: true });
      container.removeEventListener('touchmove', onTouchMove, { capture: true });
      container.removeEventListener('touchend', onTouchEnd, { capture: true });
      window.removeEventListener('resize', handleResize);
      chart.remove();
      mainChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9Ref.current = null;
      ema21Ref.current = null;
      vwapRef.current = null;
      spacerRef.current = null;
      sessionRef.current = null;
    };
  }, [showSessions, isIntraday, effectiveIndicators.rsi, effectiveIndicators.macd, syncFromMain, chartType, theme]);

  // ── RSI sub-chart ──
  useEffect(() => {
    if (!effectiveIndicators.rsi || !rsiContainerRef.current) {
      if (rsiChartRef.current) { rsiChartRef.current.remove(); rsiChartRef.current = null; rsiSeriesRef.current = null; }
      return;
    }
    const container = rsiContainerRef.current;
    const chart = createChart(container, makeChartOptions(container, {
      height: container.clientHeight,
      timeVisible: isIntraday,
      timeScaleVisible: !effectiveIndicators.macd,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      handleScroll: { vertTouchDrag: false },
    }));

    const rsiLine = chart.addLineSeries({ color: '#9c27b0', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    rsiSeriesRef.current = rsiLine;

    // Session highlighting (stocks only, not crypto)
    if (showSessions) {
      const sh = new SessionHighlighter();
      rsiLine.attachPrimitive(sh);
      rsiSessionRef.current = sh;
    } else {
      rsiSessionRef.current = null;
    }

    // Overbought/oversold markers
    const ob = chart.addLineSeries({ color: 'rgba(255,255,255,0.08)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const os = chart.addLineSeries({ color: 'rgba(255,255,255,0.08)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    // We'll set data for ob/os markers when data arrives
    rsiLine._obLine = ob;
    rsiLine._osLine = os;

    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncToMain);
    rsiChartRef.current = chart;
    hideWatermark(container);

    const handleResize = () => { if (container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }); };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
      rsiSessionRef.current = null;
    };
  }, [effectiveIndicators.rsi, effectiveIndicators.macd, isIntraday, syncToMain]);

  // ── MACD sub-chart ──
  useEffect(() => {
    if (!effectiveIndicators.macd || !macdContainerRef.current) {
      if (macdChartRef.current) { macdChartRef.current.remove(); macdChartRef.current = null; }
      return;
    }
    const container = macdContainerRef.current;
    const chart = createChart(container, makeChartOptions(container, {
      height: container.clientHeight,
      timeVisible: isIntraday,
      timeScaleVisible: true,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    }));

    const macdLine = chart.addLineSeries({ color: '#2962ff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    const signalLine = chart.addLineSeries({ color: '#ff6d00', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    const histSeries = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });

    macdLineRef.current = macdLine;
    macdSignalRef.current = signalLine;
    macdHistRef.current = histSeries;

    // Session highlighting (stocks only, not crypto)
    if (showSessions) {
      const sh = new SessionHighlighter();
      macdLine.attachPrimitive(sh);
      macdSessionRef.current = sh;
    } else {
      macdSessionRef.current = null;
    }

    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncToMain);
    macdChartRef.current = chart;
    hideWatermark(container);

    const handleResize = () => { if (container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }); };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      macdChartRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
      macdSessionRef.current = null;
    };
  }, [effectiveIndicators.macd, isIntraday, syncToMain]);

  // ── Update all series data ──
  useEffect(() => {
    if (!data || data.length === 0) return;

    // Aggregate candles for 2h/4h timeframes (Yahoo only provides 1h)
    const chartData = aggregateCandles(data, activeTf.aggregate || 1);

    // Main chart data — format depends on chart type
    if (candleSeriesRef.current) {
      if (chartType === 'line' || chartType === 'area') {
        candleSeriesRef.current.setData(chartData.map(d => ({ time: d.time, value: d.close })));
      } else if (chartType === 'heikinAshi') {
        candleSeriesRef.current.setData(toHeikinAshi(chartData));
      } else {
        candleSeriesRef.current.setData(chartData);
      }
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(chartData.map(d => ({
        time: d.time, value: d.volume || 0,
        color: d.close >= d.open ? 'rgba(0,200,83,0.15)' : 'rgba(255,23,68,0.15)',
      })));
    }

    // EMA overlays
    if (ema9Ref.current) ema9Ref.current.setData(effectiveIndicators.ema ? calcEMA(chartData, 9) : []);
    if (ema21Ref.current) ema21Ref.current.setData(effectiveIndicators.ema ? calcEMA(chartData, 21) : []);

    // VWAP overlay
    if (vwapRef.current) vwapRef.current.setData(effectiveIndicators.vwap ? calcVWAP(chartData) : []);

    // RSI sub-chart
    if (effectiveIndicators.rsi && rsiSeriesRef.current) {
      const rsiData = calcRSI(chartData, 14);
      rsiSeriesRef.current.setData(rsiData);
      // Overbought/oversold horizontal lines
      if (rsiData.length > 0 && rsiSeriesRef.current._obLine) {
        const times = rsiData.map(d => d.time);
        rsiSeriesRef.current._obLine.setData(times.map(t => ({ time: t, value: 70 })));
        rsiSeriesRef.current._osLine.setData(times.map(t => ({ time: t, value: 30 })));
      }
    }

    // MACD sub-chart
    if (effectiveIndicators.macd && macdLineRef.current) {
      const { macd, signal, histogram } = calcMACD(chartData);
      macdLineRef.current.setData(macd);
      macdSignalRef.current.setData(signal);
      macdHistRef.current.setData(histogram);
    }

    // Forward-looking session projection (minute stock charts only, not crypto/range)
    const intervalSec = INTERVAL_SECONDS[activeTf.interval];
    const isMinuteTf = minuteIdx !== null;
    if (intervalSec && spacerRef.current && isMinuteTf && !isCrypto) {
      const lastTime = chartData[chartData.length - 1].time;
      const forwardTimes = projectForwardTimestamps(lastTime, intervalSec);
      spacerRef.current.setData(forwardTimes.map(t => ({ time: t })));
    } else if (spacerRef.current) {
      spacerRef.current.setData([]);
    }

    // Update session highlight zones (minute stock charts only, not crypto)
    if (isMinuteTf && !isCrypto) {
      const extendedData = intervalSec
        ? [...chartData, ...projectForwardTimestamps(chartData[chartData.length - 1].time, intervalSec).map(t => ({ time: t }))]
        : chartData;
      sessionRef.current?.setData(extendedData);
      rsiSessionRef.current?.setData(chartData);
      macdSessionRef.current?.setData(chartData);
    } else {
      sessionRef.current?.setData([]);
      rsiSessionRef.current?.setData([]);
      macdSessionRef.current?.setData([]);
    }

    // Focus on recent bars when timeframe changes (scroll left for history)
    // Use stock+timeframe as key so each new stock also resets the view
    const tfKey = `${stock.symbol}:${activeTf.label}`;
    if (tfKey !== fittedTfRef.current && mainChartRef.current) {
      // Reset price scale to consistent margins for every chart
      mainChartRef.current.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.25 },
      });

      const visibleBars = activeTf.visibleBars;
      if (visibleBars && chartData.length > visibleBars) {
        const from = chartData.length - visibleBars;
        const to = chartData.length + 20;
        mainChartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange({ from, to });
      } else {
        mainChartRef.current.timeScale().fitContent();
      }
      fittedTfRef.current = tfKey;
    }
  }, [data, effectiveIndicators, activeTf.interval, minuteIdx, stock.symbol, chartType]);

  // Keep drawMode ref in sync for click handler
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);

  // Cancel current drawing in progress (cleans up SVG overlay + native event listeners)
  const cancelDraw = useCallback(() => {
    if (trendStartRef.current) {
      const s = trendStartRef.current;
      const container = mainContainerRef.current;
      if (container && s.mouseHandler) container.removeEventListener('mousemove', s.mouseHandler);
      if (container && s.touchHandler) container.removeEventListener('touchmove', s.touchHandler);
      if (s.svg && s.svg.parentNode) s.svg.parentNode.removeChild(s.svg);
    }
    if (measureRef.current) measureRef.current.textContent = '';
    trendStartRef.current = null;
    setDrawClickCount(0);
    setDrawMode('none');
  }, []);

  // Store chart data in ref so drawing click handler can access it
  const chartDataRef = useRef([]);
  useEffect(() => {
    if (data && data.length > 0) {
      const agg = aggregateCandles(data, activeTf.aggregate || 1);
      chartDataRef.current = agg;
    }
  }, [data, activeTf.aggregate]);

  // Drawing tools click handler — uses chartVersion to re-subscribe when chart is recreated
  useEffect(() => {
    const chart = mainChartRef.current;
    const candle = candleSeriesRef.current;
    if (!chart || !candle || compact) return;

    const handler = (param) => {
      if (!param.point || drawModeRef.current === 'none') return;
      const price = candle.coordinateToPrice(param.point.y);
      if (price == null || !isFinite(price)) return;

      // For multi-click tools, we need a valid time coordinate.
      // param.time can be undefined if click is between data points.
      // Fall back to nearest data point time via logical index.
      const needsTime = ['trendline', 'ray', 'fib'].includes(drawModeRef.current);
      let clickTime = param.time;
      if (!clickTime && needsTime) {
        const logical = param.logical;
        if (logical != null) {
          const d = chartDataRef.current;
          const idx = Math.max(0, Math.min(Math.round(logical), d.length - 1));
          if (d[idx]) clickTime = d[idx].time;
        }
      }
      if (needsTime && !clickTime) return;

      if (drawModeRef.current === 'hline') {
        const line = candle.createPriceLine({
          price, color: '#ffeb3b', lineWidth: 1, lineStyle: 2,
          axisLabelVisible: true, title: '',
        });
        setDrawings(prev => [...prev, { type: 'hline', price, ref: line }]);
        setDrawClickCount(0);
        setDrawMode('none');

      // ── All 2-click tools: shared first-click with live preview ──
      } else if (['trendline', 'ray', 'fib'].includes(drawModeRef.current)) {
        if (!trendStartRef.current) {
          // First click — create SVG overlay for live preview (zero LWC overhead)
          const container = mainContainerRef.current;
          if (!container) return;
          const mode = drawModeRef.current;
          const color = mode === 'ray' ? '#42a5f5' : '#ffeb3b';

          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible;';
          const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          svgLine.setAttribute('stroke', color);
          svgLine.setAttribute('stroke-width', '1.5');
          svgLine.setAttribute('stroke-dasharray', '6,3');
          const svgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          svgCircle.setAttribute('r', '4');
          svgCircle.setAttribute('fill', color);
          svgCircle.setAttribute('opacity', '0.8');
          const svgCircle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          svgCircle2.setAttribute('r', '3');
          svgCircle2.setAttribute('fill', color);
          svgCircle2.setAttribute('opacity', '0.5');
          svg.appendChild(svgLine);
          svg.appendChild(svgCircle);
          svg.appendChild(svgCircle2);
          container.appendChild(svg);

          const startTime = clickTime;
          const startPrice = price;

          const updatePreview = (clientX, clientY) => {
            const rect = container.getBoundingClientRect();
            const x2 = clientX - rect.left;
            const y2 = clientY - rect.top;
            // Recalculate start pixel from chart coords (handles scroll/zoom)
            const x1 = chart.timeScale().timeToCoordinate(startTime);
            const y1 = candle.priceToCoordinate(startPrice);
            if (x1 == null || y1 == null) return;

            svgLine.setAttribute('x1', x1);
            svgLine.setAttribute('y1', y1);
            svgLine.setAttribute('x2', x2);
            svgLine.setAttribute('y2', y2);
            svgCircle.setAttribute('cx', x1);
            svgCircle.setAttribute('cy', y1);
            svgCircle2.setAttribute('cx', x2);
            svgCircle2.setAttribute('cy', y2);

            // Measurement data shown in badge
            const curPrice = candle.coordinateToPrice(y2);
            if (curPrice != null && isFinite(curPrice) && measureRef.current) {
              const diff = curPrice - startPrice;
              const pct = (diff / startPrice) * 100;
              measureRef.current.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% ($${diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)})`;
            }
          };

          const mouseHandler = (e) => updatePreview(e.clientX, e.clientY);
          const touchHandler = (e) => {
            if (e.touches.length === 1) updatePreview(e.touches[0].clientX, e.touches[0].clientY);
          };
          container.addEventListener('mousemove', mouseHandler);
          container.addEventListener('touchmove', touchHandler, { passive: true });

          trendStartRef.current = { time: clickTime, price, svg, mouseHandler, touchHandler };
          setDrawClickCount(1);

        } else {
          // ── Second click — finalize the drawing ──
          const start = trendStartRef.current;
          // Remove the SVG preview overlay + native event listeners
          const container = mainContainerRef.current;
          if (container && start.mouseHandler) container.removeEventListener('mousemove', start.mouseHandler);
          if (container && start.touchHandler) container.removeEventListener('touchmove', start.touchHandler);
          if (start.svg && start.svg.parentNode) start.svg.parentNode.removeChild(start.svg);
          if (measureRef.current) measureRef.current.textContent = '';

          const mode = drawModeRef.current;

          if (mode === 'fib') {
            const high = Math.max(start.price, price);
            const low = Math.min(start.price, price);
            const diff = high - low;
            const fibLines = FIB_LEVELS.map((level, i) => {
              const fibPrice = high - diff * level;
              return candle.createPriceLine({
                price: fibPrice, color: FIB_COLORS[i], lineWidth: 1, lineStyle: 2,
                axisLabelVisible: true, title: `${(level * 100).toFixed(1)}%`,
              });
            });
            setDrawings(prev => [...prev, { type: 'fib', refs: fibLines }]);
          } else {
            // Trendline or Ray
            const isRay = mode === 'ray';
            let p1 = { time: start.time, price: start.price };
            let p2 = { time: clickTime, price };
            if (p2.time < p1.time) { const tmp = p1; p1 = p2; p2 = tmp; }

            if (p2.time <= p1.time) {
              // Same-time click — can't draw (LWC requires unique timestamps)
              trendStartRef.current = null;
              setDrawClickCount(0);
              setDrawMode('none');
              return;
            }

            const color = isRay ? '#42a5f5' : '#ffeb3b';
            const trendSeries = chart.addLineSeries({
              color, lineWidth: isRay ? 2 : 1,
              lineStyle: isRay ? 0 : 2,
              priceLineVisible: false, lastValueVisible: false,
              crosshairMarkerVisible: false,
            });

            if (isRay) {
              const slope = (p2.price - p1.price) / (p2.time - p1.time);

              // Extend ray along ACTUAL chart timestamps to avoid vertical
              // artifacts in session gaps (overnight, weekends).  Using a
              // synthetic far-future timestamp caused LWC to draw a vertical
              // line when the timestamp landed in a gap.
              const allData = chartDataRef.current;
              const points = [
                { time: p1.time, value: p1.price },
                { time: p2.time, value: p2.price },
              ];
              for (const candle of allData) {
                if (candle.time > p2.time) {
                  points.push({ time: candle.time, value: p2.price + slope * (candle.time - p2.time) });
                }
              }

              trendSeries.setData(points);
              try { trendSeries.applyOptions({ autoscaleInfoProvider: () => null }); } catch {}
              setDrawings(prev => [...prev, { type: 'ray', series: trendSeries }]);
            } else {
              // Trendline — just two points
              trendSeries.setData([
                { time: p1.time, value: p1.price },
                { time: p2.time, value: p2.price },
              ]);
              setDrawings(prev => [...prev, { type: 'trend', series: trendSeries }]);
            }

            // Set markers AFTER setData so they actually render
            trendSeries.setMarkers([
              { time: p1.time, position: 'inBar', color, shape: 'circle', size: 0.5 },
              { time: p2.time, position: 'inBar', color, shape: 'circle', size: 0.5 },
            ]);
          }
          trendStartRef.current = null;
          setDrawClickCount(0);
          setDrawMode('none');
        }
      }
    };

    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [chartVersion, compact]);

  // Clear drawings helper
  const clearDrawings = useCallback(() => {
    // Clean up any in-progress drawing first
    cancelDraw();
    for (const d of drawings) {
      if (d.type === 'hline' && d.ref && candleSeriesRef.current) {
        try { candleSeriesRef.current.removePriceLine(d.ref); } catch {}
      }
      if ((d.type === 'trend' || d.type === 'ray') && d.series && mainChartRef.current) {
        if (d.unsub) try { d.unsub(); } catch {}
        try { mainChartRef.current.removeSeries(d.series); } catch {}
      }
      if (d.type === 'fib' && d.refs && candleSeriesRef.current) {
        for (const line of d.refs) {
          try { candleSeriesRef.current.removePriceLine(line); } catch {}
        }
      }
    }
    setDrawings([]);
  }, [drawings, cancelDraw]);

  // Screenshot handler
  // Snip mode handlers
  const getPointerPos = (e) => {
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { clientX, clientY };
  };

  const handleSnipStart = useCallback((e) => {
    e.preventDefault();
    const { clientX, clientY } = getPointerPos(e);
    const rect = mainContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    snipStartRef.current = { x, y };
    setSnipRect({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  const handleSnipMove = useCallback((e) => {
    if (!snipStartRef.current) return;
    e.preventDefault();
    const { clientX, clientY } = getPointerPos(e);
    const rect = mainContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    setSnipRect(prev => prev ? { ...prev, endX: x, endY: y } : null);
  }, []);

  const handleSnipEnd = useCallback(async () => {
    if (!snipStartRef.current || !snipRect) {
      snipStartRef.current = null;
      setSnipMode(false);
      setSnipRect(null);
      return;
    }

    const chart = mainChartRef.current;
    const container = mainContainerRef.current;
    if (!chart || !container) return;

    const x1 = Math.min(snipRect.startX, snipRect.endX);
    const y1 = Math.min(snipRect.startY, snipRect.endY);
    const x2 = Math.max(snipRect.startX, snipRect.endX);
    const y2 = Math.max(snipRect.startY, snipRect.endY);
    const selW = x2 - x1;
    const selH = y2 - y1;

    if (selW < 10 || selH < 10) {
      snipStartRef.current = null;
      setSnipMode(false);
      setSnipRect(null);
      return;
    }

    try {
      const canvas = chart.takeScreenshot();
      const scaleX = canvas.width / container.offsetWidth;
      const scaleY = canvas.height / container.offsetHeight;

      const cropX = Math.round(x1 * scaleX);
      const cropY = Math.round(y1 * scaleY);
      const cropW = Math.round(selW * scaleX);
      const cropH = Math.round(selH * scaleY);

      const pad = 32;
      const cropped = document.createElement('canvas');
      cropped.width = cropW;
      cropped.height = cropH + pad;
      const ctx = cropped.getContext('2d');
      const tc = getChartThemeColors();

      ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      ctx.fillStyle = tc.brandedBg;
      ctx.fillRect(0, cropH, cropW, pad);
      ctx.fillStyle = tc.brandedText;
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${stock.symbol}  |  ${activeTf.label}`, 8, cropH + 21);
      ctx.fillStyle = tc.brandedDim;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('TickrPulse', cropW - 8, cropH + 21);

      try {
        const blob = await new Promise(resolve => cropped.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setSnapshotStatus('copied');
      } catch {
        const link = document.createElement('a');
        link.download = `${stock.symbol}-${activeTf.label}-${Date.now()}.png`;
        link.href = cropped.toDataURL('image/png');
        link.click();
        setSnapshotStatus('downloaded');
      }
      setTimeout(() => setSnapshotStatus(null), 2000);
    } catch {
      setSnapshotStatus(null);
    }

    snipStartRef.current = null;
    setSnipMode(false);
    setSnipRect(null);
  }, [snipRect, stock.symbol, activeTf]);

  // Escape cancels snip mode
  useEffect(() => {
    if (!snipMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        snipStartRef.current = null;
        setSnipMode(false);
        setSnipRect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snipMode]);

  // Compare search suggestions
  useEffect(() => {
    if (compareDebounceRef.current) clearTimeout(compareDebounceRef.current);
    if (!compareQuery.trim()) { setCompareSuggestions([]); return; }

    compareDebounceRef.current = setTimeout(async () => {
      if (compareAbortRef.current) compareAbortRef.current.abort();
      const controller = new AbortController();
      compareAbortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(compareQuery.trim())}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!controller.signal.aborted) {
          setCompareSuggestions(data.results || []);
          setCompareActiveIdx(-1);
        }
      } catch {}
    }, 150);

    return () => clearTimeout(compareDebounceRef.current);
  }, [compareQuery]);

  const selectCompare = useCallback((symbol) => {
    setCompareSymbol(symbol);
    setActivePanel(null);
    setCompareQuery('');
    setCompareSuggestions([]);
  }, []);

  // Close active panel on outside click
  useEffect(() => {
    if (!activePanel) return;
    const close = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setActivePanel(null);
        if (activePanel === 'compare') {
          setCompareQuery('');
          setCompareSuggestions([]);
        }
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchend', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchend', close);
    };
  }, [activePanel]);

  // Compare data fetching
  useEffect(() => {
    if (!compareSymbol) {
      setCompareData(null);
      return;
    }
    let cancelled = false;
    const fetchCompare = async () => {
      try {
        const params = new URLSearchParams({
          range: activeTf.range, interval: activeTf.interval, prepost: String(prepost),
        });
        const res = await fetch(`/api/chart/${encodeURIComponent(compareSymbol)}?${params}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setCompareData(json.data);
      } catch {}
    };
    fetchCompare();
    return () => { cancelled = true; };
  }, [compareSymbol, activeTf.range, activeTf.interval, prepost]);

  // Render compare overlay on the SAME 'right' price scale so both zoom identically.
  // Map compare prices so the latest point aligns with the main stock's latest price,
  // preserving the compare stock's relative movement shape.
  useEffect(() => {
    const chart = mainChartRef.current;
    if (!chart) return;

    // Remove old compare series
    if (compareSeriesRef.current) {
      try { chart.removeSeries(compareSeriesRef.current); } catch {}
      compareSeriesRef.current = null;
    }

    if (!compareData || compareData.length === 0 || !data || data.length === 0) return;

    const compLatest = compareData[compareData.length - 1].close;
    const mainLatest = data[data.length - 1].close;
    if (!compLatest || !mainLatest) return;

    const series = chart.addLineSeries({
      color: '#00bcd4', lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
      priceScaleId: 'right',
      crosshairMarkerVisible: true,
    });

    // Anchor: compare's latest value → main's latest price
    // Each point: mainLatest * (compareClose / compLatest)
    series.setData(compareData.map(d => ({
      time: d.time,
      value: mainLatest * (d.close / compLatest),
    })));
    compareSeriesRef.current = series;
  }, [compareData, data]);

  // Lock scroll when alert panel is open on mobile
  useScrollLock(showAlertInput && window.innerWidth <= 768);

  // Comprehensive keyboard handler (Esc + number keys for timeframes)
  useEffect(() => {
    const handleKey = (e) => {
      // Don't intercept when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') { onClose(); return; }
      // Number keys 1-8 switch minute timeframes
      const num = parseInt(e.key);
      if (num >= 1 && num <= minuteTfs.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
        selectMinute(num - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, minuteTfs.length]);

  const subChartCount = (effectiveIndicators.rsi ? 1 : 0) + (effectiveIndicators.macd ? 1 : 0);
  const mainFlex = subChartCount === 0 ? 1 : subChartCount === 1 ? 0.7 : 0.55;

  const modal = (
    <div className={`expanded-modal${compact ? ' compact' : ''}`} onClick={e => e.stopPropagation()}>
      <div className="expanded-header">
        <div className="expanded-header-left">
          <StockLogo symbol={stock.symbol} size={20} />
          <h2>{stock.symbol}</h2>
          {!compact && stock.name && <span className="expanded-header-name">{stock.name}</span>}
          <div className="expanded-header-actions">
          {onToggleFavorite && (
            <button
              className={`expanded-star${isFavorite ? ' starred' : ''}`}
              onClick={onToggleFavorite}
              aria-label={isFavorite ? `Remove ${stock.symbol} from favorites` : `Add ${stock.symbol} to favorites`}
            >
              {isFavorite ? '\u2605' : '\u2606'}
            </button>
          )}
          {hasNews && (
            <button
              className={`expanded-news-btn${showNews ? ' active' : ''}`}
              onClick={() => { setShowNews(prev => !prev); setShowStats(false); setShowSmartMoney(false); }}
              aria-label="Toggle news panel"
              title="News"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/>
                <line x1="10" y1="6" x2="18" y2="6"/><line x1="10" y1="10" x2="18" y2="10"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </button>
          )}
          {!compact && (
            <button
              className={`expanded-stats-btn${showStats ? ' active' : ''}`}
              onClick={() => { setShowStats(prev => !prev); setShowNews(false); setShowSmartMoney(false); }}
              aria-label="Toggle key statistics"
              title="Key Statistics"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
          )}
          {!compact && (
            <button
              className={`expanded-smartmoney-btn${showSmartMoney ? ' active' : ''}`}
              onClick={() => { setShowSmartMoney(prev => !prev); setShowStats(false); setShowNews(false); }}
              aria-label="Toggle smart money data"
              title="Smart Money"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
            </button>
          )}
          {!compact && onAddAlert && (
            <div className="alert-wrapper">
              <button
                className={`expanded-alert-btn${alerts.length > 0 ? ' has-alerts' : ''}`}
                onClick={() => { setShowAlertInput(prev => !prev); setAlertPrice(livePrice.toFixed(2)); }}
                title="Price alerts"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
                {alerts.length > 0 && <span className="alert-count">{alerts.length}</span>}
              </button>
              {showAlertInput && (
                <>
                  {createPortal(
                    <div className="alert-backdrop" onClick={() => setShowAlertInput(false)} />,
                    document.body
                  )}
                  <div className="alert-popover">
                    <div className="alert-popover-title">Set Price Alert</div>
                    <div className="alert-popover-row">
                      <select value={alertDirection} onChange={e => setAlertDirection(e.target.value)} className="alert-direction">
                        <option value="above">Above</option>
                        <option value="below">Below</option>
                      </select>
                      <input
                        type="number"
                        step="any"
                        className="alert-price-input"
                        value={alertPrice}
                        onChange={e => setAlertPrice(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const p = parseFloat(alertPrice);
                            if (p > 0) { onAddAlert(stock.symbol, p, alertDirection); setShowAlertInput(false); }
                          }
                        }}
                        autoFocus
                      />
                      <button className="alert-add-btn" onClick={() => {
                        const p = parseFloat(alertPrice);
                        if (p > 0) { onAddAlert(stock.symbol, p, alertDirection); setShowAlertInput(false); }
                      }}>Add</button>
                    </div>
                    {alerts.length > 0 && (
                      <div className="alert-list">
                        {alerts.map(a => (
                          <div key={a.id} className="alert-list-item">
                            <span>{a.direction === 'above' ? '\u2191' : '\u2193'} ${a.targetPrice.toFixed(2)}</span>
                            <button className="alert-remove" onClick={() => onRemoveAlert(a.id)}>&times;</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {!compact && onSetNote && (
            <div className="note-wrapper">
              <button
                className={`expanded-note-btn${note ? ' has-note' : ''}`}
                onClick={() => { setShowNoteInput(prev => { if (!prev) setNoteText(note?.text || ''); return !prev; }); }}
                title={note ? 'Edit note' : 'Add note'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={note ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
              {showNoteInput && createPortal(
                <div className="note-overlay" onClick={() => setShowNoteInput(false)}>
                  <div className="note-modal" onClick={e => e.stopPropagation()}>
                    <div className="stock-note-popover-header">
                      <span className="stock-note-popover-title">Note — {stock.symbol}</span>
                      <button className="stock-note-popover-close" onClick={() => setShowNoteInput(false)}>&times;</button>
                    </div>
                    <textarea
                      className="stock-note-textarea"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSetNote(noteText); setShowNoteInput(false); }
                        if (e.key === 'Escape') setShowNoteInput(false);
                      }}
                      placeholder="Add a note... (Enter to save)"
                      rows={3}
                      autoFocus
                    />
                    <div className="stock-note-actions">
                      {note && <button className="stock-note-delete" onClick={() => { onSetNote(''); setShowNoteInput(false); }}>Delete</button>}
                      <button className="stock-note-save" onClick={() => { onSetNote(noteText); setShowNoteInput(false); }}>Save</button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
          )}
          </div>
        </div>
        <div className="expanded-header-center">
          <span className={`expanded-header-price ${isPositive ? 'glow-up' : 'glow-down'}`}>{formatPrice(animatedPrice)}</span>
          <span className={`expanded-header-change ${isPositive ? 'change-up' : 'change-down'}`}>
            {isPositive ? '+' : ''}{animatedPercent.toFixed(2)}%
          </span>
          {!compact && liveChange != null && (
            <span className={`expanded-header-abs ${isPositive ? 'change-up' : 'change-down'}`}>
              ({isPositive ? '+' : ''}{formatPrice(animatedChange)})
            </span>
          )}
          {stock.extPrice != null && (
            <span className="expanded-header-ext">
              <span className="expanded-header-ext-label">{stock.extMarketState === 'pre' ? 'Pre' : 'AH'}</span>
              {formatPrice(stock.extPrice)}
              <span className={stock.extChangePercent >= 0 ? 'change-up' : 'change-down'}>
                {' '}{stock.extChangePercent >= 0 ? '+' : ''}{stock.extChangePercent.toFixed(2)}%
              </span>
            </span>
          )}
          {!compact && stock.volume != null && (
            <span className="expanded-header-volume">Vol {formatVolume(stock.volume)}</span>
          )}
        </div>
        <button className="expanded-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
        </button>
      </div>

      <div className="expanded-chart-area">
        <div className="chart-toolbar">
          {!compact && (
            <div className="chart-tooltip">
              <span className="tooltip-hint">Hover over chart for OHLCV</span>
            </div>
          )}
          <div className="timeframe-groups">
            <div className="timeframe-bar">
              {minuteTfs.map((t, i) => (
                <button key={t.label} className={`timeframe-btn${minuteIdx === i ? ' timeframe-active' : ''}`} onClick={() => selectMinute(i)}>{t.label}</button>
              ))}
            </div>
            <span className="timeframe-divider" />
            <div className="timeframe-bar">
              {RANGE_TIMEFRAMES.map((t, i) => (
                <button key={t.label} className={`timeframe-btn${rangeIdx === i && minuteIdx === null ? ' timeframe-active' : ''}`} onClick={() => selectRange(i)}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>

        {!compact && (
          <div className="chart-tools" ref={panelRef}>
            {/* Chart Type */}
            <div className="chart-tool-wrapper">
              <button
                className={`chart-tool-btn${activePanel === 'chartType' ? ' chart-tool-btn--open' : ''}`}
                onClick={() => setActivePanel(p => p === 'chartType' ? null : 'chartType')}
                title="Chart type"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <line x1="4.5" y1="1.5" x2="4.5" y2="14.5"/><rect x="2.5" y="4" width="4" height="7" rx="0.5" fill="currentColor" opacity="0.25" stroke="none"/><rect x="2.5" y="4" width="4" height="7" rx="0.5"/>
                  <line x1="11.5" y1="2.5" x2="11.5" y2="13.5"/><rect x="9.5" y="5.5" width="4" height="5" rx="0.5" fill="currentColor" opacity="0.25" stroke="none"/><rect x="9.5" y="5.5" width="4" height="5" rx="0.5"/>
                </svg>
              </button>
              {activePanel === 'chartType' && (
                <div className="chart-tool-panel">
                  <div className="chart-tool-panel-title">Chart Type</div>
                  {[
                    { key: 'candle', label: 'Candle' },
                    { key: 'line', label: 'Line' },
                    { key: 'area', label: 'Area' },
                    { key: 'bar', label: 'Bar (OHLC)' },
                    { key: 'heikinAshi', label: 'Heikin Ashi' },
                  ].map(t => (
                    <button
                      key={t.key}
                      className={`chart-tool-panel-item${chartType === t.key ? ' active' : ''}`}
                      onClick={() => { setChartType(t.key); setActivePanel(null); clearDrawings(); }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Indicators */}
            <div className="chart-tool-wrapper">
              <button
                className={`chart-tool-btn${activePanel === 'indicators' ? ' chart-tool-btn--open' : ''}${Object.values(indicators).some(Boolean) ? ' chart-tool-btn--active' : ''}`}
                onClick={() => setActivePanel(p => p === 'indicators' ? null : 'indicators')}
                title="Indicators"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1,11 4,7 7,10 10,3 13,8 15,5"/>
                </svg>
              </button>
              {activePanel === 'indicators' && (
                <div className="chart-tool-panel">
                  <div className="chart-tool-panel-title">Indicators</div>
                  {[
                    { key: 'ema', label: 'EMA 9/21', desc: 'Exponential Moving Average' },
                    { key: 'vwap', label: 'VWAP', desc: 'Volume Weighted Avg Price' },
                    { key: 'rsi', label: 'RSI 14', desc: 'Relative Strength Index' },
                    { key: 'macd', label: 'MACD', desc: 'Moving Avg Convergence' },
                  ].map(ind => (
                    <button
                      key={ind.key}
                      className={`chart-tool-panel-item${indicators[ind.key] ? ' active' : ''}`}
                      onClick={() => toggleIndicator(ind.key)}
                    >
                      <span className="chart-tool-panel-item-label">{ind.label}</span>
                      <span className="chart-tool-panel-item-desc">{ind.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Drawing Tools */}
            <div className="chart-tool-wrapper">
              <button
                className={`chart-tool-btn${activePanel === 'draw' ? ' chart-tool-btn--open' : ''}${drawings.length > 0 || drawMode !== 'none' ? ' chart-tool-btn--active' : ''}`}
                onClick={() => setActivePanel(p => p === 'draw' ? null : 'draw')}
                title="Drawing tools"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11.5 1.5l3 3-9 9H2.5v-3z"/>
                  <line x1="9" y1="4" x2="12" y2="7"/>
                </svg>
              </button>
              {activePanel === 'draw' && (
                <div className="chart-tool-panel">
                  <div className="chart-tool-panel-title">Drawing Tools</div>
                  {[
                    { key: 'hline', label: 'Horizontal Line', desc: 'Click to place' },
                    { key: 'trendline', label: 'Trendline', desc: 'Click 2 points' },
                    { key: 'ray', label: 'Ray', desc: 'Extends to the right' },
                    { key: 'fib', label: 'Fib Retracement', desc: 'Click high & low' },
                  ].map(tool => (
                    <button
                      key={tool.key}
                      className={`chart-tool-panel-item${drawMode === tool.key ? ' active' : ''}`}
                      onClick={() => { cancelDraw(); setDrawMode(m => m === tool.key ? 'none' : tool.key); setActivePanel(null); }}
                    >
                      <span className="chart-tool-panel-item-label">{tool.label}</span>
                      <span className="chart-tool-panel-item-desc">{tool.desc}</span>
                    </button>
                  ))}
                  {drawings.length > 0 && (
                    <>
                      <div className="chart-tool-panel-divider" />
                      <button className="chart-tool-panel-item danger" onClick={() => { clearDrawings(); setActivePanel(null); }}>
                        Clear All ({drawings.length})
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Compare */}
            <div className="chart-tool-wrapper">
              <button
                className={`chart-tool-btn chart-tool-btn--text${activePanel === 'compare' ? ' chart-tool-btn--open' : ''}${compareSymbol ? ' chart-tool-btn--active' : ''}`}
                onClick={() => setActivePanel(p => p === 'compare' ? null : 'compare')}
                title="Compare symbols"
              >
                VS
              </button>
              {activePanel === 'compare' && (
                <div className="chart-tool-panel chart-tool-panel--compare">
                  <div className="chart-tool-panel-title">Compare</div>
                  {compareSymbol ? (
                    <div className="chart-tool-compare-active">
                      <span>vs <b>{compareSymbol}</b></span>
                      <button onClick={() => { setCompareSymbol(null); setCompareData(null); setActivePanel(null); }}>&times;</button>
                    </div>
                  ) : (
                    <div className="chart-tool-compare-search" ref={compareWrapperRef}>
                      <input
                        className="chart-tool-compare-input"
                        placeholder="Search symbol..."
                        value={compareQuery}
                        onChange={e => setCompareQuery(e.target.value.toUpperCase())}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (compareActiveIdx >= 0 && compareSuggestions[compareActiveIdx]) {
                              selectCompare(compareSuggestions[compareActiveIdx].symbol);
                            } else if (compareQuery.trim()) {
                              selectCompare(compareQuery.trim());
                            }
                          }
                          if (e.key === 'Escape') { setActivePanel(null); setCompareQuery(''); setCompareSuggestions([]); }
                          if (e.key === 'ArrowDown') { e.preventDefault(); setCompareActiveIdx(i => i < compareSuggestions.length - 1 ? i + 1 : 0); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setCompareActiveIdx(i => i > 0 ? i - 1 : compareSuggestions.length - 1); }
                        }}
                        autoFocus
                      />
                      {compareSuggestions.length > 0 && (
                        <ul className="chart-tool-compare-suggestions">
                          {compareSuggestions.map((item, i) => (
                            <li
                              key={item.symbol}
                              className={`chart-tool-compare-suggestion${i === compareActiveIdx ? ' active' : ''}`}
                              onMouseDown={() => selectCompare(item.symbol)}
                              onMouseEnter={() => setCompareActiveIdx(i)}
                            >
                              <span className="chart-tool-compare-symbol">{item.symbol}</span>
                              <span className="chart-tool-compare-name">{item.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Screenshot / Snip */}
            <div className="chart-tool-wrapper">
              <button
                className={`chart-tool-btn ${snipMode ? 'chart-tool-btn--active' : ''}`}
                onClick={() => setSnipMode(m => !m)}
                title={snipMode ? 'Cancel snip' : 'Snip chart area'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="14" height="10" rx="1.5"/>
                  <circle cx="8" cy="9" r="2.5"/>
                  <path d="M5.5 4V3a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1"/>
                </svg>
              </button>
              {snapshotStatus && (
                <span className="snapshot-toast">
                  {snapshotStatus === 'copied' ? 'Copied to clipboard!' : 'Downloaded!'}
                </span>
              )}
            </div>
          </div>
        )}

        <div className={`expanded-chart-container${drawMode !== 'none' ? ' drawing-active' : ''}${snipMode ? ' snip-active' : ''}`} style={{ flex: mainFlex }} ref={mainContainerRef}>
          {loading && <div className="chart-loading">Loading chart data...</div>}
          {!loading && (!data || data.length === 0) && <div className="chart-loading">No chart data available</div>}
          {!compact && crosshairData && crosshairPoint && (
            <div
              className="floating-tooltip"
              style={{
                left: Math.min(crosshairPoint.x + 16, (mainContainerRef.current?.clientWidth || 600) - 200),
                top: Math.max(crosshairPoint.y - 80, 8),
              }}
            >
              <div className="floating-tooltip-row">
                <span className="floating-tooltip-label">O</span>
                <span className={`floating-tooltip-value ${crosshairData.isUp ? 'val-up' : 'val-down'}`}>{crosshairData.open.toFixed(2)}</span>
              </div>
              <div className="floating-tooltip-row">
                <span className="floating-tooltip-label">H</span>
                <span className={`floating-tooltip-value ${crosshairData.isUp ? 'val-up' : 'val-down'}`}>{crosshairData.high.toFixed(2)}</span>
              </div>
              <div className="floating-tooltip-row">
                <span className="floating-tooltip-label">L</span>
                <span className={`floating-tooltip-value ${crosshairData.isUp ? 'val-up' : 'val-down'}`}>{crosshairData.low.toFixed(2)}</span>
              </div>
              <div className="floating-tooltip-row">
                <span className="floating-tooltip-label">C</span>
                <span className={`floating-tooltip-value ${crosshairData.isUp ? 'val-up' : 'val-down'}`}>{crosshairData.close.toFixed(2)}</span>
              </div>
              <div className="floating-tooltip-divider" />
              <div className="floating-tooltip-row">
                <span className="floating-tooltip-label">Vol</span>
                <span className="floating-tooltip-value">{formatVolume(crosshairData.volume)}</span>
              </div>
            </div>
          )}
          {drawMode !== 'none' && (
            <div className="draw-mode-badge">
              {drawMode === 'hline' ? 'Click to place line' :
               drawClickCount === 0 ? 'Click first point' : 'Click second point'}
              {drawClickCount === 1 && <span ref={measureRef} className="draw-measure" />}
              <button className="draw-mode-cancel" onClick={cancelDraw}>&times;</button>
            </div>
          )}
          {snipMode && (
            <div
              className="snip-overlay"
              onMouseDown={handleSnipStart}
              onMouseMove={handleSnipMove}
              onMouseUp={handleSnipEnd}
              onTouchStart={handleSnipStart}
              onTouchMove={handleSnipMove}
              onTouchEnd={handleSnipEnd}
            >
              {snipRect && (
                <div
                  className="snip-selection"
                  style={{
                    left: Math.min(snipRect.startX, snipRect.endX),
                    top: Math.min(snipRect.startY, snipRect.endY),
                    width: Math.abs(snipRect.endX - snipRect.startX),
                    height: Math.abs(snipRect.endY - snipRect.startY),
                  }}
                />
              )}
              <div className="snip-hint">Tap and drag to select area</div>
            </div>
          )}
        </div>

        {effectiveIndicators.rsi && (
          <div className="sub-chart-pane" style={{ flex: 0.2, minHeight: 80 }}>
            <span className="sub-chart-label">RSI 14</span>
            <div ref={rsiContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}

        {effectiveIndicators.macd && (
          <div className="sub-chart-pane" style={{ flex: 0.2, minHeight: 80 }}>
            <span className="sub-chart-label">MACD 12,26,9</span>
            <div ref={macdContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>
      {showNews && (
        <>
          <div className="panel-backdrop" onClick={() => setShowNews(false)} />
          <div className="expanded-news-panel">
            <div className="expanded-news-header">
              <span>News for {stock.symbol}</span>
              <button className="expanded-news-close" onClick={() => setShowNews(false)}>&times;</button>
            </div>
            {newsArticles.map((article, i) => (
              <a key={i} className="expanded-news-item" href={article.link} target="_blank" rel="noopener noreferrer">
                <span className="expanded-news-headline">{article.title}</span>
                <span className="expanded-news-meta">{article.publisher} &middot; {timeAgo(article.publishedAt)}</span>
              </a>
            ))}
          </div>
        </>
      )}
      {showSmartMoney && (
        <>
          <div className="panel-backdrop" onClick={() => setShowSmartMoney(false)} />
          <div className="expanded-smartmoney-panel">
            <div className="expanded-smartmoney-header">
              <span>Smart Money &mdash; {stock.symbol}</span>
              <button className="expanded-smartmoney-close" onClick={() => setShowSmartMoney(false)}>&times;</button>
            </div>
            {smartMoneyLoading ? (
              <div className="expanded-stats-loading">Loading smart money data...</div>
            ) : smartMoneyData ? (
              <div className="smartmoney-panel-content">
                {/* Insider Trading section */}
                <div className="smartmoney-section">
                  <div className="smartmoney-section-header" onClick={() => setSmartMoneySections(s => ({ ...s, insider: !s.insider }))}>
                    <span className="smartmoney-section-label">
                      <span className={`smartmoney-section-chevron${smartMoneySections.insider ? ' open' : ''}`}>&#9654;</span>
                      Insider Trading
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{smartMoneyData.insider?.count ?? 0} trades</span>
                  </div>
                  {smartMoneySections.insider && (
                    <div className="smartmoney-section-body">
                      {smartMoneyData.insider?.trades?.length > 0 ? smartMoneyData.insider.trades.slice(0, 5).map((t, i) => (
                        <div key={i} className="smartmoney-panel-trade">
                          <span className={`sentiment-badge sm ${t.isBuy ? 'bullish' : 'bearish'}`}>{t.isBuy ? 'BUY' : 'SELL'}</span>
                          <span className="smartmoney-panel-trade-name">{t.insiderName}</span>
                          <span className="smartmoney-panel-trade-value">${t.value >= 1e6 ? (t.value/1e6).toFixed(1)+'M' : t.value >= 1e3 ? (t.value/1e3).toFixed(0)+'K' : t.value}</span>
                          <span className="smartmoney-panel-trade-date">{t.tradeDate}</span>
                        </div>
                      )) : <div className="smartmoney-panel-empty">No insider trades found</div>}
                    </div>
                  )}
                </div>

                {/* Options Flow section */}
                <div className="smartmoney-section">
                  <div className="smartmoney-section-header" onClick={() => setSmartMoneySections(s => ({ ...s, options: !s.options }))}>
                    <span className="smartmoney-section-label">
                      <span className={`smartmoney-section-chevron${smartMoneySections.options ? ' open' : ''}`}>&#9654;</span>
                      Options Flow
                    </span>
                    {smartMoneyData.options?.summary && (
                      <span className={`sentiment-badge sm ${smartMoneyData.options.summary.sentiment}`}>
                        {smartMoneyData.options.summary.sentiment}
                      </span>
                    )}
                  </div>
                  {smartMoneySections.options && (
                    <div className="smartmoney-section-body">
                      {smartMoneyData.options?.summary ? (
                        <>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Put/Call Ratio</span>
                            <span className="smartmoney-panel-row-value">{smartMoneyData.options.summary.putCallRatio ?? '—'}</span>
                          </div>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Net Premium</span>
                            <span className="smartmoney-panel-row-value" style={{ color: smartMoneyData.options.summary.netPremium >= 0 ? 'var(--green-primary)' : 'var(--red-primary)' }}>
                              ${Math.abs(smartMoneyData.options.summary.netPremium) >= 1e6 ? (smartMoneyData.options.summary.netPremium/1e6).toFixed(1)+'M' : Math.abs(smartMoneyData.options.summary.netPremium) >= 1e3 ? (smartMoneyData.options.summary.netPremium/1e3).toFixed(0)+'K' : smartMoneyData.options.summary.netPremium}
                            </span>
                          </div>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Call Volume</span>
                            <span className="smartmoney-panel-row-value">{smartMoneyData.options.summary.totalCallVolume?.toLocaleString()}</span>
                          </div>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Put Volume</span>
                            <span className="smartmoney-panel-row-value">{smartMoneyData.options.summary.totalPutVolume?.toLocaleString()}</span>
                          </div>
                          {smartMoneyData.options.unusual?.length > 0 && (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#ffc107', marginTop: 8, marginBottom: 4 }}>Top Unusual</div>
                              {smartMoneyData.options.unusual.slice(0, 3).map((u, i) => (
                                <div key={i} className="smartmoney-panel-trade">
                                  <span className={`sentiment-badge sm ${u.sentiment}`}>{u.type}</span>
                                  <span className="smartmoney-panel-trade-name">${u.strike} strike</span>
                                  <span className="smartmoney-panel-trade-value">Vol: {u.volume?.toLocaleString()}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      ) : <div className="smartmoney-panel-empty">No options data</div>}
                    </div>
                  )}
                </div>

                {/* Short Interest section */}
                <div className="smartmoney-section">
                  <div className="smartmoney-section-header" onClick={() => setSmartMoneySections(s => ({ ...s, short: !s.short }))}>
                    <span className="smartmoney-section-label">
                      <span className={`smartmoney-section-chevron${smartMoneySections.short ? ' open' : ''}`}>&#9654;</span>
                      Short Interest
                    </span>
                  </div>
                  {smartMoneySections.short && (
                    <div className="smartmoney-section-body">
                      {smartMoneyData.short ? (
                        <>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Short % Float</span>
                            <span className="smartmoney-panel-row-value value-highlight">
                              {smartMoneyData.short.shortPercentOfFloat != null ? (smartMoneyData.short.shortPercentOfFloat * 100).toFixed(1) + '%' : '—'}
                            </span>
                          </div>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Days to Cover</span>
                            <span className="smartmoney-panel-row-value">{smartMoneyData.short.shortRatio?.toFixed(1) ?? '—'}</span>
                          </div>
                          <div className="smartmoney-panel-row">
                            <span className="smartmoney-panel-row-label">Shares Short</span>
                            <span className="smartmoney-panel-row-value">
                              {smartMoneyData.short.sharesShort ? (smartMoneyData.short.sharesShort >= 1e6 ? (smartMoneyData.short.sharesShort/1e6).toFixed(1)+'M' : (smartMoneyData.short.sharesShort/1e3).toFixed(0)+'K') : '—'}
                            </span>
                          </div>
                        </>
                      ) : <div className="smartmoney-panel-empty">No short interest data</div>}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="expanded-stats-loading">No data available</div>
            )}
          </div>
        </>
      )}
      {showStats && (
        <>
          <div className="panel-backdrop" onClick={() => setShowStats(false)} />
          <div className="expanded-stats-panel">
          <div className="expanded-stats-header">
            <span>Key Statistics</span>
            <button className="expanded-stats-close" onClick={() => setShowStats(false)}>&times;</button>
          </div>
          {statsLoading ? (
            <div className="expanded-stats-loading">Loading statistics...</div>
          ) : stats ? (
            <div className="expanded-stats-table">
              <StatsRow label="Open" value={fmtStatPrice(stats.open)} />
              <StatsRow label="Prev Close" value={fmtStatPrice(stats.prevClose)} />
              <StatsRow label="High" value={fmtStatPrice(stats.high)} color="green" />
              <StatsRow label="Low" value={fmtStatPrice(stats.low)} color="red" />
              <StatsRow label="Volume" value={fmtStatVol(stats.volume)} />
              <StatsRow label="Market Cap" value={fmtStatCap(stats.marketCap)} />
              <StatsRow label="P/E (TTM)" value={fmtStatNum(stats.peRatio)} />
              <StatsRow label="P/E (FWD)" value={fmtStatNum(stats.forwardPE)} />
              <StatsRow label="EPS (TTM)" value={fmtStatPrice(stats.eps)} />
              <StatsRow label="Revenue" value={fmtStatCap(stats.revenue)} />
              <StatsRow label="Net Income" value={fmtStatCap(stats.netIncome)} />
              <StatsRow label="52 Wk High" value={fmtStatPrice(stats.fiftyTwoWeekHigh)} color="green" />
              <StatsRow label="52 Wk Low" value={fmtStatPrice(stats.fiftyTwoWeekLow)} color="red" />
              <StatsRow label="Beta" value={fmtStatNum(stats.beta)} />
              <StatsRow label="Shares Out" value={fmtStatCap(stats.sharesOut)} />
              <StatsRow label="Dividend" value={stats.dividendRate != null ? `$${stats.dividendRate.toFixed(2)}` : '--'} />
              <StatsRow label="Div Yield" value={stats.dividendYield != null ? `${stats.dividendYield.toFixed(2)}%` : '--'} />
              <StatsRow label="Analysts" value={stats.analysts || '--'} highlight />
              <StatsRow label="Price Target" value={stats.priceTarget ? `$${stats.priceTarget.toFixed(2)}` : '--'} />
              <StatsRow label="Earnings Date" value={stats.earningsDate || '--'} />
              {stats.sector && <StatsRow label="Sector" value={stats.sector} />}
              {stats.industry && <StatsRow label="Industry" value={stats.industry} />}
            </div>
          ) : (
            <div className="expanded-stats-loading">No statistics available</div>
          )}
        </div>
        </>
      )}
    </div>
  );

  // In compact/grid mode, parent renders the overlay — just return the modal
  if (compact) return modal;

  return (
    <div className="expanded-overlay" onClick={onClose}>
      {modal}
    </div>
  );
}
