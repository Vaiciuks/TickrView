import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import app from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  const htmlPath = path.join(distDir, 'index.html');

  // Cache the HTML template
  let htmlTemplate = null;
  function getTemplate() {
    if (!htmlTemplate) {
      htmlTemplate = fs.readFileSync(htmlPath, 'utf-8');
    }
    return htmlTemplate;
  }

  // Cache stock page HTML for 5 minutes
  const stockPageCache = new Map();
  const STOCK_CACHE_TTL = 5 * 60 * 1000;

  app.use(express.static(distDir, {
    maxAge: '1d',
    etag: true,
  }));

  // SEO stock pages: /stock/:symbol with dynamic meta tags
  app.get('/stock/:symbol', async (req, res) => {
    const { symbol } = req.params;

    if (!/^[\^A-Za-z0-9.\-=]{1,12}$/.test(symbol)) {
      return res.sendFile(htmlPath);
    }

    const upperSymbol = symbol.toUpperCase();
    const now = Date.now();

    // Check cache
    const cached = stockPageCache.get(upperSymbol);
    if (cached && now - cached.time < STOCK_CACHE_TTL) {
      return res.set('Content-Type', 'text/html').send(cached.html);
    }

    try {
      const { fetchQuote } = await import('./lib/yahooFetch.js');
      const quote = await fetchQuote(upperSymbol);

      let html = getTemplate();

      const stockName = quote.name || upperSymbol;
      const price = quote.price?.toFixed(2) || '';
      const changeSign = quote.change >= 0 ? '+' : '';
      const change = quote.change?.toFixed(2) || '';
      const changePct = quote.changePercent?.toFixed(2) || '';
      const title = `${upperSymbol} (${stockName}) Stock Price $${price} ${changeSign}${changePct}% | TickrView`;
      const description = `${stockName} (${upperSymbol}) stock price is $${price} (${changeSign}$${Math.abs(parseFloat(change) || 0).toFixed(2)}, ${changeSign}${changePct}%). View real-time charts, key statistics, insider trading, and more on TickrView.`;
      const url = `https://tickrview.com/stock/${upperSymbol}`;

      html = html
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
        .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escapeHtml(description)}"`)
        .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(title)}"`)
        .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(description)}"`)
        .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`)
        .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escapeHtml(title)}"`)
        .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escapeHtml(description)}"`)
        .replace('</head>', `  <link rel="canonical" href="${url}" />\n  </head>`);

      stockPageCache.set(upperSymbol, { html, time: now });

      // Clean old cache entries periodically
      if (stockPageCache.size > 500) {
        for (const [key, val] of stockPageCache) {
          if (now - val.time > STOCK_CACHE_TTL) stockPageCache.delete(key);
        }
      }

      res.set('Content-Type', 'text/html').send(html);
    } catch (err) {
      console.error(`[stock-page] Meta injection failed for ${upperSymbol}:`, err.message);
      res.sendFile(htmlPath);
    }
  });

  app.get('*', (req, res) => {
    res.sendFile(htmlPath);
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
