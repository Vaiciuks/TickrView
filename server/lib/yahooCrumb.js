// Yahoo Finance crumb+cookie authentication
// Required for v7/v10 endpoints (options, quoteSummary, quote)

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let cachedCrumb = null;
let cachedCookie = null;
let crumbExpiry = 0;
const CRUMB_TTL = 30 * 60 * 1000; // 30 minutes

export async function getYahooCrumb() {
  if (cachedCrumb && cachedCookie && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  // Step 1: Hit fc.yahoo.com to get the A3 session cookie
  const initRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });

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
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
    },
    signal: AbortSignal.timeout(8000),
  });

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

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
      ...(options.headers || {}),
    },
  });

  if ((res.status === 401 || res.status === 403) && crumbExpiry > 0) {
    crumbExpiry = 0;
    const fresh = await getYahooCrumb();
    const retryUrl = `${url}${separator}crumb=${encodeURIComponent(fresh.crumb)}`;
    return fetch(retryUrl, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': fresh.cookie,
        ...(options.headers || {}),
      },
    });
  }

  return res;
}

// Helper: fetch from Yahoo with crumb auth, returns parsed JSON
export async function yahooAuthFetch(url) {
  const { crumb, cookie } = await getYahooCrumb();
  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

  const res = await fetch(fullUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    // If 401/403, invalidate cache and retry once
    if ((res.status === 401 || res.status === 403) && crumbExpiry > 0) {
      crumbExpiry = 0;
      const fresh = await getYahooCrumb();
      const retryUrl = `${url}${separator}crumb=${encodeURIComponent(fresh.crumb)}`;
      const retryRes = await fetch(retryUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Cookie': fresh.cookie,
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!retryRes.ok) throw new Error(`Yahoo API returned ${retryRes.status}`);
      return retryRes.json();
    }
    throw new Error(`Yahoo API returned ${res.status}`);
  }

  return res.json();
}
