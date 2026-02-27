import { useState, useEffect } from "react";
import { retryFetch } from "../utils/retryFetch.js";

const REFRESH_INTERVAL = 120_000; // 2 minutes

export function useEarningsCalendar(active) {
  const [earnings, setEarnings] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    const fetchEarnings = async () => {
      try {
        const res = await retryFetch("/api/earnings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted) {
          setEarnings(data.earnings || {});
          setLoading(false);
          setLastUpdated(new Date());
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    fetchEarnings();
    const id = setInterval(fetchEarnings, REFRESH_INTERVAL);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [active]);

  return { earnings, loading, lastUpdated };
}
