// Yahoo Finance crumb+cookie authentication
// Required for v7/v10 endpoints (options, quoteSummary, quote)

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let cachedCrumb = null;
let cachedCookie = null;
let crumbExpiry = 0;
let pendingCrumbPromise = null; // mutex: only one crumb fetch at a time
const CRUMB_TTL = 55 * 60 * 1000; // 55 minutes (Yahoo cookies last ~1hr)

// Retry with exponential backoff for 429 rate limiting
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fn();
    if (res.status !== 429 || attempt === maxRetries) return res;
    const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s, 8s
    await new Promise(r => setTimeout(r, delay));
  }
}

export async function getYahooCrumb() {
  // Return cached crumb if still valid
  if (cachedCrumb && cachedCookie && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  // Mutex: if another request is already fetching, wait for it
  if (pendingCrumbPromise) {
    return pendingCrumbPromise;
  }

  pendingCrumbPromise = _fetchCrumb();
  try {
    return await pendingCrumbPromise;
  } finally {
    pendingCrumbPromise = null;
  }
}

async function _fetchCrumb() {
  // Step 1: Hit fc.yahoo.com to get the A3 session cookie
  const initRes = await withRetry(() => fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  }));

  // Extract Set-Cookie header (A3 cookie)
  const setCookies = initRes.headers.getSetCookie?.() || [];
  let cookie = '';
  for (const sc of setCookies) {
    const match = sc.match(/^([^;]+)/);
    if (match) cookie += (cookie ? '; ' : '') + match[1];
  }

  // Fallback: try raw header
  if (!cookie) {
    const raw = initRes.headers.get('set-cookie') || '';
    const parts = raw.split(',').map(s => s.trim().split(';')[0]).filter(Boolean);
    cookie = parts.join('; ');
  }

  if (!cookie) {
    throw new Error('Failed to get Yahoo session cookie');
  }

  // Step 2: Get crumb using the cookie
  const crumbRes = await withRetry(() => fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
    },
    signal: AbortSignal.timeout(8000),
  }));

  if (!crumbRes.ok) {
    throw new Error(`Failed to get crumb: ${crumbRes.status}`);
  }

  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes('error')) {
    throw new Error('Invalid crumb received');
  }

  cachedCrumb = crumb.trim();
  cachedCookie = cookie;
  crumbExpiry = Date.now() + CRUMB_TTL;

  return { crumb: cachedCrumb, cookie: cachedCookie };
}

// Helper: fetch from Yahoo with crumb auth, returns raw Response object
export async function yahooFetchRaw(url, options = {}) {
  const { crumb, cookie } = await getYahooCrumb();
  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

  const res = await withRetry(() => fetch(fullUrl, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
      ...(options.headers || {}),
    },
  }));

  if ((res.status === 401 || res.status === 403) && crumbExpiry > 0) {
    crumbExpiry = 0;
    const fresh = await getYahooCrumb();
    const retryUrl = `${url}${separator}crumb=${encodeURIComponent(fresh.crumb)}`;
    return withRetry(() => fetch(retryUrl, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': fresh.cookie,
        ...(options.headers || {}),
      },
    }));
  }

  return res;
}

// Helper: fetch from Yahoo with crumb auth, returns parsed JSON
export async function yahooAuthFetch(url) {
  const { crumb, cookie } = await getYahooCrumb();
  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

  const res = await withRetry(() => fetch(fullUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
    },
    signal: AbortSignal.timeout(12000),
  }));

  if (!res.ok) {
    // If 401/403, invalidate cache and retry once
    if ((res.status === 401 || res.status === 403) && crumbExpiry > 0) {
      crumbExpiry = 0;
      const fresh = await getYahooCrumb();
      const retryUrl = `${url}${separator}crumb=${encodeURIComponent(fresh.crumb)}`;
      const retryRes = await withRetry(() => fetch(retryUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Cookie': fresh.cookie,
        },
        signal: AbortSignal.timeout(12000),
      }));
      if (!retryRes.ok) throw new Error(`Yahoo API returned ${retryRes.status}`);
      return retryRes.json();
    }
    throw new Error(`Yahoo API returned ${res.status}`);
  }

  return res.json();
}
