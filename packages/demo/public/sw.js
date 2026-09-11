importScripts("/controller/controller.sw.js");

// Take control of all open clients immediately so fetch events fire
// for the current page without requiring a reload.
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

addEventListener("fetch", (e) => {
	try {
		if ($scramjetController.shouldRoute(e)) {
			e.respondWith($scramjetController.route(e));
		}
	} catch (_) {
		// If routing throws (e.g. controller not yet initialised), fall through to network.
	}
});
