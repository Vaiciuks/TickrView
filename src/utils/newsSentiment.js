// Lightweight keyword-based sentiment scorer for news headlines.
// Cheap, deterministic, runs on the client — no LLM call required.
// Returns "bullish" | "bearish" | "neutral".

const BULL = [
  "surge", "surges", "soar", "soars", "soared", "rally", "rallies", "rallied",
  "jump", "jumps", "jumped", "climb", "climbs", "climbed", "gain", "gains", "gained",
  "beat", "beats", "tops", "top", "topped", "crushes", "crushed", "smashes", "smashed",
  "rise", "rises", "rose", "hike", "hikes", "boost", "boosts", "boosted",
  "record high", "all-time high", "52-week high", "ath",
  "upgrade", "upgrades", "upgraded", "raises", "raised", "raise",
  "outperform", "outperforms", "outperformed", "buy rating",
  "bullish", "breakout", "breaks out", "momentum", "strong",
  "profit", "profits", "profitable", "revenue growth", "revenue beat",
  "approval", "approved", "green light", "partnership", "deal", "acquires", "acquisition",
  "dividend hike", "buyback", "repurchase", "positive",
];

const BEAR = [
  "plunge", "plunges", "plunged", "slump", "slumps", "slumped",
  "crash", "crashes", "crashed", "tumble", "tumbles", "tumbled",
  "sink", "sinks", "sank", "drop", "drops", "dropped",
  "fall", "falls", "fell", "slide", "slides", "slid",
  "miss", "missed", "misses", "disappoint", "disappointed", "disappoints", "disappointing",
  "downgrade", "downgrades", "downgraded", "cut", "cuts", "slash", "slashed",
  "underperform", "underperforms", "sell rating",
  "bearish", "breakdown", "weak", "weakness", "concerns", "fears",
  "loss", "losses", "unprofitable", "revenue miss",
  "lawsuit", "sued", "suing", "sec probe", "investigation", "fraud",
  "recall", "recalls", "delist", "delisting", "bankruptcy", "bankrupt",
  "layoff", "layoffs", "layoffs", "fire", "fired", "resigns", "resigned",
  "warn", "warns", "warning", "negative", "guidance cut", "guides lower",
  "halts", "halted", "suspended",
];

// Regex once, cached — word boundary for single words, phrase match for compounds.
function buildRegex(list) {
  const escaped = list.map((w) =>
    w.includes(" ") || w.includes("-")
      ? w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : `\\b${w}\\b`,
  );
  return new RegExp(escaped.join("|"), "gi");
}

const BULL_RX = buildRegex(BULL);
const BEAR_RX = buildRegex(BEAR);

export function scoreSentiment(title) {
  if (!title || typeof title !== "string") return "neutral";
  const bullCount = (title.match(BULL_RX) || []).length;
  const bearCount = (title.match(BEAR_RX) || []).length;
  const net = bullCount - bearCount;
  if (net >= 1) return "bullish";
  if (net <= -1) return "bearish";
  return "neutral";
}

// Stable hash for read-state tracking — articles don't always have IDs,
// so we key off the publisher + normalized title.
export function articleId(article) {
  const base = `${article.publisher || ""}::${(article.title || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `a${hash.toString(36)}`;
}
