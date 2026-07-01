const CACHE = "lubrimesys-v3";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Rutas que NUNCA se cachean: son datos de la API (multi-sistema, deben verse al momento).
// El SW no las intercepta → van siempre a la red.
function esApi(url) {
  return (
    url.pathname.includes("/api/ords/") ||
    url.pathname.includes("/ords/") ||
    url.hostname.includes("oracleapex.com")
  );
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Peticiones a la API: dejar pasar a la red, sin caché.
  if (esApi(url)) return;
  // El APK (binario grande): nunca interceptar ni cachear, romperia la descarga.
  if (url.pathname.endsWith(".apk")) return;
  // Resto (assets estáticos): cache-first.
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ?? fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
    )
  );
});
