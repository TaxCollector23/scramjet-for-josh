importScripts("/controller/controller.sw.js");

// Force new SW to activate immediately, replacing any stale old version.
self.addEventListener("install", () => self.skipWaiting());

// Take control of all open tabs right away so fetch interception works
// on the current page without requiring a reload.
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

self.addEventListener("fetch", (e) => {
	try {
		if ($scramjetController.shouldRoute(e)) {
			e.respondWith($scramjetController.route(e));
		}
	} catch (_) {
		// Controller not yet initialised — fall through to network.
	}
});
