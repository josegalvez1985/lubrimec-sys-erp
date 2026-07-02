# Lubrimesys — Sistema administrativo ERP

Panel administrativo web (PWA) para Lubrimec: inventario, ventas, clientes, reportes y mensajería
por WhatsApp. Frontend **TanStack Start** (React 19) sobre backend **Oracle APEX/ORDS**.

## Stack

- **Frontend:** TanStack Start (React 19 + Router + Query), shadcn/ui (Radix + Tailwind v4), Vite.
- **Servidor:** Nitro (Node). Gestor de paquetes: **npm**.
- **Backend:** Oracle APEX/ORDS (esquema `JOSEGALVEZ`, módulo `lubrimec`). Auth con token Bearer.
- **Móvil:** APK Android vía Capacitor (WebView que carga la app publicada).

## Arquitectura de datos

```
Componente React (react-query)
  → src/lib/api.ts
  → /api/ords/<ruta>              (mismo origen → sin CORS)   [dev / server Node]
  → proxy server-side src/routes/api/ords.$.ts
  → https://oracleapex.com/ords/josegalvez/lubrimec/<ruta>
  → handler PL/SQL → PKG_<TABLA>_LUBRIMEC → tabla
```

- El front **nunca** llama a oracleapex directo en dev/Node: pasa por el proxy `/api/ords/` para
  evitar CORS. En **GitHub Pages** (estático, sin proxy) `VITE_API_URL` apunta directo a ORDS, que
  ya emite `Access-Control-Allow-Origin: *`.
- Contrato JSON uniforme: `{ success, message?, data? }`.
- **Sin caché:** los datos pueden crearse/editarse desde otros sistemas, así que toda consulta va
  al servidor en el momento (react-query `staleTime 0`, `fetch` `no-store`, el Service Worker no
  cachea la API). Detalle en [src/GUIA_FRONT.md](src/GUIA_FRONT.md#sin-caché-todo-dato-se-consulta-en-el-momento).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
```

`.env` (dev) debe tener `VITE_API_URL=/api/ords/` para usar el proxy.

### Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm run build` | Build de producción. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier. |
| `npm run cap:sync` | Sincroniza la config de Capacitor con Android. |

## Estructura

- `src/routes/` — rutas (login `index.tsx`, `home.tsx`) y proxy ORDS (`api/ords.$.ts`).
- `src/components/` — vistas de páginas (`marcas-view.tsx`, `whatsapp-view.tsx`) y UI (`ui/`).
- `src/lib/api.ts` — cliente HTTP: sesión, `authFetch`, funciones por tabla.
- `src/hooks/` — hooks (aviso de actualización del APK).
- `db/` — paquetes PL/SQL y scripts ORDS de cada tabla.
- `android/` — proyecto Capacitor para el APK.

## Backend (ORDS) — agregar una tabla

Patrón: paquete PL/SQL (`db/PKG_<TABLA>_LUBRIMEC.sql`) + script ORDS (`db/ORDS_<TABLA>.sql`) +
cliente en `src/lib/api.ts`. Guía completa: **[db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md)**.
Referencia viva: tabla `marcas`.

Detalles del consumo desde el front y gotchas del proxy: **[src/GUIA_FRONT.md](src/GUIA_FRONT.md)**.

## Páginas implementadas

Las páginas se mapean por `page_id` de APEX en `src/routes/home.tsx` (mapa `VISTAS`). El menú y los
accesos rápidos se arman dinámicamente desde el endpoint `menu/paginas`.

- **Marcas** (page_id 6) — CRUD, referencia del patrón.
- **Mensajes a WhatsApp** (page_id 117) — envío masivo de texto/imagen vía wasenderapi:
  números desde la BD (`numeros_whatsapp`) o manuales, importar CSV de contactos, envío async con
  progreso, borrador persistente. Backend: `db/PKG_WHATSAPP_LUBRIMEC.sql`, `db/ORDS_WHATSAPP.sql`,
  `db/PROC_ENVIAR_MENSAJES_WHATSAPP.sql`, `db/WHATSAPP_DDL.sql`.

## Deploy

- **GitHub Pages** (SPA estático): workflow `.github/workflows/deploy-pages.yml` se dispara en push a
  `main`. En Pages, `VITE_API_URL` apunta directo a ORDS.
- **Servidor Node (Nitro):** `npm run build` (preset node-server) + `node .output/server/index.mjs`.
  Requiere `VITE_API_URL=/api/ords/`, `VITE_APP_ID`, `ORDS_TARGET` (ver `.env.production`).

## APK Android

El APK es una **WebView remota** que carga la app de GitHub Pages (`server.url` en
`capacitor.config.ts`). El contenido web es dinámico: páginas nuevas y cambios se ven con solo
`git push` (Pages), **sin regenerar el APK**.

- Build y publicación: **[GENERAR_APK.md](GENERAR_APK.md)**.
- Descarga: botón "Descargar app" en el login (solo Android), apunta al Release de GitHub. Se oculta
  si la app nativa ya está instalada (`navigator.getInstalledRelatedApps()` + `related_applications`
  en `public/manifest.webmanifest`). Incluye la nota de activar "Instalar apps de fuentes
  desconocidas" (Android bloquea la instalación de APKs sideload hasta habilitar ese permiso). No hay
  botón de "Instalar PWA".
- Actualización: banner dentro del APK que compara su versión (`@capacitor/app`) contra
  `public/apk-version.json` y avisa cuando hay una nueva. El usuario descarga e instala manualmente
  (Android no autoactualiza APKs fuera de Play Store).
- Regenerar el APK solo si cambia ícono, nombre, `appId`, `server.url`, un plugin nativo o la versión.

## Documentación

- [db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md) — mapear tablas Oracle a endpoints ORDS.
- [src/GUIA_FRONT.md](src/GUIA_FRONT.md) — consumo desde el front, proxy y gotchas.
- [GENERAR_APK.md](GENERAR_APK.md) — generar, firmar, publicar y versionar el APK.
