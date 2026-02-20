import { Router } from 'express';
import { withCache } from '../middleware/cache.js';
import { fetchQuote } from '../lib/yahooFetch.js';

const router = Router();

router.get('/:symbol', withCache(2), async (req, res, next) => {
  try {
    const { symbol } = req.params;

    if (!/^[\^A-Z0-9.\-=]{1,12}$/i.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const quote = await fetchQuote(symbol);
    res.json(quote);
  } catch (error) {
    next(error);
  }
});

export default router;
