// Reachability of the API, not just the browser's online flag. `navigator.onLine`
// lies on iOS — it reports online on Wi-Fi with no real internet (or when our
// server is down), so a "reload if online" decision based on it can strand an
// installed PWA on Safari's "not connected" error page. A real request to the
// health endpoint is the only trustworthy signal.
const HEALTH_URL = "/api/health"; // nginx maps /api/ -> the API's /health

/** True if the API answered within `timeoutMs`; a hung/failed request => false. */
export async function probeServer(timeoutMs = 5000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // no-store so we hit the network, not any HTTP cache (the SW lets /api/
    // through untouched).
    const r = await fetch(HEALTH_URL, { cache: "no-store", signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
