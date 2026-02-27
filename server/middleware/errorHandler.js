export function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${err.message}`);

  const status = err.status || 500;

  let code = "server_error";
  let message = "Something went wrong — try again";

  if (status === 429) {
    code = "rate_limited";
    message = "Too many requests — please wait a moment";
  } else if (status === 404) {
    code = "not_found";
    message = "Symbol not found";
  } else if (status === 400) {
    code = "bad_request";
    message = "Invalid request";
  } else if (status === 502 || status === 503 || status === 504) {
    code = "upstream_down";
    message = "Market data temporarily unavailable";
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(process.env.NODE_ENV !== "production" && { detail: err.message }),
    },
  });
}
