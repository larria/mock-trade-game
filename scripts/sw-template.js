/* Generated release constants are inserted by scripts/build-pwa.cjs. */
'use strict';
const CACHE_PREFIX = `trading-pwa:${encodeURIComponent(self.registration.scope)}:`;
const CACHE_NAME = CACHE_PREFIX + RELEASE.build;
const scope = new URL(self.registration.scope);
const assetURLs = new Set(ASSETS.map(file => new URL(file, scope).href));

self.addEventListener('install', event => {
    // A release becomes installable only after every required asset is cached.
    // Existing tabs stay on their release until the player clicks Update.
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            await cache.addAll(ASSETS.map(file => new Request(new URL(file, scope), { cache: 'reload' })));
        } catch (error) {
            await caches.delete(CACHE_NAME);
            throw error;
        }
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});
self.addEventListener('message', event => {
    if (event.data?.type === 'GET_RELEASE') event.ports[0]?.postMessage(RELEASE);
    if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
    // Serve the whole app shell from one release, including navigations with queries.
    // Leave external live stock scripts and update requests to the network.
    const isHome = event.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL('index.html', scope).pathname);
    if (!isHome && !assetURLs.has(url.href)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(isHome ? new URL('index.html', scope).href : url.href);
        if (cached) return cached;
        return fetch(event.request);
    })());
});
