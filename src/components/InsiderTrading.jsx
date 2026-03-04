import { useState, useMemo } from "react";
import { useInsiderTrading } from "../hooks/useInsiderTrading.js";

function formatValue(val) {
  if (!val) return "$0";
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatQty(qty) {
  if (!qty) return "0";
  if (Math.abs(qty) >= 1_000_000) return `${(qty / 1_000_000).toFixed(1)}M`;
  if (Math.abs(qty) >= 1_000) return `${(qty / 1_000).toFixed(1)}K`;
  return qty.toLocaleString();
}

export default function InsiderTrading({ active, onSelectStock }) {
  const { data, loading } = useInsiderTrading(active);
  const [sortCol, setSortCol] = useState("value");
  const [sortDir, setSortDir] = useState("desc");

  const trades = useMemo(() => {
    const list = data?.trades || [];
    return [...list].sort((a, b) => {
      let aVal, bVal;
      switch (sortCol) {
        case "filingDate":
          aVal = new Date(a.tradeDate || a.filingDate || 0).getTime();
          bVal = new Date(b.tradeDate || b.filingDate || 0).getTime();
          break;
        case "symbol":
          aVal = a.symbol || "";
          bVal = b.symbol || "";
          break;
        case "insiderName":
          aVal = a.insiderName || "";
          bVal = b.insiderName || "";
          break;
        case "price":
          aVal = a.price || 0;
          bVal = b.price || 0;
          break;
        case "qty":
          aVal = Math.abs(a.qty || 0);
          bVal = Math.abs(b.qty || 0);
          break;
        case "value":
        default:
          aVal = a.value || 0;
          bVal = b.value || 0;
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
    if (trade.symbol && onSelectStock) {
      onSelectStock({ symbol: trade.symbol, name: trade.insiderName });
    }
  };

  if (loading && !data) {
    return (
      <div className="smartmoney-loading">
        <div className="smartmoney-loading-pulse" />
        <span>Loading insider trading data...</span>
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="smartmoney-empty">
        <span>No recent insider trades found</span>
      </div>
    );
  }

  return (
    <div className="smartmoney-table-wrap">
      <table className="smartmoney-table">
        <thead>
          <tr>
            <th
              onClick={() => handleSort("filingDate")}
              className={sortCol === "filingDate" ? "sorted" : ""}
            >
              Date{sortIcon("filingDate")}
            </th>
            <th
              onClick={() => handleSort("symbol")}
              className={sortCol === "symbol" ? "sorted" : ""}
            >
              Symbol{sortIcon("symbol")}
            </th>
            <th
              onClick={() => handleSort("insiderName")}
              className={sortCol === "insiderName" ? "sorted" : ""}
            >
              Insider{sortIcon("insiderName")}
            </th>
            <th>Title</th>
            <th>Type</th>
            <th
              onClick={() => handleSort("price")}
              className={sortCol === "price" ? "sorted" : ""}
            >
              Price{sortIcon("price")}
            </th>
            <th
              onClick={() => handleSort("qty")}
              className={sortCol === "qty" ? "sorted" : ""}
            >
              Qty{sortIcon("qty")}
            </th>
            <th
              onClick={() => handleSort("value")}
              className={sortCol === "value" ? "sorted" : ""}
            >
              Value{sortIcon("value")}
            </th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => (
            <tr
              key={`${trade.symbol}-${trade.filingDate}-${i}`}
              className={trade.isBuy ? "row-buy" : "row-sell"}
              onClick={() => handleRowClick(trade)}
            >
              <td className="sm-date">{trade.tradeDate || trade.filingDate}</td>
              <td className="sm-symbol">{trade.symbol}</td>
              <td className="sm-name">{trade.insiderName}</td>
              <td className="sm-title">{trade.title}</td>
              <td>
                <span
                  className={`sentiment-badge ${trade.isBuy ? "bullish" : "bearish"}`}
                >
                  {trade.isBuy ? "BUY" : "SELL"}
                </span>
              </td>
              <td>${trade.price.toFixed(2)}</td>
              <td>{formatQty(trade.qty)}</td>
              <td className="value-highlight">{formatValue(trade.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
