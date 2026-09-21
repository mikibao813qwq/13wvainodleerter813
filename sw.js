/* 夢角 Service Worker —— 不卡離線版 v9
   策略：全部 cache-first（含開頁面）
   · 有快取就直接回，完全不等網路 → 跟沒有 SW 一樣快、不卡
   · 斷網也照開
   · 要更新時改上面的 CACHE 版本號即可：新版本安裝後會清掉舊快取，下次開就是新的 */
const CACHE = 'mj-shell-v9';

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
    // 清掉所有舊版本快取 → 版本號一改，下次開就是全新內容
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
      // 有快取 → 直接回，不發任何網路請求（這就是不卡的關鍵）
      if (cached) return cached;
      // 沒快取 → 抓網路並存起來，下次就有
      return fetch(req).then(function(res){
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c){
            c.put(req, copy).catch(function(){});
          }).catch(function(){});
        }
        return res;
      }).catch(function(){
        // 斷網又沒快取：把已存的頁面拿出來
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
