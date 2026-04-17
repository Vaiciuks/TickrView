import { useEffect, useRef, useState } from "react";

// Subscribe to the server's SSE /api/stream/quote/:symbol endpoint.
// Returns the latest quote payload. Automatically reconnects via the
// browser's built-in EventSource retry behavior.
//
// Falls back silently on browsers without EventSource (every modern
// browser has it, but guarding keeps SSR and tests safe).

export function useLiveQuote(symbol, active = true) {
  const [quote, setQuote] = useState(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    if (!active || !symbol || typeof EventSource === "undefined") {
      setQuote(null);
      setConnected(false);
      return;
    }

    setQuote(null);
    setConnected(false);

    const url = `/api/stream/quote/${encodeURIComponent(symbol)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setQuote(data);
      } catch {
        /* malformed frame — ignore */
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects. Surface a transient "not connected"
      // so the UI can dim a status dot if it wants to.
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [symbol, active]);

  return { quote, connected };
}
