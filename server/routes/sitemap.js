import { Router } from 'express';

const router = Router();

// Curated stock universe for sitemap (S&P 500 large-caps + ETFs + crypto)
const SITEMAP_SYMBOLS = [
  // Technology
  'MSFT', 'ORCL', 'CRM', 'NOW', 'PLTR', 'INTU', 'ADBE', 'PANW', 'SNPS', 'CDNS',
  'CRWD', 'FTNT', 'NVDA', 'AVGO', 'AMD', 'QCOM', 'TXN', 'INTC', 'MU', 'NXPI',
  'AMAT', 'LRCX', 'KLAC', 'AAPL', 'DELL', 'ACN', 'IBM', 'ADP', 'CSCO', 'ANET',
  // Communication Services
  'GOOGL', 'META', 'NFLX', 'DIS', 'EA', 'TTWO', 'TMUS', 'VZ', 'T', 'CMCSA', 'UBER',
  // Consumer Cyclical
  'AMZN', 'TSLA', 'GM', 'F', 'HD', 'LOW', 'MCD', 'SBUX', 'CMG', 'BKNG', 'ABNB',
  'TJX', 'NKE', 'ORLY', 'ROST',
  // Consumer Defensive
  'WMT', 'COST', 'PG', 'CL', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'KR', 'HSY', 'SYY', 'ADM', 'STZ',
  // Healthcare
  'LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'BMY', 'AMGN', 'GILD', 'UNH', 'CI', 'CVS',
  'TMO', 'ABT', 'DHR', 'SYK', 'BSX', 'MDT',
  // Financial
  'JPM', 'BAC', 'WFC', 'C', 'USB', 'PNC', 'V', 'MA', 'AXP', 'COF',
  'GS', 'MS', 'BX', 'BLK', 'SCHW', 'CB', 'PGR', 'TRV',
  // Industrials
  'GE', 'RTX', 'LMT', 'BA', 'GD', 'NOC', 'HON', 'CAT', 'DE', 'UNP', 'CSX', 'NSC',
  'WM', 'UPS', 'FDX',
  // Energy
  'XOM', 'CVX', 'COP', 'EOG', 'OXY', 'FANG', 'HES', 'MPC', 'PSX', 'VLO', 'SLB',
  // Real Estate
  'AMT', 'EQIX', 'CCI', 'DLR', 'PLD', 'SPG', 'O', 'WELL',
  // Utilities
  'NEE', 'SO', 'DUK', 'AEP', 'SRE', 'D', 'EXC', 'XEL', 'ED', 'CEG',
  // Basic Materials
  'LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'NUE', 'STLD', 'DOW', 'DD',
  // Popular ETFs
  'SPY', 'QQQ', 'DIA', 'IWM', 'VOO', 'VTI', 'ARKK',
  // Popular Crypto
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD',
];

let cachedSitemap = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

router.get('/', (req, res) => {
  const now = Date.now();
  if (!cachedSitemap || now - cacheTime > CACHE_TTL) {
    const today = new Date().toISOString().split('T')[0];
    const urls = [
      `  <url>\n    <loc>https://tickrview.com/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n    <lastmod>${today}</lastmod>\n  </url>`,
      ...SITEMAP_SYMBOLS.map(sym =>
        `  <url>\n    <loc>https://tickrview.com/stock/${encodeURIComponent(sym)}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n    <lastmod>${today}</lastmod>\n  </url>`
      ),
    ];
    cachedSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    cacheTime = now;
  }
  res.set('Content-Type', 'application/xml');
  res.send(cachedSitemap);
});

export default router;
