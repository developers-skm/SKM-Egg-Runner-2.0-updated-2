/**
 * SKM EGG RUNNER — Unified Service Worker
 *
 * Handles BOTH:
 *   1. App shell caching (offline support)
 *   2. Firebase Cloud Messaging (background push notifications)
 *
 * Registered at scope: / (root — required for FCM getToken() push subscriptions)
 * Path: /firebase-messaging-sw.js  (FCM SDK looks for this filename by default)
 *
 * Firebase compat SDK required inside service workers (no ES modules in SW).
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ─── App shell cache ──────────────────────────────────────────────────────────

const CACHE = 'skm-v7';

const PRECACHE = [
  '/',
  '/index.html',
  '/signal-lost.png',
  '/egg mus_Image_v5vrg3v5vrg3v5vr-removebg-preview.png',
  '/Jump pose.png',
  '/THUMBS_POSE__Egg_-removebg-preview.png',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE).then(function(cache) { return cache.addAll(PRECACHE); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);

  // Navigation: network-first, fall back to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() { return caches.match('/index.html'); })
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|css|js)$/)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var toCache = response.clone();
            caches.open(CACHE).then(function(cache) { cache.put(event.request, toCache); });
          }
          return response;
        });
      })
    );
    return;
  }
});

// ─── Firebase Cloud Messaging ─────────────────────────────────────────────────

firebase.initializeApp({
  apiKey:            'AIzaSyBcGsQCma6dB3yDSZxhPAiwJtNR3CofcJc',
  authDomain:        'skm-egg-runner.firebaseapp.com',
  projectId:         'skm-egg-runner',
  storageBucket:     'skm-egg-runner.firebasestorage.app',
  messagingSenderId: '635492295830',
  appId:             '1:635492295830:web:d572a5d8b35e42ef8f4eb7',
});

var messaging = firebase.messaging();

// Background push: fires when app tab is CLOSED or BACKGROUNDED
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM-SW] Background message received');

  var notifTitle = (payload.notification && payload.notification.title)
    ? payload.notification.title
    : 'SKM Notification';

  var notifBody = (payload.notification && payload.notification.body)
    ? payload.notification.body
    : '';

  var d = payload.data || {};

  var options = {
    body:    notifBody,
    icon:    '/THUMBS_POSE__Egg_-removebg-preview.png',
    badge:   '/THUMBS_POSE__Egg_-removebg-preview.png',
    tag:     'skm-' + (d.type || 'notification'),
    renotify: true,
    requireInteraction: d.priority === 'urgent' || d.priority === 'high',
    data: {
      url:     d.clickAction || '/',
      type:    d.type        || 'general',
      notifId: d.notifId     || '',
    },
    actions:  buildActions(d.type),
    vibrate:  [200, 100, 200],
  };

  if (payload.notification && payload.notification.image) {
    options.image = payload.notification.image;
  }

  return self.registration.showNotification(notifTitle, options);
});

// ─── Show notification on demand from main thread ─────────────────────────────
// Main thread posts { type: 'SHOW_NOTIFICATION', title, body, icon, tag, url }

self.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  var title = event.data.title || 'SKM';
  var body  = event.data.body  || '';
  var icon  = event.data.icon  || '/THUMBS_POSE__Egg_-removebg-preview.png';
  var tag   = event.data.tag   || 'skm-notification';
  var url   = event.data.url   || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body:     body,
      icon:     icon,
      badge:    icon,
      tag:      tag,
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     { url: url },
    })
  );
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', function(event) {
  console.log('[FCM-SW] Notification clicked, action:', event.action);
  event.notification.close();

  var data = event.notification.data || {};
  var targetUrl = data.url || '/';

  if (event.action === 'scan_qr')       targetUrl = '/?open=scan';
  if (event.action === 'play_game')     targetUrl = '/?open=game';
  if (event.action === 'view_stats')    targetUrl = '/?open=profile';
  if (event.action === 'view_sticker')  targetUrl = '/?open=profile';
  if (event.action === 'view_streak')   targetUrl = '/?open=streaks';
  if (event.action === 'view_progress') targetUrl = '/?open=stats';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'FCM_NOTIFICATION_CLICK',
            data: { url: targetUrl, notifType: data.type, notifId: data.notifId },
          });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ─── Action builder ───────────────────────────────────────────────────────────

function buildActions(type) {
  switch (type) {
    case 'protein_added':
    case 'protein_reminder':
    case 'protein_goal_complete':
    case 'daily_goal_reminder':
    case 'protein_duplicate':
    case 'golden_egg_scanned':
    case 'streak_reminder':
      return [{ action: 'scan_qr', title: 'Scan QR' }];

    case 'run_completed':
    case 'new_high_score':
    case 'game_reminder':
    case 'mission_complete':
    case 'qr_validated':
    case 'daily_reward_available':
      return [{ action: 'play_game', title: 'Play Now' }];

    case 'achievement_unlocked':
    case 'level_up':
    case 'champion_rank_improved':
    case 'streak_milestone':
    case 'protein_milestone':
      return [{ action: 'view_stats', title: 'View Stats' }];

    case 'sticker_unlocked':
    case 'sticker_collection_progress':
    case 'mystery_reward':
      return [{ action: 'view_sticker', title: 'View Sticker' }];

    case 'week_complete':
    case 'new_week_started':
    case 'evening_reminder':
    case 'midnight_reminder':
    case 'streak_reminder':
      return [{ action: 'view_streak', title: 'View Streak' }];

    case 'weekly_summary':
      return [{ action: 'view_progress', title: 'Open Progress' }];

    case 'missed_one_day':
    case 'missed_three_days':
    case 'morning_reminder':
    case 'afternoon_reminder':
      return [{ action: 'scan_qr', title: 'Scan Now' }];

    default:
      return [];
  }
}
