import { useEffect, useRef } from "react";

const PARTICLE_COUNT_BASE = 50;
const CONNECTION_DIST = 120;
const SPEED_MIN = 0.15;
const SPEED_MAX = 0.45;

const THEME_COLORS = {
  dark: {
    particles: [
      { r: 0, g: 229, b: 255 },   // cyan
      { r: 0, g: 229, b: 255 },   // cyan (weighted)
      { r: 0, g: 229, b: 255 },   // cyan (weighted)
      { r: 179, g: 136, b: 255 }, // purple
    ],
    lineAlpha: 0.1,
    dotAlpha: 0.4,
  },
  light: {
    particles: [
      { r: 0, g: 151, b: 167 },   // teal
      { r: 0, g: 151, b: 167 },   // teal (weighted)
      { r: 0, g: 151, b: 167 },   // teal (weighted)
      { r: 147, g: 51, b: 234 },  // purple
    ],
    lineAlpha: 0.07,
    dotAlpha: 0.3,
  },
};

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function createParticle(w, h, colors) {
  const color = colors[Math.floor(Math.random() * colors.length)];
  const angle = Math.random() * Math.PI * 2;
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 1.5 + Math.random() * 1.5,
    color,
  };
}

export default function ParticleBackground() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
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

      // Scale particle count for ultra-wide monitors
      const count = Math.round(PARTICLE_COUNT_BASE * Math.max(1, w / 1920));
      const colors = THEME_COLORS[themeRef.current].particles;
      const existing = particlesRef.current;

      if (existing.length < count) {
        for (let i = existing.length; i < count; i++) {
          existing.push(createParticle(w, h, colors));
        }
      } else if (existing.length > count) {
        existing.length = count;
      }

      // Keep particles in bounds after resize
      for (const p of existing) {
        if (p.x > w) p.x = Math.random() * w;
        if (p.y > h) p.y = Math.random() * h;
      }
    }

    function initParticles() {
      const { w, h } = sizeRef.current;
      const count = Math.round(PARTICLE_COUNT_BASE * Math.max(1, w / 1920));
      const colors = THEME_COLORS[themeRef.current].particles;
      particlesRef.current = [];
      for (let i = 0; i < count; i++) {
        particlesRef.current.push(createParticle(w, h, colors));
      }
    }

    function updateThemeColors() {
      const theme = getTheme();
      themeRef.current = theme;
      const colors = THEME_COLORS[theme].particles;
      for (const p of particlesRef.current) {
        p.color = colors[Math.floor(Math.random() * colors.length)];
      }
    }

    function draw() {
      const { w, h } = sizeRef.current;
      const theme = THEME_COLORS[themeRef.current];
      const particles = particlesRef.current;

      ctx.clearRect(0, 0, w, h);

      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }

      // Draw connections
      const distSq = CONNECTION_DIST * CONNECTION_DIST;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < distSq) {
            const alpha = theme.lineAlpha * (1 - d2 / distSq);
            const c = particles[i].color;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${theme.dotAlpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    // Init
    resize();
    initParticles();
    rafRef.current = requestAnimationFrame(draw);

    // Resize handler (debounced)
    let resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
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
      if (getTheme() !== themeRef.current) {
        updateThemeColors();
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
