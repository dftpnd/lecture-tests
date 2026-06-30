import { useEffect, useState } from "react";
import { Anchor, Box, Text } from "@mantine/core";
import { IconDeviceMobile, IconShare } from "@tabler/icons-react";

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
    <Box ta="center" py="md" mt="xl">
      {deferred ? (
        // Chromium (Android/desktop) gave us a real install prompt — offer a button.
        <Text size="sm" c="dimmed">
          <IconDeviceMobile size={14} style={{ verticalAlign: "-2px" }} />{" "}
          <Anchor component="button" type="button" onClick={install}>
            Установить приложение
          </Anchor>{" "}
          на домашний экран для быстрого доступа.
        </Text>
      ) : isIOS() ? (
        <Text size="sm" c="dimmed">
          <IconShare size={14} style={{ verticalAlign: "-2px" }} /> Установите приложение на iPhone:
          нажмите «Поделиться», затем «На экран „Домой“».
        </Text>
      ) : isAndroid() ? (
        <Text size="sm" c="dimmed">
          <IconDeviceMobile size={14} style={{ verticalAlign: "-2px" }} /> Установите приложение на
          Android: меню браузера (⋮) → «Установить приложение».
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          <IconDeviceMobile size={14} style={{ verticalAlign: "-2px" }} /> Приложение можно установить
          на телефон (iPhone и Android) и на компьютер — через меню браузера.
        </Text>
      )}
    </Box>
  );
}
