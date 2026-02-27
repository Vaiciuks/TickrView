/**
 * Fetch wrapper with automatic retry and exponential backoff.
 * Only retries on network errors and retriable HTTP status codes (429, 5xx).
 * Respects AbortSignal — aborted requests stop retrying immediately.
 */
export async function retryFetch(url, options = {}, { maxRetries = 2, baseDelay = 1000 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      // Don't retry client errors (4xx) except 429 (rate limited)
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Retriable server error (5xx) or rate limit (429)
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Abort errors should not be retried
      if (err.name === "AbortError") throw err;
      lastError = err;
    }

    // Don't delay after the last attempt
    if (attempt < maxRetries) {
      // Check if aborted before waiting
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Check again after waiting
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
  }

  throw lastError;
}
