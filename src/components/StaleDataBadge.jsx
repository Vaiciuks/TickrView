import { useState, useEffect } from "react";

function getAgeInfo(lastUpdated) {
  if (!lastUpdated) return { label: "Loading...", level: "neutral" };
  const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  if (seconds < 60) return { label: "Updated just now", level: "fresh" };
  if (seconds < 300) return { label: `Updated ${Math.floor(seconds / 60)}m ago`, level: "fresh" };
  if (seconds < 600) return { label: `Updated ${Math.floor(seconds / 60)}m ago`, level: "warning" };
  return { label: `Updated ${Math.floor(seconds / 60)}m ago`, level: "stale" };
}

export default function StaleDataBadge({ lastUpdated, error }) {
  const [, setTick] = useState(0);

  // Re-render every 30s to keep the relative time fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <span className="stale-data-badge stale-data-badge--error" title={error}>
        <span className="stale-data-dot stale-data-dot--error" />
        Failed to refresh
      </span>
    );
  }

  const { label, level } = getAgeInfo(lastUpdated);

  return (
    <span className={`stale-data-badge stale-data-badge--${level}`} title={label}>
      <span className={`stale-data-dot stale-data-dot--${level}`} />
      {label}
    </span>
  );
}
