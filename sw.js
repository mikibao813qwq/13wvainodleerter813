/* 夢角 Service Worker —— 離線緩存 + 鎖屏通知
   策略：stale-while-revalidate
   先用緩存立刻回應（速度跟沒有 SW 一樣快），同時在背景抓新版更新緩存。
   下次打開就是新的 —— 既不會卡，也不用再加 ?v= */
const CACHE = 'mj-shell-v5';

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

// 背景更新：抓新版寫進緩存，不阻塞畫面
function revalidate(req){
  fetch(req).then(function(res){
    if(!res || !res.ok) return null;
    var copy = res.clone();
    return caches.open(CACHE).then(function(c){ return c.put(req, copy); });
  }).catch(function(){ return null; });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  if (url.indexOf(self.location.origin) !== 0) return;   // 不管跨域

  // 只對「自己網站的頁面與檔案」做 SWR；其他（含 API）不攔截
  var isDoc = (req.mode === 'navigate') || (url.indexOf('manifest.json') !== -1);

  e.respondWith(
    caches.match(req).then(function(cached){
      var net = fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy).catch(function(){}); }).catch(function(){});
        }
        return res;
      }).catch(function(){
        // 斷網：至少把舊的給出來
        if(isDoc) return cached || caches.match('./index.html') || caches.match('./');
        return cached;
      });

      // 有緩存就立刻回（快），同時背景更新；沒緩存才等網路
      return cached || net;
    })
  );

  // 頁面類：額外在背景多檢查一次，確保下次開就是新版
  if (isDoc) {
    e.waitUntil(revalidate(req).catch(function(){ return null; }));
  }
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
