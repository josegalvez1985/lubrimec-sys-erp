const CACHE = "lubrimesys-v4";

self.addEventListener("install", (e) => {
  self.skipWaiting();
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
  // apk-version.json: siempre fresco, o el banner de actualización no detecta nada.
  if (url.pathname.endsWith("apk-version.json")) return;

  // HTML/navegaciones: NETWORK-FIRST. Si fuera cache-first, tras un deploy el SW
  // seguiría sirviendo el shell viejo (que referencia los bundles viejos, también
  // cacheados) y los usuarios nunca recibirían la app nueva. El caché queda solo
  // como fallback offline.
  if (e.request.mode === "navigate" || e.request.destination === "document") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Assets estáticos (JS/CSS con hash en el nombre, imágenes): cache-first.
  // Un deploy cambia el hash → el HTML nuevo pide archivos nuevos, sin conflicto.
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
