import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "../hooks/useScrollLock.js";
import StockLogo from "./StockLogo.jsx";

/* ─── Fuzzy scorer ──────────────────────────────────────── */
// Subsequence match with position + prefix + camel-hump bonuses. Small and
// dependency-free — we just want fast, decent ranking, not a full library.
function fuzzyScore(text, query) {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // Exact prefix dominates
  if (t.startsWith(q)) return 1000 - (t.length - q.length);

  let ti = 0;
  let qi = 0;
  let score = 0;
  let streak = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      // Word-start bonus (beginning, after space, or after /.-_)
      const atBoundary = ti === 0 || /[\s/\-_.]/.test(t[ti - 1]);
      score += 8 + (atBoundary ? 20 : 0) + streak * 4;
      streak += 1;
      qi += 1;
    } else {
      streak = 0;
      score -= 1;
    }
    ti += 1;
  }
  if (qi < q.length) return 0; // didn't match everything
  // Penalty for long non-matching trailing text
  score -= (t.length - q.length) * 0.3;
  return score;
}

/* ─── Data-source shape ─────────────────────────────────── */
// A "command" is { id, group, title, subtitle?, icon?, onRun, symbol? }.

const GROUP_ORDER = ["recent", "favorites", "tabs", "tickers", "actions"];
const GROUP_LABELS = {
  recent: "Recent",
  favorites: "Favorites",
  tabs: "Navigate",
  tickers: "Tickers",
  actions: "Actions",
};

/* ─── Palette ───────────────────────────────────────────── */

