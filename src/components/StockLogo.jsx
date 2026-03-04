import { useState } from "react";

const LOGO_SOURCES = [
  (s) => `https://assets.parqet.com/logos/symbol/${s}`,
  (s) => `https://financialmodelingprep.com/image-stock/${s}.png`,
  (s) => `https://companiesmarketcap.com/img/company-logos/64/${s}.webp`,
  (s) => `https://universal.hellopublic.com/companyLogos/${s}@3x.png`,
];

// Known symbols that need custom abbreviations + colors (futures, indices, crypto, commodities)
const SYMBOL_ICONS = {
  // Index futures
  "ES=F": { abbr: "S&P", color: "#5B8DEF" },
  "NQ=F": { abbr: "NDX", color: "#61AFEF" },
  "YM=F": { abbr: "DOW", color: "#C678DD" },
  "RTY=F": { abbr: "RUT", color: "#56B6C2" },
  // Energy
  "CL=F": { abbr: "OIL", color: "#D19A66" },
  "BZ=F": { abbr: "BRT", color: "#D19A66" },
  "NG=F": { abbr: "GAS", color: "#E5C07B" },
  "RB=F": { abbr: "RB", color: "#D19A66" },
  "HO=F": { abbr: "HO", color: "#D19A66" },
  // Metals
  "GC=F": { abbr: "GOLD", color: "#E5C07B" },
  "SI=F": { abbr: "SLVR", color: "#8A8A9A" },
  "HG=F": { abbr: "CPR", color: "#BE5046" },
  "PL=F": { abbr: "PLAT", color: "#7C8DA5" },
  "PA=F": { abbr: "PALL", color: "#7C8DA5" },
  // Bonds
  "ZB=F": { abbr: "TBND", color: "#56B6C2" },
  "ZN=F": { abbr: "10Y", color: "#56B6C2" },
  "ZF=F": { abbr: "5Y", color: "#56B6C2" },
  // Agriculture
  "ZC=F": { abbr: "CORN", color: "#E5C07B" },
  "ZS=F": { abbr: "SOY", color: "#98C379" },
  "ZW=F": { abbr: "WHEA", color: "#E5C07B" },
  "KC=F": { abbr: "COFF", color: "#BE5046" },
  "CC=F": { abbr: "COCO", color: "#BE5046" },
  "SB=F": { abbr: "SUGR", color: "#E06C75" },
  "CT=F": { abbr: "COTN", color: "#7C8DA5" },
  "OJ=F": { abbr: "OJ", color: "#D19A66" },
  "LE=F": { abbr: "CATL", color: "#BE5046" },
  "HE=F": { abbr: "HOGS", color: "#E06C75" },
  "LBS=F": { abbr: "LMBR", color: "#D19A66" },
  // Volatility
  "^VIX": { abbr: "VIX", color: "#E06C75" },
  // Crypto futures
  "BTC=F": { abbr: "BTC", color: "#F7931A" },
  "ETH=F": { abbr: "ETH", color: "#627EEA" },
  // Crypto spot
  "BTC-USD": { abbr: "BTC", color: "#F7931A" },
  "ETH-USD": { abbr: "ETH", color: "#627EEA" },
  "SOL-USD": { abbr: "SOL", color: "#9945FF" },
  "XRP-USD": { abbr: "XRP", color: "#23292F" },
  "DOGE-USD": { abbr: "DOGE", color: "#C3A634" },
  "ADA-USD": { abbr: "ADA", color: "#0033AD" },
  "AVAX-USD": { abbr: "AVAX", color: "#E84142" },
  "DOT-USD": { abbr: "DOT", color: "#E6007A" },
  "MATIC-USD": { abbr: "MATIC", color: "#8247E5" },
  "LINK-USD": { abbr: "LINK", color: "#2A5ADA" },
  "UNI-USD": { abbr: "UNI", color: "#FF007A" },
  // Major indices
  "^GSPC": { abbr: "S&P", color: "#5B8DEF" },
  "^DJI": { abbr: "DOW", color: "#C678DD" },
  "^IXIC": { abbr: "NDQ", color: "#61AFEF" },
  "^RUT": { abbr: "RUT", color: "#56B6C2" },
  "^FTSE": { abbr: "FTSE", color: "#5B8DEF" },
  "^GDAXI": { abbr: "DAX", color: "#D19A66" },
  "^FCHI": { abbr: "CAC", color: "#5B8DEF" },
  "^STOXX50E": { abbr: "EU50", color: "#5B8DEF" },
  "^IBEX": { abbr: "IBEX", color: "#D19A66" },
  "^N225": { abbr: "NKEI", color: "#E06C75" },
  "^HSI": { abbr: "HSI", color: "#E06C75" },
  "^000001.SS": { abbr: "SSEC", color: "#E06C75" },
  "^KS11": { abbr: "KOPI", color: "#56B6C2" },
  "^STI": { abbr: "STI", color: "#98C379" },
  "^GSPTSE": { abbr: "TSX", color: "#E06C75" },
  "^BVSP": { abbr: "BVSP", color: "#98C379" },
  "^AXJO": { abbr: "ASX", color: "#5B8DEF" },
  // Forex
  "EURUSD=X": { abbr: "EUR", color: "#5B8DEF" },
  "GBPUSD=X": { abbr: "GBP", color: "#C678DD" },
  "USDJPY=X": { abbr: "JPY", color: "#E06C75" },
  "DX-Y.NYB": { abbr: "DXY", color: "#98C379" },
};

// Deterministic color from symbol string
const COLORS = [
  "#5B8DEF",
  "#E06C75",
  "#61AFEF",
  "#C678DD",
  "#56B6C2",
  "#D19A66",
  "#98C379",
  "#E5C07B",
  "#BE5046",
  "#7C8DA5",
];

function getColor(symbol) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Check if a symbol is a "special" type that shouldn't try CDN logos
function isSpecialSymbol(symbol) {
  if (!symbol) return false;
  return (
    symbol.includes("=") || symbol.startsWith("^") || symbol.includes("-USD")
  );
}

export default function StockLogo({ symbol, size = 28 }) {
  const [sourceIdx, setSourceIdx] = useState(0);
  const override = SYMBOL_ICONS[symbol];
  const isSpecial = isSpecialSymbol(symbol);

  // For futures, indices, crypto, etc. — always show styled abbreviation
  if (isSpecial || override) {
    const abbr =
      override?.abbr || (symbol || "?").replace(/[=^]/g, "").slice(0, 3);
    const color = override?.color || getColor(symbol || "");
    const fontSize =
      size * (abbr.length > 3 ? 0.3 : abbr.length > 2 ? 0.34 : 0.42);
    return (
      <span
        className="stock-logo stock-logo-fallback"
        style={{ width: size, height: size, fontSize, background: color }}
      >
        {abbr}
      </span>
    );
  }

  // For regular stocks, try logo CDNs with fallback
  if (sourceIdx >= LOGO_SOURCES.length) {
    // All sources failed — show letter fallback
    const letter = (symbol || "?")[0];
    const color = getColor(symbol || "");
    return (
      <span
        className="stock-logo stock-logo-fallback"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.44,
          background: color,
        }}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      className="stock-logo"
      src={LOGO_SOURCES[sourceIdx](symbol)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setSourceIdx((i) => i + 1)}
    />
  );
}
