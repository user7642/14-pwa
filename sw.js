/**
 * KidSpeak Service Worker - v2.0.0
 * Hỗ trợ chạy Offline và quản lý Cache hệ thống
 */

const CACHE_NAME = 'kidspeak-v3';

// Danh sách các tài nguyên hệ thống cần cache ngay khi cài đặt
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './how-to-install.html',
  './manifest.json',
  './data.json',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/downloader.js',
  './js/ui-manager.js',
  './favicon.ico',
  './assets/branding/logo.png',
  './assets/branding/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

/**
 * 1. Sự kiện INSTALL: Lưu các file hệ thống cố định
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Đang lưu trữ các file hệ thống...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

/**
 * 2. Sự kiện ACTIVATE: Dọn dẹp cache cũ
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Đang xóa Cache cũ:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

/**
 * 3. Sự kiện FETCH: Chiến lược Cache First
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // BỎ QUA: Không can thiệp vào tệp ZIP hoặc tệp Media trong assets/zips
  if (url.pathname.includes('/assets/zips/') || url.pathname.endsWith('.zip')) {
    return; 
  }

  // BỎ QUA: Không can thiệp vào các yêu cầu không phải HTTP (như chrome-extension, data:...)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Trả về từ Cache nếu có
      if (cachedResponse) {
        return cachedResponse;
      }

      // Nếu không có trong Cache, tải từ mạng
      return fetch(event.request).then((networkResponse) => {
        // KIỂM TRA ĐIỀU KIỆN LƯU CACHE:
        // - Phải là phương thức GET
        // - Status 200 (Thành công nội bộ) hoặc Status 0 (Tài nguyên từ domain khác - Opaque)
        const canCache = event.request.method === 'GET' && 
                         (networkResponse.status === 200 || networkResponse.status === 0);

        if (canCache) {
          return caches.open(CACHE_NAME).then((cache) => {
            // Lưu bản sao vào cache
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }

        return networkResponse;
      }).catch((err) => {
        console.error("SW: Fetch failed for:", event.request.url, err);
        // Có thể trả về trang offline mặc định tại đây nếu muốn
      });
    })
  );
});
