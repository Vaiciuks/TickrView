const isProd = import.meta.env.PROD;

// Dashboard: full screener refresh + burst of all quotes
export const REFRESH_INTERVAL = isProd ? 60_000 : 20_000;

// Dashboard: individual quote polling between refreshes
export const QUOTE_POLL_MS = isProd ? 2_000 : 1_000;

// Dashboard: stagger between burst quote fetches
export const BURST_STAGGER_MS = isProd ? 100 : 100;

// Expanded chart: multiply refreshMs values
export const CHART_REFRESH_FACTOR = 1;
