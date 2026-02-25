import { useEffect, useRef } from "react";

// Stock data that flows diagonally
const SYMBOLS = [
  "AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN", "META", "AMD",
  "JPM", "V", "BA", "DIS", "NFLX", "PLTR", "UBER", "CRM", "INTC",
  "SPY", "QQQ", "AVGO", "LLY", "UNH", "GS", "CAT", "BTC",
];

const STREAM_COUNT = 55;
const ANGLE = -Math.PI / 4.5; // ~40 degrees, bottom-left to top-right
const COS_A = Math.cos(ANGLE);
const SIN_A = Math.sin(ANGLE);

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function randomPrice() {
  return "$" + (5 + Math.random() * 495).toFixed(2);
}

function randomPct() {
  const val = (Math.random() * 8 - 2.5).toFixed(2);
  return (val >= 0 ? "+" : "") + val + "%";
}

function randomVol() {
  const n = Math.random();
  if (n < 0.5) return (Math.random() * 90 + 10).toFixed(1) + "M";
  return (Math.random() * 900 + 100).toFixed(0) + "K";
}

function randomLabel() {
  const r = Math.random();
  if (r < 0.35) return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  if (r < 0.6) return randomPrice();
  if (r < 0.85) return randomPct();
  return randomVol();
}

const COLORS = {
  dark: {
    cyan: "0,229,255",
    green: "0,214,107",
    purple: "179,136,255",
    red: "255,41,82",
  },
  light: {
    cyan: "0,151,167",
    green: "22,163,74",
    purple: "147,51,234",
    red: "220,38,38",
  },
};

function pickColor(label, theme) {
  const c = COLORS[theme];
  if (label.startsWith("+")) return c.green;
  if (label.startsWith("-")) return c.red;
  if (label.startsWith("$")) return c.cyan;
  if (label.endsWith("M") || label.endsWith("K")) return c.purple;
  return c.cyan; // symbols
}

function createStreamItem(w, h, theme, scattered) {
  const label = randomLabel();
  const color = pickColor(label, theme);
  const size = 10 + Math.random() * 6; // 10-16px
  const speed = 0.3 + Math.random() * 0.5; // 0.3-0.8 px/frame
  const alpha = 0.06 + Math.random() * 0.14; // 0.06-0.20

  // Diagonal is the full screen diagonal length
  const diag = Math.sqrt(w * w + h * h);
  // Band width: items spawn within a wide diagonal corridor
  const bandWidth = Math.max(w, h) * 0.85;

  // Position along the diagonal (-padding to diag+padding)
  const along = scattered
    ? Math.random() * (diag + 400) - 200
    : -(Math.random() * 200); // new items spawn at the start

  // Position across the band (perpendicular offset)
  const across = (Math.random() - 0.5) * bandWidth;

  // Convert diagonal coords to screen coords
  // Origin at bottom-left corner
  const originX = -w * 0.1;
  const originY = h * 1.1;
  const x = originX + along * COS_A + across * -SIN_A;
  const y = originY + along * SIN_A + across * COS_A;

  return { label, color, size, speed, alpha, x, y, along, diag };
}

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const itemsRef = useRef([]);
  const themeRef = useRef(getTheme());
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    }

    function initItems() {
      const { w, h } = sizeRef.current;
      const theme = themeRef.current;
      itemsRef.current = [];
      for (let i = 0; i < STREAM_COUNT; i++) {
        itemsRef.current.push(createStreamItem(w, h, theme, true));
      }
    }

    function draw() {
      const { w, h } = sizeRef.current;
      const items = itemsRef.current;
      const theme = themeRef.current;
      const diag = Math.sqrt(w * w + h * h);

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Move along the diagonal
        item.x += COS_A * item.speed;
        item.y += SIN_A * item.speed;
        item.along += item.speed;

        // Fade based on position along the diagonal (fade in at start, fade out at end)
        const progress = item.along / (diag + 200);
        let fade = 1;
        if (progress < 0.1) fade = progress / 0.1;
        else if (progress > 0.85) fade = (1 - progress) / 0.15;
        fade = Math.max(0, Math.min(1, fade));

        const alpha = item.alpha * fade;
        if (alpha < 0.005) {
          // Respawn if off-screen
          if (item.along > diag + 300) {
            items[i] = createStreamItem(w, h, theme, false);
          }
          continue;
        }

        ctx.font = `${item.size}px "SF Mono", "Fira Code", "Cascadia Code", monospace`;
        ctx.fillStyle = `rgba(${item.color},${alpha})`;
        ctx.fillText(item.label, item.x, item.y);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    // Init
    resize();
    initItems();
    rafRef.current = requestAnimationFrame(draw);

    // Resize handler
    let resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        initItems();
      }, 150);
    }
    window.addEventListener("resize", onResize);

    // Pause when tab hidden
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(draw);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Watch theme changes
    const observer = new MutationObserver(() => {
      const newTheme = getTheme();
      if (newTheme !== themeRef.current) {
        themeRef.current = newTheme;
        // Update colors on existing items
        for (const item of itemsRef.current) {
          item.color = pickColor(item.label, newTheme);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
