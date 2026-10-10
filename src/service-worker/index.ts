// Caches the app shell so recipes open in the kitchen without a connection.
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `kokpunkten-${version}`;
const ASSETS = [...immutable, ...assets].map((f) => f.path).concat('/');

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET' || new URL(req.url).origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (ASSETS.includes(new URL(req.url).pathname)) return (await cache.match(req)) ?? fetch(req);
			try {
				return await fetch(req);
			} catch (err) {
				// Pages render in the browser, so any route can boot from the cached shell.
				const fallback = (await cache.match(req)) ?? (req.mode === 'navigate' ? await cache.match('/') : undefined);
				if (fallback) return fallback;
				throw err;
			}
		})()
	);
});
