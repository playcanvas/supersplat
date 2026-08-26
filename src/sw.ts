import { version as appVersion } from '../package.json';

// export default null
declare let self: ServiceWorkerGlobalScope;

const cacheName = `superSplat-v${appVersion}`;

const cacheUrls = [
    './',
    './index.css',
    './index.html',
    './index.js',
    './manifest.json',
    './static/icons/logo-192.png',
    './static/icons/logo-512.png',
    './static/images/screenshot-narrow.jpg',
    './static/images/screenshot-wide.jpg',
    './static/lib/webp/webp.mjs',
    './static/lib/webp/webp.wasm',
    './static/locales/de.json',
    './static/locales/en.json',
    './static/locales/es.json',
    './static/locales/fr.json',
    './static/locales/ja.json',
    './static/locales/ko.json',
    './static/locales/pt-BR.json',
    './static/locales/ru.json',
    './static/locales/zh-CN.json'
];

self.addEventListener('install', (event) => {
    // create cache for current version
    event.waitUntil(
        caches.open(cacheName)
        .then(cache => cache.addAll(cacheUrls))
    );
});

self.addEventListener('activate', (event) => {
    // delete the old caches once this one is activated
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names
            .filter(name => name.startsWith('superSplat-v') && name !== cacheName)
            .map(name => caches.delete(name))
        ))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
        .then(response => response ?? fetch(event.request))
    );
});
