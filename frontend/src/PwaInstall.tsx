import { useEffect, useState } from "react";
import { Smartphone, Share } from "lucide-react";

// The browser's deferred install prompt (Chromium "beforeinstallprompt").
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Already launched from the home screen? Then there is nothing to advertise.
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes its own non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac but is still touch-based.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

const hint = "inline-flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground";

/** Footer hint that tells users they can install the app to their home screen. */
export function PwaInstall() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault(); // keep the event so we can trigger it from our own button
      setDeferred(e as InstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  }

  return (
    <div className="mt-8 py-4">
      {deferred ? (
        // Chromium (Android/desktop) gave us a real install prompt — offer a button.
        <p className={hint}>
          <Smartphone className="size-3.5" />
          <button type="button" onClick={install} className="text-primary underline-offset-4 hover:underline">
            Установить приложение
          </button>{" "}
          на домашний экран для быстрого доступа.
        </p>
      ) : isIOS() ? (
        <p className={hint}>
          <Share className="size-3.5" /> Установите приложение на iPhone: нажмите «Поделиться», затем «На экран „Домой“».
        </p>
      ) : isAndroid() ? (
        <p className={hint}>
          <Smartphone className="size-3.5" /> Установите приложение на Android: меню браузера (⋮) → «Установить приложение».
        </p>
      ) : (
        <p className={hint}>
          <Smartphone className="size-3.5" /> Приложение можно установить на телефон (iPhone и Android) и на компьютер — через меню браузера.
        </p>
      )}
    </div>
  );
}
