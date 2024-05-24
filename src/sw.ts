import { version as appVersion } from '../package.json';

// export default null
declare let self: ServiceWorkerGlobalScope;

const cacheName = `superSplat-v${appVersion}`;

const cacheUrls = [
    '/',
    '/index.html',
    '/index.js',
    '/manifest.json',
    'static/icons/logo-192.png',
    'static/icons/logo-512.png',
    'static/images/screenshot-narrow.jpg',
    'static/images/screenshot-wide.jpg'
];

self.addEventListener('install', (event) => {
    console.log(`installing v${appVersion}`);

    // cache a cat SVG
    event.waitUntil(
        caches.open(cacheName)
            .then((cache) => {
                cache.addAll(cacheUrls);
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log(`activating v${appVersion}`);
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response ?? fetch(event.request))
    );
});
