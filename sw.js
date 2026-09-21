/* 夢角 Service Worker —— 離線版 v8
   目標：斷網也能開，同時盡量不拖慢效能。
   做法：純 cache-first，每個請求只發一次，不做背景重複請求。 */
const CACHE = 'mj-shell-v8';

// 開 App 必要的檔案（離線靠這幾個）
const SHELL = [
  './',
  './index.html',
  './manifest.json'
];
// 圖示：抓不到也不影響，失敗就跳過
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
    // 清掉所有舊版本快取，避免殘留的壞資料
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.indexOf(self.location.origin) !== 0) return;   // 不管跨域

  e.respondWith(
    caches.match(req).then(function(cached){
      // 有快取 → 直接用（不發任何網路請求，最快，也支援離線）
      if (cached) return cached;
      // 沒快取 → 抓網路並存起來，下次離線就有
      return fetch(req).then(function(res){
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c){
            c.put(req, copy).catch(function(){});
          }).catch(function(){});
        }
        return res;
      }).catch(function(){
        // 斷網又沒快取（通常是開頁面）：把已存的 index.html 拿出來
        if (req.mode === 'navigate') {
          return caches.match('./index.html').then(function(r){ return r || caches.match('./'); });
        }
        return undefined;
      });
    })
  );
});

// 鎖屏通知
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
