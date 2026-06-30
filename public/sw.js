// Legacy stub — caching and FCM are now handled by firebase-messaging-sw.js
// This file is kept so old browsers that cached it still get the unregister logic.

self.addEventListener('install', function() { self.skipWaiting(); });

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});
