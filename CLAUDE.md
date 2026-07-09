# Lubrimesys — instrucciones para Claude Code

ERP administrativo para Lubrimec. Frontend TanStack Start (React 19) + backend
Oracle APEX/ORDS + APK Android (Capacitor, WebView remota a GitHub Pages).

## Guías obligatorias

**Antes de trabajar en el código, leer las guías del proyecto.** Contienen el patrón
establecido y gotchas que costó descubrir; no reinventar nada que ya esté resuelto ahí:

- **[src/GUIA_FRONT.md](src/GUIA_FRONT.md)** — lado frontend: proxy `/api/ords/`,
  cliente `src/lib/api.ts` (`authFetch`, sesión), cómo agregar tablas/páginas nuevas
  (mapa `VISTAS` en `home.tsx`), regla "sin caché", patrón de componente
  (`marcas-view.tsx` es el modelo), APK.
- **[db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md)** — lado backend: paquete PL/SQL +
  script ORDS + cliente por tabla. Handlers ORDS planos (el patrón anidado causa 500),
  `DEFINE_PARAMETER` del header Authorization obligatorio, query params se parsean a
  mano del `QUERY_STRING`. Referencia viva: tabla `marcas`.
- [GENERAR_APK.md](GENERAR_APK.md) — solo si se toca algo nativo del APK (ícono,
  nombre, `appId`, `server.url`, plugins, versión).

## Reglas clave (detalle en las guías)

- El front **nunca** llama a `oracleapex.com` directo: siempre `src/lib/api.ts` →
  `/api/ords/` (proxy en `src/routes/api/ords.$.ts`). Toda llamada protegida usa
  `authFetch`, nunca `fetch` directo.
- **Sin caché en ningún nivel:** no poner `staleTime` en `useQuery`; los defaults
  globales ya fuerzan consulta al servidor siempre.
- Contrato JSON uniforme: `{ success, message?, data? }`.
- **LOVs (listas de valores): SIEMPRE lista completa + filtro en el front, sin excepciones**
  (también artículos). El endpoint devuelve todo el catálogo (sin `q`, sin `FETCH FIRST 30`);
  el front filtra multi-palabra en cualquier orden, ID parcial y sin tope de resultados.
  Modelos: `PKG_INVENTARIO_LUBRIMEC.BUSCAR_ARTICULOS` (`db/inventario_sql.sql`) +
  `buscarArticulosInventario` (`src/lib/api.ts`). Regla cerrada: no volver a preguntarla.
- El APK es WebView remota: los cambios web llegan con `git push` (Pages), sin
  regenerar el APK.
- Gestor de paquetes: **npm**. Deploy: push a `main` dispara GitHub Pages
  (`.github/workflows/deploy-pages.yml`).
- Idioma del proyecto (código, comentarios, UI, docs): español.

## Verificación

- `npx tsc --noEmit` y `npm run build` deben pasar antes de dar algo por terminado.
- ESLint tiene ruido masivo de CRLF (prettier) preexistente; ignorarlo salvo que se
  pida formatear.
