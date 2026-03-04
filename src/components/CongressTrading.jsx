import { useState, useMemo } from "react";
import { useCongressTrading } from "../hooks/useCongressTrading.js";

function formatDelay(days) {
  if (days == null) return "---";
  return `${days}d`;
}

function delayClass(days) {
  if (days == null) return "";
  if (days <= 15) return "delay-fast";
  if (days <= 30) return "delay-normal";
  if (days <= 45) return "delay-slow";
  return "delay-late";
}

export default function CongressTrading({ active, onSelectStock }) {
  const { data, loading } = useCongressTrading(active);
  const [sortCol, setSortCol] = useState("transactionDate");
  const [sortDir, setSortDir] = useState("desc");

  const trades = useMemo(() => {
    const list = data?.trades || [];
    return [...list].sort((a, b) => {
      let aVal, bVal;
      switch (sortCol) {
        case "transactionDate":
          aVal = new Date(a.transactionDate || 0).getTime();
          bVal = new Date(b.transactionDate || 0).getTime();
          break;
        case "politician":
          aVal = a.politician || "";
          bVal = b.politician || "";
          break;
        case "chamber":
          aVal = a.chamber || "";
          bVal = b.chamber || "";
          break;
        case "ticker":
          aVal = a.ticker || "";
          bVal = b.ticker || "";
          break;
        case "type":
          aVal = a.type || "";
          bVal = b.type || "";
          break;
        case "amount":
          aVal = a.amount || "";
          bVal = b.amount || "";
          break;
        case "filingDate":
          aVal = new Date(a.filingDate || 0).getTime();
          bVal = new Date(b.filingDate || 0).getTime();
          break;
        case "reportingDelay":
          aVal = a.reportingDelay ?? -1;
          bVal = b.reportingDelay ?? -1;
          break;
        default:
          aVal = new Date(a.transactionDate || 0).getTime();
          bVal = new Date(b.transactionDate || 0).getTime();
          break;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortDir === "asc" ? cmp : -cmp;
      }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const sortIcon = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const handleRowClick = (trade) => {
    if (trade.ticker && onSelectStock) {
      onSelectStock({
        symbol: trade.ticker,
        name: trade.assetDescription || trade.ticker,
      });
    }
  };

  if (loading && !data) {
    return (
      <div className="smartmoney-loading">
        <div className="smartmoney-loading-pulse" />
        <span>Loading congressional trading data...</span>
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="smartmoney-empty">
        <span>No recent congressional trades found</span>
      </div>
    );
  }

  return (
    <div>
      {/* Most Active Politicians */}
      {data?.mostActive?.length > 0 && (
        <div className="congress-summary-grid">
          {data.mostActive.map((p) => (
            <div
              key={`${p.politician}-${p.chamber}`}
              className="congress-summary-card"
            >
              <div className="congress-card-top">
                <span className="congress-card-name" title={p.politician}>
                  {p.politician}
                </span>
                <span
                  className={`sentiment-badge sm ${p.chamber === "Senate" ? "senate" : "house"}`}
                >
                  {p.chamber}
                </span>
              </div>
              <div className="congress-card-row">
                <span className="congress-card-label">Trades</span>
                <span className="congress-card-value">{p.count}</span>
              </div>
              <div className="congress-card-row">
                <span className="congress-card-label">Buys</span>
                <span className="congress-card-value up">{p.buys}</span>
              </div>
              <div className="congress-card-row">
                <span className="congress-card-label">Sells</span>
                <span className="congress-card-value down">{p.sells}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trades Table */}
      <div className="smartmoney-table-wrap">
        <table className="smartmoney-table">
          <thead>
            <tr>
              <th
                onClick={() => handleSort("transactionDate")}
                className={sortCol === "transactionDate" ? "sorted" : ""}
              >
                Date{sortIcon("transactionDate")}
              </th>
              <th
                onClick={() => handleSort("politician")}
                className={sortCol === "politician" ? "sorted" : ""}
              >
                Politician{sortIcon("politician")}
              </th>
              <th
                onClick={() => handleSort("chamber")}
                className={sortCol === "chamber" ? "sorted" : ""}
              >
                Chamber{sortIcon("chamber")}
              </th>
              <th
                onClick={() => handleSort("ticker")}
                className={sortCol === "ticker" ? "sorted" : ""}
              >
                Ticker{sortIcon("ticker")}
              </th>
              <th>Type</th>
              <th
                onClick={() => handleSort("amount")}
                className={sortCol === "amount" ? "sorted" : ""}
              >
                Amount{sortIcon("amount")}
              </th>
              <th
                onClick={() => handleSort("filingDate")}
                className={sortCol === "filingDate" ? "sorted" : ""}
              >
                Filed{sortIcon("filingDate")}
              </th>
              <th
                onClick={() => handleSort("reportingDelay")}
                className={sortCol === "reportingDelay" ? "sorted" : ""}
              >
                Delay{sortIcon("reportingDelay")}
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr
                key={`${trade.ticker}-${trade.politician}-${trade.transactionDate}-${i}`}
                className={trade.type === "Buy" ? "row-buy" : "row-sell"}
                onClick={() => handleRowClick(trade)}
              >
                <td className="sm-date">{trade.transactionDate}</td>
                <td className="sm-name">{trade.politician}</td>
                <td>
                  <span
                    className={`sentiment-badge sm ${trade.chamber === "Senate" ? "senate" : "house"}`}
                  >
                    {trade.chamber}
                  </span>
                </td>
                <td className="sm-symbol">{trade.ticker}</td>
                <td>
                  <span
                    className={`sentiment-badge ${trade.type === "Buy" ? "bullish" : "bearish"}`}
                  >
                    {trade.type === "Buy" ? "BUY" : "SELL"}
                  </span>
                </td>
                <td>{trade.amount}</td>
                <td className="sm-date">{trade.filingDate}</td>
                <td
                  className={`congress-delay ${delayClass(trade.reportingDelay)}`}
                >
                  {formatDelay(trade.reportingDelay)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
