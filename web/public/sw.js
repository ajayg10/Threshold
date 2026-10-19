// Minimal service worker: makes Threshold installable. No caching: visitor data must always be live,
// and offline support is not a goal.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
