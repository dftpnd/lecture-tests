import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { probeServer } from "./offline/probe";

/**
 * Custom pull-to-refresh for the installed PWA.
 *
 * The browser's native pull-to-refresh is disabled in `display-mode: standalone`,
 * so on an installed app a downward drag does nothing. This drives the gesture
 * ourselves: while the page is scrolled to the very top, dragging down slides the
 * whole app content downward, uncovering a backdrop with the panda mascot behind
 * it. Past the threshold, releasing reloads the app shell.
 *
 * The backdrop is a normal in-flow wrapper (not `position: fixed`): iOS standalone
 * PWAs frequently fail to repaint a fixed element while a sibling is
 * GPU-transformed during a touch drag. An in-flow backdrop the content slides
 * over is painted reliably.
 */

const THRESHOLD = 72; // px of pull (after resistance) needed to trigger a refresh
const MAX_PULL = 190; // clamp so the content can't be dragged arbitrarily far
const RESISTANCE = 0.5; // drag feels heavier than the finger travels

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to re-mount the app offline

  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const armed = useRef(false); // we've committed to owning this gesture
  const busy = useRef(false); // a refresh is in flight; ignore further gestures

  useEffect(() => {
    const setDist = (d: number) => {
      pullRef.current = d;
      setPull(d);
    };

    function onStart(e: TouchEvent) {
      if (busy.current || e.touches.length !== 1 || window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      armed.current = false;
    }

    function onMove(e: TouchEvent) {
      if (busy.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      // Ignore upward drags until/unless we've already armed the pull.
      if (dy <= 0 && !armed.current) return;
      // Any scroll away from the top cancels the gesture (native scroll wins).
      if (window.scrollY > 0) {
        startY.current = null;
        armed.current = false;
        setDragging(false);
        setDist(0);
        return;
      }
      if (dy > 0) {
        if (!armed.current) {
          armed.current = true;
          setDragging(true);
        }
        // We own this gesture now — stop the content from scrolling.
        e.preventDefault();
        setDist(Math.min(MAX_PULL, dy * RESISTANCE));
      }
    }

    function onEnd() {
      if (busy.current || startY.current === null) return;
      startY.current = null;
      setDragging(false);
      if (armed.current && pullRef.current >= THRESHOLD) {
        busy.current = true;
        setRefreshing(true);
        setDist(THRESHOLD); // hold at the threshold while the spinner shows
        // Let the "released" animation settle, then refresh.
        window.setTimeout(async () => {
          // A full navigation reload can strand an installed PWA (iOS in
          // particular) on the browser's "no internet" error page, with no way
          // back. `navigator.onLine` can't be trusted to avoid that — on iOS it
          // reports online on Wi-Fi with no real internet — so probe the server
          // for real before committing to a hard reload.
          if (await probeServer(3000)) {
            // Reachable: a real reload to pick up fresh data and any new bundle.
            window.location.reload();
            return;
          }
          // Unreachable: re-mount the app from the in-memory/cache state instead
          // — data hooks re-read their IndexedDB cache — and never touch the
          // network, so we can't land on Safari's error page.
          setReloadKey((k) => k + 1);
          toast("Нет соединения — показаны офлайн-данные", { duration: 2500 });
          busy.current = false;
          setRefreshing(false);
          setDist(0);
        }, 450);
      } else {
        setDist(0);
      }
      armed.current = false;
    }

    // touchmove must be non-passive so preventDefault() can suppress scrolling.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div className="relative min-h-[100dvh] bg-background">
      {/* Panda mascot over the white backdrop: pinned to the top and revealed
          from the ears down (ears → cyber-eye → nose) as the content slides
          down. Full-width, so it fills the area edge to edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden pt-[env(safe-area-inset-top)]"
        style={{ height: pull }}
      >
        <img
          src="/panda-pull.svg"
          alt=""
          className="w-full max-w-md self-start"
          style={{ opacity: progress }}
        />
        {refreshing && (
          <div className="absolute bottom-2 text-destructive">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
      </div>

      {/* The whole app; its white background slides down to uncover the red. */}
      <div
        className="relative z-10 min-h-[100dvh] bg-background"
        style={{
          transform: `translateY(${pull}px)`,
          transition: dragging ? "none" : "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
          willChange: "transform",
        }}
      >
        {/* Keyed so an offline pull-to-refresh re-mounts the tree (re-running data
            hooks off the cache) without a network navigation. */}
        <div key={reloadKey}>{children}</div>
      </div>
    </div>
  );
}
