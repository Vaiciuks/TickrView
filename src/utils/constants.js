const isProd = import.meta.env.PROD;

// Dashboard: full screener refresh + burst of all quotes
export const REFRESH_INTERVAL = isProd ? 60_000 : 20_000;

// Dashboard: batch quote polling (all stocks updated per call)
export const QUOTE_POLL_MS = isProd ? 5_000 : 3_000;

// Expanded chart: multiply refreshMs values
export const CHART_REFRESH_FACTOR = 1;
