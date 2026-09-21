/* 夢角 Service Worker —— 離線緩存 + 鎖屏通知
   極簡穩定版：純 cache-first，不做額外請求，效能等同沒有 SW */
const CACHE = 'mj-shell-v6';

// 核心檔案：開 App 必要的東西
const SHELL = [
  './',
  './index.html',
  './manifest.json'
];
// 圖示：可有可無，抓不到就跳過，絕不讓整個安裝失敗
const OPTIONAL = [
  './icon-192.png',
  './icon-256.png',
  './icon-384.png',
  './icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(SHELL.map(function(u){
        return c.add(u).catch(function(){ return null; });
      })).then(function(){
        return Promise.all(OPTIONAL.map(function(u){
          return c.add(u).catch(function(){ return null; });
        }));
      });
    }).then(function(){ self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  if (url.indexOf(self.location.origin) !== 0) return;   // 不管跨域

  // 純 cache-first：有緩存就立刻回，沒有才走網路。不重複請求，最省資源
  e.respondWith(
    caches.match(req).then(function(cached){
      if (cached) return cached;
      return fetch(req).then(function(res){
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c){
            c.put(req, copy).catch(function(){});
          }).catch(function(){});
        }
        return res;
      }).catch(function(){
        // 斷網：把緩存的頁面給出來，離線照樣能用
        if (req.mode === 'navigate') {
          return caches.match('./index.html').then(function(r){ return r || caches.match('./'); });
        }
        return undefined;
      });
    })
  );
});

// 接收主線程通知，顯示鎖屏推送
self.addEventListener('push', function(e){
  var data = { title: '夢角', body: '夢角傳來了新的訊息' };
  try { data = e.data ? e.data.json() : data; } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'mj-msg',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(function(list){
    if (list[0]) { list[0].focus(); return; }
    clients.openWindow('./index.html');
  }));
});
