import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tickrview-read-articles";
const MAX_ENTRIES = 500;   // bound localStorage growth

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(map) {
  try {
    // Trim oldest entries if we've exceeded the cap.
    const entries = Object.entries(map);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => a[1] - b[1]);
      const keep = entries.slice(-MAX_ENTRIES);
      map = Object.fromEntries(keep);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded — drop the write */
  }
}

export function useReadArticles() {
  const [readMap, setReadMap] = useState(load);

  // Sync between tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setReadMap(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isRead = useCallback((id) => !!readMap[id], [readMap]);

  const markRead = useCallback((id) => {
    if (!id) return;
    setReadMap((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: Date.now() };
      persist(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    setReadMap((prev) => {
      const next = { ...prev };
      const now = Date.now();
      for (const id of ids) {
        if (!next[id]) next[id] = now;
      }
      persist(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setReadMap({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { isRead, markRead, markAllRead, clearAll };
}
