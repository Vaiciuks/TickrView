import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const CANDLE_W = 16;
const CANDLE_GAP = 6;
const CANDLE_STEP = CANDLE_W + CANDLE_GAP;
const SCROLL_SPEED = 0.08;
const FRAMES_PER_CANDLE = Math.round(CANDLE_STEP / SCROLL_SPEED);

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function nextPrice(prev, mean, vol) {
  return prev + (mean - prev) * 0.03 + (Math.random() - 0.5) * vol;
}

function makeCandle(prev, mean) {
  const vol = 3.5 + Math.random() * 4.5;
  const o = prev, c = nextPrice(o, mean, vol);
  const hi = Math.max(o, c) + Math.random() * vol * 0.5;
  const lo = Math.min(o, c) - Math.random() * vol * 0.5;
  // Random phase & speed for individual breathing
  const phase = Math.random() * Math.PI * 2;
  const speed = 0.0005 + Math.random() * 0.0008;
  return { o, c, hi, lo, phase, speed };
}

function generateCandles(count, mean) {
  const out = [];
  let p = mean + (Math.random() - 0.5) * 20;
  for (let i = 0; i < count; i++) {
    const candle = makeCandle(p, mean);
    out.push(candle);
    p = candle.c;
  }
  return out;
}

function generateLine(count, mean) {
  const pts = [];
  let p = mean + (Math.random() - 0.5) * 15;
  for (let i = 0; i < count; i++) {
    p = nextPrice(p, mean, 2.5);
    pts.push(p);
  }
  return pts;
}

const THEMES = {
  dark: {
    bull: [0, 214, 107],
    bear: [255, 41, 82],
    glow: [0, 229, 255],
    line2: [179, 136, 255],
    line3: [0, 180, 220],
    grid: "rgba(255,255,255,0.02)",
  },
  light: {
    bull: [22, 163, 74],
    bear: [220, 38, 38],
    glow: [0, 151, 167],
    line2: [147, 51, 234],
    line3: [0, 120, 150],
    grid: "rgba(0,0,0,0.025)",
  },
};

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let w, h;
    let theme = getTheme();

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const newW = window.innerWidth;
      const newH = window.innerHeight;

      // Skip minor height-only changes (mobile address bar, sidebar transitions)
      // This prevents the chart from jumping when scrolling on mobile or toggling sidebar
      if (w > 0 && newW === w && Math.abs(newH - h) < 100) return;

      w = newW;
      h = newH;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      const diag = Math.sqrt(w * w + h * h);
      const buffer = CANDLE_STEP * 15;
      const candleCount = Math.ceil((diag + buffer * 2) / CANDLE_STEP);
      const mean = 150;

      stateRef.current = {
        candles: generateCandles(candleCount, mean),
        line2: generateLine(candleCount, mean + 10),
        line3: generateLine(candleCount, mean - 10),
        candleCount, buffer, mean,
        scrollX: 0, frame: 0,
      };
    }

    function draw() {
      const s = stateRef.current;
      if (!s) { rafRef.current = requestAnimationFrame(draw); return; }

      const colors = THEMES[theme];
      const { candles, line2, line3, buffer, mean } = s;
      const angle = Math.atan2(-h, w);
      const chartH = h * 0.9;

      const now = Date.now();

      const halfRange = 32;
      const minP = mean - halfRange;
      const range = halfRange * 2;
      const toY = (p) => {
        const clamped = Math.max(minP, Math.min(minP + range, p));
        return -((clamped - minP) / range) * chartH + chartH * 0.5;
      };

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(0, h);
      ctx.rotate(angle);
      ctx.translate(-buffer + s.scrollX, 0);

      const totalLen = candles.length * CANDLE_STEP;

      // Grid
      for (let i = 0; i <= 5; i++) {
        const gy = -chartH * 0.5 + (chartH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(totalLen, gy);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Secondary line (purple)
      ctx.beginPath();
      for (let i = 0; i < line2.length; i++) {
        const x = i * CANDLE_STEP + CANDLE_W / 2, y = toY(line2[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const [l2r, l2g, l2b] = colors.line2;
      ctx.strokeStyle = `rgba(${l2r},${l2g},${l2b},0.14)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${l2r},${l2g},${l2b},0.05)`;
      ctx.lineWidth = 6;
      ctx.stroke();

      // Third line (teal)
      ctx.beginPath();
      for (let i = 0; i < line3.length; i++) {
        const x = i * CANDLE_STEP + CANDLE_W / 2, y = toY(line3[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const [l3r, l3g, l3b] = colors.line3;
      ctx.strokeStyle = `rgba(${l3r},${l3g},${l3b},0.10)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Candlesticks — individual breathing fade
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const x = i * CANDLE_STEP;
        const bull = c.c >= c.o;
        const [cr, cg, cb] = bull ? colors.bull : colors.bear;
        const bodyTop = toY(Math.max(c.o, c.c));
        const bodyBot = toY(Math.min(c.o, c.c));
        const bodyH = Math.max(bodyBot - bodyTop, 4);
        const midX = x + CANDLE_W / 2;
        const wickTop = toY(c.hi);
        const wickBot = toY(c.lo);

        // Per-candle breathing
        const b = 0.58 + 0.42 * Math.sin(now * c.speed + c.phase);

        // Upper wick (above body only)
        if (wickTop < bodyTop) {
          ctx.beginPath();
          ctx.moveTo(midX, wickTop);
          ctx.lineTo(midX, bodyTop);
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.30 * b).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Lower wick (below body only)
        if (wickBot > bodyTop + bodyH) {
          ctx.beginPath();
          ctx.moveTo(midX, bodyTop + bodyH);
          ctx.lineTo(midX, wickBot);
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.30 * b).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Soft glow behind body
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.10 * b).toFixed(3)})`;
        ctx.fillRect(x - 3, bodyTop - 3, CANDLE_W + 6, bodyH + 6);

        // Body
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.40 * b).toFixed(3)})`;
        ctx.fillRect(x, bodyTop, CANDLE_W, bodyH);

        // Border
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.50 * b).toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x + 0.5, bodyTop + 0.5, CANDLE_W - 1, Math.max(bodyH - 1, 1));
      }

      // Main glow line — multi-stroke, no shadowBlur
      ctx.beginPath();
      for (let i = 0; i < candles.length; i++) {
        const x = i * CANDLE_STEP + CANDLE_W / 2, y = toY(candles[i].c);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const [gr, gg, gb] = colors.glow;
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.04)`;
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.08)`;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.18)`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.38)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Scroll
      s.scrollX -= SCROLL_SPEED;
      s.frame++;

      if (s.frame % FRAMES_PER_CANDLE === 0) {
        const lastC = candles[candles.length - 1];
        candles.push(makeCandle(lastC.c, mean));
        line2.push(nextPrice(line2[line2.length - 1], mean + 10, 2.5));
        line3.push(nextPrice(line3[line3.length - 1], mean - 10, 2.5));
      }

      const maxLen = s.candleCount + 40;
      if (candles.length > maxLen) {
        const trim = candles.length - maxLen;
        candles.splice(0, trim);
        line2.splice(0, trim);
        line3.splice(0, trim);
        s.scrollX += trim * CANDLE_STEP;
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    init();
    rafRef.current = requestAnimationFrame(draw);

    let resizeTimer;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); };
    window.addEventListener("resize", onResize);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(rafRef.current); else rafRef.current = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    const obs = new MutationObserver(() => { const t = getTheme(); if (t !== theme) theme = t; });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      obs.disconnect();
    };
  }, []);

  // Portal to document.body so canvas lives outside .app stacking context
  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />,
    document.body,
  );
}
