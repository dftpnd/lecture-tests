import { useEffect, useRef, useState } from "react";
import { probeServer } from "./probe";

// Reachability of the API, not just the browser's online flag: the device can be
// on Wi-Fi while our server is down or unreachable. We poll a cheap health probe
// (see backend /health; nginx maps /api/ -> the API), and fall straight to
// "offline" whenever the browser itself reports no connection.
export type ServerStatus = "online" | "offline" | "checking";

const POLL_MS = 20_000; // re-probe while the tab is open

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>(navigator.onLine ? "checking" : "offline");
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      if (inFlight.current) return; // don't stack probes
      inFlight.current = true;
      // Show "checking" only when we're not already known to be online, so a
      // steady connection doesn't flicker on every poll.
      setStatus((s) => (s === "online" ? s : "checking"));
      const ok = await probeServer();
      inFlight.current = false;
      if (!cancelled) setStatus(ok ? "online" : "offline");
    }

    check();
    const interval = setInterval(check, POLL_MS);
    const onOffline = () => setStatus("offline");
    const onVisible = () => document.visibilityState === "visible" && check();
    window.addEventListener("online", check);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return status;
}
