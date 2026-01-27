// Rover Code Service Worker
const CACHE_NAME = 'rover-code-v1';
const STATIC_ASSETS = [
    '/code/',
    'https://unpkg.com/blockly/blockly.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip API calls - always go to network
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone the response for caching
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(event.request);
            })
    );
});
