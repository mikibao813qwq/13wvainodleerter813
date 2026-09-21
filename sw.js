/* 夢角 Service Worker —— 離線緩存 + 鎖屏通知 */
const CACHE = 'mj-shell-v4';
// 核心檔案：一定要成功，否則離線開不了
const SHELL = [
  './',
  './index.html',
  './manifest.json'
];
// 圖示：可有可無，抓不到就跳過，絕不讓整個安裝失敗
const OPTIONAL = [
  './icon-192.png',
  './icon-512.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 核心逐個加入，單一失敗也不會拖垮整體
      return Promise.all(SHELL.map(function(u){
        return c.add(u).catch(function(){ return null; });
      })).then(function(){
        // 圖示盡力抓，失敗就算了
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
  // 只處理同源請求，避免跨域報錯
  var url = req.url;
  if (url.indexOf(self.location.origin) !== 0) return;

  // 開頁面（導航請求）：優先走網路 → 部署新版本後打開就是新的，不必再加 ?v=2
  // 離線 / 斷網時自動回退到緩存，離線照樣能用
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){
          c.put('./index.html', copy).catch(function(){});
        }).catch(function(){});
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(r){ return r || caches.match('./'); });
      })
    );
    return;
  }

  // manifest.json：優先走網路。
  // 它決定「能不能當 App 安裝」，若被舊緩存卡住，就算檔案換了也永遠顯示舊設定
  if (url.indexOf('manifest.json') !== -1) {
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy).catch(function(){}); }).catch(function(){});
        return res;
      }).catch(function(){ return caches.match(req); })
    );
    return;
  }

  // 其他資源（圖示）：維持 cache-first，離線也能開
  e.respondWith(
    caches.match(req).then(function(res){
      return res || fetch(req).then(function(fetchRes){
        return caches.open(CACHE).then(function(c){
          try { c.put(req, fetchRes.clone()); } catch(err){}
          return fetchRes;
        });
      }).catch(function(){
        if (req.mode === 'navigate') return caches.match('./index.html');
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
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
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
