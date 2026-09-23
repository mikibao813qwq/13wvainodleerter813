/* 夢角 Service Worker —— 導航專用離線版 v15
   原則：能不做的事全都不做。
   · 只攔截「開頁面」這一個請求，圖示、manifest 一律不經過 SW
   · 開頁面先走網路拿最新版（更新一定生效），斷網才用快取
   · 不主動 skipWaiting、不 clients.claim()（這兩個會強制重整頁面，是卡頓主因）
   · 不做背景更新；只有偵測到新版本時才由主線程觸發接管
   離線能力保留：斷網時把快取的頁面拿出來 */
const CACHE = 'mj-shell-v15';

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

  // 開頁面：先走網路拿最新版，抓不到（斷網）才用快取。
  // 這樣更新一定會生效，同時保留離線能力。
  e.respondWith(
    // 關鍵：一定要 bypass 瀏覽器自己的 HTTP 快取。
    // SW 裡的 fetch() 預設會先問瀏覽器快取，拿到的可能是舊版本，
    // 這就是「網頁開新版、App 卻還是舊版」的原因。
    fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
    .then(function(res){
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
      // 斷網或連不上：用之前存下來的頁面
      return caches.match('./index.html').then(function(c){
        return c || caches.match('./');
      });
    })
  );
});

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
