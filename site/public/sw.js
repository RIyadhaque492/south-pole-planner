/* Offline support. After one visit with a connection, the Planner, the game and the missions page
   keep working without one: they only need their own code, the JPL table and the terrain skylines. */
const VERSION = "spw-v1";
const PAGES = ["/", "/planner", "/game", "/missions"];
const DATA = ["/geometry.bin", "/terrain/horizons.json", "/img/loader-lander.webp", "/img/card-night.jpg", "/img/card-tipped.jpg", "/img/card-peak.jpg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(DATA.map((u) => cache.add(u)));
    // Fetch each page, then the scripts, styles and fonts it names, so pages never opened still work offline.
    await Promise.allSettled(PAGES.map(async (page) => {
      const res = await fetch(page);
      if (!res.ok) return;
      await cache.put(page, res.clone());
      const assets = new Set((await res.text()).match(/\/_next\/static\/[^"'\\\s)<]+/g) ?? []);
      await Promise.allSettled([...assets].map((u) => cache.add(u)));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

const save = async (request, response) => {
  if (response.ok && response.type === "basic") (await caches.open(VERSION)).put(request, response.clone());
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  // Built files have the content hash in their name, so a cached copy is always right.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((r) => save(request, r))));
    return;
  }
  // Everything else: prefer the network so data and pages stay fresh, fall back to the last copy when offline.
  event.respondWith(
    fetch(request).then((r) => save(request, r)).catch(async () => {
      const hit = await caches.match(request) ?? (request.mode === "navigate" ? await caches.match(url.pathname) : undefined);
      return hit ?? Response.error();
    }),
  );
});
