"use client";
import { useEffect } from "react";

/** Registers the offline service worker. Production only: in development it would serve stale code. */
export function OfflineReady() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
