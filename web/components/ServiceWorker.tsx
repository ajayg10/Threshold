"use client";

import { useEffect } from "react";

/** Registers the minimal service worker that makes Threshold installable (offline is not a goal). */
export default function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* installability is a nice-to-have */
      });
    }
  }, []);
  return null;
}
