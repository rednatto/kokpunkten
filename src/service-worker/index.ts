// Caches the app shell so recipes open in the kitchen without a connection.
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `kokpunkten-${version}`;
// The site may live under a sub-path (GitHub Pages: /kokpunkten/), and the manifest paths are relative to it.
const BASE = new URL('./', sw.location.href).pathname;
const SHELL = `${BASE}index.html`;
const ASSETS = [...immutable, ...assets].map((f) => BASE + f.path.replace(/^\//, '')).concat(SHELL);
// Files whose name carries a hash of their content never change, so the cache can answer first.
const IMMUTABLE = new Set(immutable.map((f) => BASE + f.path.replace(/^\//, '')));

sw.addEventListener('install', (event) => {
	// Take over as soon as installed: a phone keeps old tabs alive for days, and waiting for
	// them to close would keep serving an outdated app (and an outdated database schema).
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (IMMUTABLE.has(url.pathname)) return (await cache.match(url.pathname)) ?? fetch(req);
			// Everything else, the app shell included, comes from the network when there is one,
			// so an update shows up on the next load; the cache is for cooking offline.
			try {
				return await fetch(req);
			} catch (err) {
				// Pages render in the browser, so any route can boot from the cached shell.
				const fallback = (await cache.match(req)) ?? (req.mode === 'navigate' ? await cache.match(SHELL) : undefined);
				if (fallback) return fallback;
				throw err;
			}
		})()
	);
});
