import express from 'express';
import compression from 'compression';
import gainersRouter from './routes/gainers.js';
import chartRouter from './routes/chart.js';
import quoteRouter from './routes/quote.js';
import quotesRouter from './routes/quotes.js';
import searchRouter from './routes/search.js';
import losersRouter from './routes/losers.js';
import trendingRouter from './routes/trending.js';
import futuresRouter from './routes/futures.js';
import indicesRouter from './routes/indices.js';
import cryptoRouter from './routes/crypto.js';
import chartsRouter from './routes/charts.js';
import newsRouter from './routes/news.js';
import marketNewsRouter from './routes/marketNews.js';
import digestRouter from './routes/digest.js';
import heatmapRouter from './routes/heatmap.js';
import earningsRouter from './routes/earnings.js';
import statsRouter from './routes/stats.js';
import economicCalendarRouter from './routes/economicCalendar.js';
import moversRouter from './routes/movers.js';
import screenerRouter from './routes/screener.js';
import contactRouter from './routes/contact.js';
import userRouter from './routes/user.js';
import insiderTradingRouter from './routes/insiderTrading.js';
import optionsFlowRouter from './routes/optionsFlow.js';
import shortInterestRouter from './routes/shortInterest.js';
import earningsLookupRouter from './routes/earningsLookup.js';
import congressTradingRouter from './routes/congressTrading.js';
import govContractsRouter from './routes/govContracts.js';
import lobbyingRouter from './routes/lobbying.js';
import darkPoolRouter from './routes/darkPool.js';
import wsbRouter from './routes/wsb.js';
import sitemapRouter from './routes/sitemap.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(compression());
app.use(express.json());

app.use('/api/user', userRouter);
app.use('/api/gainers', gainersRouter);
app.use('/api/losers', losersRouter);
app.use('/api/trending', trendingRouter);
app.use('/api/futures', futuresRouter);
app.use('/api/indices', indicesRouter);
app.use('/api/crypto', cryptoRouter);
app.use('/api/chart', chartRouter);
app.use('/api/charts', chartsRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/search', searchRouter);
app.use('/api/news', newsRouter);
app.use('/api/market-news', marketNewsRouter);
app.use('/api/digest', digestRouter);
app.use('/api/heatmap', heatmapRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/economic-calendar', economicCalendarRouter);
app.use('/api/movers', moversRouter);
app.use('/api/screener', screenerRouter);
app.use('/api/contact', contactRouter);
app.use('/api/insider-trading', insiderTradingRouter);
app.use('/api/options-flow', optionsFlowRouter);
app.use('/api/short-interest', shortInterestRouter);
app.use('/api/earnings-lookup', earningsLookupRouter);
app.use('/api/congress-trading', congressTradingRouter);
app.use('/api/gov-contracts', govContractsRouter);
app.use('/api/lobbying', lobbyingRouter);
app.use('/api/dark-pool', darkPoolRouter);
app.use('/api/wsb', wsbRouter);
app.use('/sitemap.xml', sitemapRouter);

// Diagnostic endpoint — tests Yahoo connectivity from server
app.get('/api/health', async (req, res) => {
  const results = {};
  try {
    const { getYahooCrumb, USER_AGENT } = await import('./lib/yahooCrumb.js');

    // Test 1: Can we get a crumb?
    try {
      const { crumb, cookie } = await getYahooCrumb();
      results.crumb = { ok: true, crumbLength: crumb.length };
    } catch (e) {
      results.crumb = { ok: false, error: e.message };
    }

    // Test 2: Can we hit the batch quote API?
    try {
      const { fetchBatchQuotes } = await import('./lib/yahooFetch.js');
      const quotes = await fetchBatchQuotes(['AAPL']);
      results.batchQuote = { ok: quotes.has('AAPL'), price: quotes.get('AAPL')?.price || null };
    } catch (e) {
      results.batchQuote = { ok: false, error: e.message };
    }

    // Test 3: Can we hit the chart API?
    try {
      const chartRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d', {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      results.chartApi = { ok: chartRes.ok, status: chartRes.status };
    } catch (e) {
      results.chartApi = { ok: false, error: e.message };
    }
  } catch (e) {
    results.importError = e.message;
  }
  res.json(results);
});

app.use(errorHandler);

export default app;
