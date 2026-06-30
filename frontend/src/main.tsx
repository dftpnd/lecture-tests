import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    <Toaster />
  </React.StrictMode>,
);

// Register the PWA service worker (offline shell + "Add to Home Screen").
if ("serviceWorker" in navigator) {
  // When a freshly-installed worker takes control (it calls skipWaiting +
  // clients.claim), reload once so the open app swaps to the new bundle instead
  // of running stale JS until the next manual relaunch.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      // Proactively check for a new worker on each launch so PWA updates roll
      // out without waiting for the browser's periodic check.
      .then((reg) => reg.update())
      .catch(() => {
        /* service worker is a progressive enhancement; ignore failures */
      });
  });
}
