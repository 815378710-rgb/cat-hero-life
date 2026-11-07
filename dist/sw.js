/* 猫猫侠静态资源缓存
 *
 * 背景：站点经 Cloudflare Tunnel 回源，隧道全部落地洛杉矶，淄博联通到 LAX
 * 的链路上 243KB 主 JS / 83KB CSS 首次加载有较高概率中途断流（白屏或裸 HTML）。
 * 构建产物文件名自带内容 hash，可安全长期缓存，因此这里让复访完全走本地缓存，
 * 不再跨境回源。
 *
 * 策略：
 *  - /assets/*  cache-first + 后台回源更新（stale-while-revalidate）
 *               新版构建会产生新文件名，旧缓存自然失效，不会卡住旧版本
 *  - 导航请求   network-first，断网时回退到已缓存的首页
 *  - /api/*     不缓存（动态数据 + 访问口令鉴权必须实时生效）
 */
const CACHE_NAME = 'cat-hero-static-v1';
const OFFLINE_FALLBACK = '/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉旧版本缓存，避免无限堆积
      const names = await caches.keys();
      await Promise.all(
        names.filter(n => n.startsWith('cat-hero-static-') && n !== CACHE_NAME)
             .map(n => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // 第三方资源交给浏览器默认处理
  if (url.pathname.startsWith('/api/')) return;      // 动态接口不缓存

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(req);
        // 后台更新：命中缓存也发一次请求，把可能的新资源写回
        const refresh = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (hit) return hit;
        const net = await refresh;
        return net || Response.error();
      })()
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || (await cache.match(OFFLINE_FALLBACK)) || Response.error();
      })
    );
  }
});
