const CACHE_NAME = 'kidspeak-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './data.json',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/downloader.js',
  './favicon.ico',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// 1. Sự kiện INSTALL: Lưu các file khung vào Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Đang cache các file hệ thống...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Sự kiện ACTIVATE: Dọn dẹp cache cũ khi bạn cập nhật phiên bản app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Đang xóa cache cũ:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. Sự kiện FETCH: Xử lý yêu cầu tài nguyên
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CHẾ ĐỘ NGOẠI LỆ: Không cache các file Media hoặc ZIP
  // Vì chúng ta quản lý bằng OPFS (StorageManager) để tránh tràn bộ nhớ Cache
  if (url.pathname.includes('/media/') || url.pathname.endsWith('.zip')) {
    return; // Để trình duyệt tự xử lý qua mạng hoặc OPFS trong app.js
  }

  // CHIẾN LƯỢC: Stale-While-Revalidate cho các file khác
  // Lấy từ cache hiện ra ngay, đồng thời cập nhật bản mới từ mạng cho lần sau
  event.respondWith(
    caches.match(event.request).then((response) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse.clone();
      });
      return response || fetchPromise;
    })
  );
});
