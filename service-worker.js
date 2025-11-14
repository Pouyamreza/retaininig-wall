// Service Worker برای قابلیت آفلاین و سرعت بیشتر
const CACHE_NAME = 'retaining-wall-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

// نصب Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker درحال نصب...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache باز شد');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// فعال‌سازی Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker فعال شد');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('حذف Cache قدیمی:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// درخواست‌ها را در هنگام آفلاین از Cache بخدمت دهید
self.addEventListener('fetch', (event) => {
  // فقط درخواست‌های GET را کش کنید
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // اگر در Cache موجود است، بازگرداندن
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
        // اگر پاسخ معتبر نیست، بازگرداندن
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // کپی پاسخ برای کش کردن
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // اگر هیچ اتصال نیست، درخواست آفلاین از Cache بازگرداندن
        return caches.match('/index.html');
      });
    })
  );
});

// پیام‌رسانی برای به‌روزرسانی
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});