export default function CommandPalette({
  open,
  onClose,
  tabs,
  favorites,
  recentStocks,
  onNavigate,        // (tabKey) => void
  onOpenStock,       // (stock) => void — opens expanded chart
  onSearchSymbol,    // (symbol:string) => void — forces a quote fetch
  onToggleFavorite,
  onToggleTheme,
  onToggleSidebar,
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remoteResults, setRemoteResults] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useScrollLock(open);

  // Reset state every time the palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setRemoteResults([]);
      // Focus the input after it mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Remote ticker search (same endpoint as Header search)
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) {
      setRemoteResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        const results = (data.results || []).slice(0, 8);
        setRemoteResults(results);
      } catch {
        /* aborted / offline */
      }
    }, 160);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  /* ─── Build command list from props (static) + remote (search) ─── */
  const staticCommands = useMemo(() => {
    const cmds = [];

    // Tabs
    for (const tab of tabs) {
      cmds.push({
        id: `tab:${tab.key}`,
        group: "tabs",
        title: `Go to ${tab.label}`,
        subtitle: `Tab · ${tab.key}`,
        icon: <TabIcon />,
        onRun: () => onNavigate(tab.key),
      });
    }
    cmds.push({
      id: "tab:portfolio",
      group: "tabs",
      title: "Go to Portfolio",
      subtitle: "Tab · portfolio",
      icon: <TabIcon />,
      onRun: () => onNavigate("portfolio"),
    });

    // Favorites
    for (const fav of favorites || []) {
      cmds.push({
        id: `fav:${fav.symbol}`,
        group: "favorites",
        title: fav.symbol,
        subtitle: fav.name || fav.longName || "Favorite",
        symbol: fav.symbol,
        onRun: () => onOpenStock(fav),
      });
    }

    // Recent stocks (excluding anything already in favorites for de-dup)
    const favSyms = new Set((favorites || []).map((f) => f.symbol));
    for (const rec of recentStocks || []) {
      if (favSyms.has(rec.symbol)) continue;
      cmds.push({
        id: `recent:${rec.symbol}`,
        group: "recent",
        title: rec.symbol,
        subtitle: rec.name || "Recently viewed",
        symbol: rec.symbol,
        onRun: () => onOpenStock(rec),
      });
    }

    // Actions
    cmds.push({
      id: "act:theme",
      group: "actions",
      title: "Toggle theme",
      subtitle: "Switch between light and dark",
      icon: <BoltIcon />,
      onRun: onToggleTheme,
    });
    cmds.push({
      id: "act:sidebar",
      group: "actions",
      title: "Toggle sidebar",
      subtitle: "Show or hide the watchlist sidebar",
      icon: <BoltIcon />,
      onRun: onToggleSidebar,
    });

    return cmds;
  }, [tabs, favorites, recentStocks, onNavigate, onOpenStock, onToggleTheme, onToggleSidebar]);

  const remoteCommands = useMemo(() => {
    const favSyms = new Set((favorites || []).map((f) => f.symbol));
    const recSyms = new Set((recentStocks || []).map((r) => r.symbol));
    return remoteResults
      .filter((r) => !favSyms.has(r.symbol) && !recSyms.has(r.symbol))
      .map((r) => ({
        id: `ticker:${r.symbol}`,
        group: "tickers",
        title: r.symbol,
        subtitle: r.name || r.exchange || "",
        symbol: r.symbol,
        onRun: () => onSearchSymbol(r.symbol),
      }));
  }, [remoteResults, favorites, recentStocks, onSearchSymbol]);

  /* ─── Rank + group ─────────────────────────────────────── */
  const ranked = useMemo(() => {
    const q = query.trim();
    const all = [...staticCommands, ...remoteCommands];
    if (!q) {
      // No query — show recents + favorites + tabs
      return all.filter((c) => c.group !== "tickers");
    }
    const scored = [];
    for (const c of all) {
      const titleScore = fuzzyScore(c.title, q);
      const subScore = c.subtitle ? fuzzyScore(c.subtitle, q) * 0.4 : 0;
      const best = Math.max(titleScore, subScore);
      if (best > 0) {
        // Boost tickers when the query looks like a symbol
        const looksLikeSymbol = /^[A-Z]{1,6}$/.test(q.toUpperCase());
        const groupBoost = c.group === "tickers" && looksLikeSymbol ? 500 : 0;
        scored.push({ ...c, _score: best + groupBoost });
      }
    }
    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, 30);
  }, [query, staticCommands, remoteCommands]);

  // Grouped display order
  const grouped = useMemo(() => {
    const byGroup = new Map();
    for (const c of ranked) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, []);
      byGroup.get(c.group).push(c);
    }
    const ordered = [];
    for (const g of GROUP_ORDER) {
      const items = byGroup.get(g);
      if (items && items.length) ordered.push({ key: g, items });
    }
    return ordered;
  }, [ranked]);

  // Flat list for keyboard nav
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Keep active in range when list shrinks
  useEffect(() => {
    if (active >= flat.length) setActive(0);
  }, [flat.length, active]);

  // Scroll the active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-cmd-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runCommand = useCallback(
    (cmd) => {
      if (!cmd) return;
      try {
        cmd.onRun();
      } catch {
        /* ignore — command can fail silently */
      }
      onClose();
    },
    [onClose],
  );

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // If no matches but query looks like a symbol, treat Enter as "search"
      if (flat.length === 0 && query.trim().length > 0) {
        onSearchSymbol(query.trim().toUpperCase());
        onClose();
        return;
      }
      runCommand(flat[active]);
    }
  };

  if (!open) return null;

  let globalIdx = -1;

  return createPortal(
    <div
      className="cmdp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
    >
      <div
        className="cmdp-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdp-input-wrap">
          <svg
            className="cmdp-input-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="cmdp-input"
            type="text"
            placeholder="Jump to ticker, tab, favorite…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdp-kbd">Esc</kbd>
        </div>

        <div className="cmdp-results" ref={listRef}>
          {grouped.length === 0 ? (
            <div className="cmdp-empty">
              {query.trim() ? (
                <>
                  No matches. Press <kbd className="cmdp-kbd">Enter</kbd> to
                  search <strong>{query.trim().toUpperCase()}</strong> as a
                  symbol.
                </>
              ) : (
                "Type to jump anywhere in TickrView."
              )}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="cmdp-group">
                <div className="cmdp-group-label">
                  {GROUP_LABELS[group.key]}
                </div>
                {group.items.map((cmd) => {
                  globalIdx += 1;
                  const idx = globalIdx;
                  const isActive = idx === active;
                  return (
                    <button
                      type="button"
                      key={cmd.id}
                      data-cmd-idx={idx}
                      className={`cmdp-item${isActive ? " cmdp-item--active" : ""}`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => runCommand(cmd)}
                    >
                      <span className="cmdp-item-icon">
                        {cmd.symbol ? (
                          <StockLogo symbol={cmd.symbol} size={22} />
                        ) : (
                          cmd.icon || <TabIcon />
                        )}
                      </span>
                      <span className="cmdp-item-body">
                        <span className="cmdp-item-title">{cmd.title}</span>
                        {cmd.subtitle && (
                          <span className="cmdp-item-sub">{cmd.subtitle}</span>
                        )}
                      </span>
                      {isActive && (
                        <kbd className="cmdp-kbd cmdp-kbd-enter">↵</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmdp-footer">
          <span className="cmdp-hint">
            <kbd className="cmdp-kbd">↑</kbd>
            <kbd className="cmdp-kbd">↓</kbd>
            to navigate
          </span>
          <span className="cmdp-hint">
            <kbd className="cmdp-kbd">↵</kbd>
            to select
          </span>
          <span className="cmdp-hint">
            <kbd className="cmdp-kbd">Esc</kbd>
            to dismiss
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── tiny inline icons ──────────────────────────────────── */
function TabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8h18" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
