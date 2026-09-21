/* 夢角 Service Worker —— 導航專用離線版 v13
   原則：能不做的事全都不做。
   · 只攔截「開頁面」這一個請求，圖示、manifest 一律不經過 SW
   · 有快取就直接開，完全不等網路
   · 不主動 skipWaiting、不 clients.claim()（這兩個會強制重整頁面，是卡頓主因）
   · 不做背景更新；只有偵測到新版本時才由主線程觸發接管
   離線能力保留：斷網時把快取的頁面拿出來 */
const CACHE = 'mj-shell-v13';

self.addEventListener('install', function(e){
  // 只預先存好開頁面要用的東西，其他都不管
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.add('./index.html').catch(function(){ return null; });
    })
  );
  // 不呼叫 skipWaiting：避免新版本強制接管、造成頁面重整
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  // 不呼叫 clients.claim()：避免接管時觸發重整
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;                        // 只管 GET
  if (req.url.indexOf(self.location.origin) !== 0) return; // 只管自己網站
  if (req.mode !== 'navigate') return;                     // 只管開頁面

  e.respondWith(
    caches.match('./index.html').then(function(cached){
      if (cached) return cached;                    // 有快取直接用，不發任何網路請求
      return fetch(req).then(function(res){         // 沒有才抓，並存起來
        if (res && res.ok) {
          try {
            var copy = res.clone();
            caches.open(CACHE).then(function(c){
              c.put('./index.html', copy).catch(function(){});
            }).catch(function(){});
          } catch(err){}
        }
        return res;
      }).catch(function(){
        return cached || caches.match('./');        // 斷網：把舊的給出來
      });
    })
  );
});

// 收到主線程的 skipWaiting 請求才接管（只在偵測到新版本時發生，不是每次開頁面）
self.addEventListener('message', function(e){
  if (e.data && e.data.type === 'skipWaiting') self.skipWaiting();
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
