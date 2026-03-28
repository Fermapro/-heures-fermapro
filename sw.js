// ═══════════════════════════════════════════════════════════════
// FERMAPRO — Service Worker v1
// #8 — Cache des assets CDN + mode offline partiel
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME   = "fermapro-v2";
const CACHE_STATIC = "fermapro-static-v2";

// Assets CDN à mettre en cache
const CDN_ASSETS = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
];

// Assets locaux à pré-cacher
const LOCAL_ASSETS = [
  "/",
  "/index.html",
  "/favicon-32.png",
  "/favicon-16.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// ── Installation : pré-cache des assets critiques ─────────────
self.addEventListener("install", (evt) => {
  evt.waitUntil(
    Promise.allSettled([
      // Cache local
      caches.open(CACHE_STATIC).then(cache =>
        cache.addAll(LOCAL_ASSETS).catch(e =>
          console.warn("[SW] Certains assets locaux non cachés:", e)
        )
      ),
      // Cache CDN (Network First, puis cache)
      caches.open(CACHE_NAME).then(async cache => {
        for (const url of CDN_ASSETS) {
          try {
            const resp = await fetch(url, { cache: "no-store" });
            if (resp.ok) await cache.put(url, resp);
          } catch(e) {
            console.warn("[SW] CDN non mis en cache:", url, e);
          }
        }
      })
    ]).then(() => {
      console.log("[SW] ✅ Installation terminée");
      self.skipWaiting();
    })
  );
});

// ── Activation : nettoyage des anciens caches ─────────────────
self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => {
            console.log("[SW] 🗑 Ancien cache supprimé:", k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log("[SW] ✅ Activation terminée");
      return self.clients.claim();
    })
  );
});

// ── Stratégie de fetch ────────────────────────────────────────
self.addEventListener("fetch", (evt) => {
  const { request } = evt;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes Apps Script (données dynamiques)
  if (url.hostname.includes("script.google.com")) return;
  if (url.hostname.includes("spot-hit.fr")) return;

  // Assets CDN → Cache First (puis Network en fallback)
  if (CDN_ASSETS.some(a => request.url === a)) {
    evt.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch(e) {
          console.warn("[SW] CDN inaccessible, pas de cache:", request.url);
          return new Response("// CDN unavailable", { status: 503 });
        }
      })
    );
    return;
  }

  // Assets locaux (index.html, icônes) → Network First avec fallback cache
  if (url.origin === self.location.origin) {
    evt.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(request, clone));
          }
          return resp;
        })
        .catch(() =>
          caches.match(request).then(cached => {
            if (cached) return cached;
            // Fallback ultime : retourner index.html (SPA)
            return caches.match("/index.html");
          })
        )
    );
  }
});

// ── Message pour forcer la mise à jour ────────────────────────
self.addEventListener("message", (evt) => {
  if (evt.data === "SKIP_WAITING") self.skipWaiting();
});

console.log("[SW] Service Worker Fermapro v2 chargé");
