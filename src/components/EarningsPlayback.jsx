import { useMemo } from "react";
import { useEarningsPlayback } from "../hooks/useEarningsPlayback.js";

function formatLabel(q) {
  if (q.quarter && q.year) return `Q${q.quarter} '${String(q.year).slice(2)}`;
  return q.period || "?";
}

function Bar({ value, maxAbs }) {
  if (value == null || !Number.isFinite(value) || maxAbs === 0) {
    return <div className="ep-bar-spacer" />;
  }
  // Bars anchor at the centre axis and grow in one direction only, so they
  // can only occupy up to 50% of the wrapper's height. Scale accordingly.
  const halfPct = Math.min(Math.abs(value) / maxAbs, 1) * 50;
  const isUp = value >= 0;
  return (
    <div className={`ep-bar-wrap ${isUp ? "ep-bar-up" : "ep-bar-down"}`}>
      <div className="ep-bar" style={{ height: `${halfPct}%` }} />
    </div>
  );
}

export default function EarningsPlayback({ symbol, earningsRows }) {
  const { data, loading } = useEarningsPlayback(symbol, earningsRows);

  const computed = useMemo(() => {
    if (data.length === 0) return null;
    // Only show the most recent 8 quarters
    const slice = data.slice(-8);
    let maxAbs = 0;
    for (const q of slice) {
      if (q.reactionD1 != null)
        maxAbs = Math.max(maxAbs, Math.abs(q.reactionD1));
      if (q.reaction5D != null)
        maxAbs = Math.max(maxAbs, Math.abs(q.reaction5D));
    }
    // Floor the axis so tiny reactions aren't visually inflated.
    maxAbs = Math.max(maxAbs, 3);

    const avgD1 =
      slice.reduce((s, q) => s + (q.reactionD1 ?? 0), 0) / slice.length;
    const avg5D =
      slice.reduce((s, q) => s + (q.reaction5D ?? 0), 0) / slice.length;

    return { slice, maxAbs, avgD1, avg5D };
  }, [data]);

  if (loading && !computed) {
    return (
      <div className="el-section">
        <h3 className="el-section-title">Post-Earnings Reaction</h3>
        <div className="expanded-stats-loading">
          Loading earnings playback...
        </div>
      </div>
    );
  }

  if (!computed || computed.slice.length === 0) return null;

  const fmt = (v) =>
    v == null || !Number.isFinite(v)
      ? "—"
      : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div className="el-section">
      <div className="ep-header">
        <h3 className="el-section-title">Post-Earnings Reaction</h3>
        <div className="ep-averages">
          <span className="ep-avg">
            <span className="ep-avg-label">Avg D+1</span>
            <span className={`ep-avg-value ${computed.avgD1 >= 0 ? "el-beat-text" : "el-miss-text"}`}>
              {fmt(computed.avgD1)}
            </span>
          </span>
          <span className="ep-avg">
            <span className="ep-avg-label">Avg 5D</span>
            <span className={`ep-avg-value ${computed.avg5D >= 0 ? "el-beat-text" : "el-miss-text"}`}>
              {fmt(computed.avg5D)}
            </span>
          </span>
        </div>
      </div>

      <div className="ep-chart">
        {computed.slice.map((q, i) => (
          <div key={i} className="ep-quarter">
            <div className="ep-bars-pair">
              <Bar value={q.reactionD1} maxAbs={computed.maxAbs} />
              <Bar value={q.reaction5D} maxAbs={computed.maxAbs} />
            </div>
            <div className="ep-bar-values">
              <span
                className={`ep-bar-val ${q.reactionD1 >= 0 ? "el-beat-text" : "el-miss-text"}`}
                title="Next-day close vs earnings-day close"
              >
                {fmt(q.reactionD1)}
              </span>
              {q.reaction5D != null && (
                <span
                  className={`ep-bar-val ep-bar-val-small ${q.reaction5D >= 0 ? "el-beat-text" : "el-miss-text"}`}
                  title="Close 5 trading days after earnings"
                >
                  {fmt(q.reaction5D)}
                </span>
              )}
            </div>
            <span className="ep-bar-label">{formatLabel(q)}</span>
            {q.beat === true && <span className="el-beat-indicator">&#10003;</span>}
            {q.beat === false && <span className="el-miss-indicator">&#10007;</span>}
          </div>
        ))}
      </div>

      <div className="el-chart-legend">
        <span className="el-legend-item">
          <span className="ep-legend-swatch ep-legend-d1" /> Day +1
        </span>
        <span className="el-legend-item">
          <span className="ep-legend-swatch ep-legend-5d" /> 5-day
        </span>
      </div>
    </div>
  );
}
