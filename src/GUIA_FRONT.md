# Guía del frontend (TanStack Start)

Patrón establecido para consumir los endpoints ORDS desde el front. Tomar `marcas`
como referencia viva. Acompaña a `db/GUIA_ENDPOINTS.md` (lado backend).

## Arquitectura

```
Componente (React + @tanstack/react-query)
  → funciones de src/lib/api.ts
  → fetch a /api/ords/<ruta>                    (mismo origen → SIN CORS)
  → proxy server-side (src/routes/api/ords.$.ts)
  → ORDS_TARGET + /ords/josegalvez/lubrimec/<ruta>
```

**Regla de oro:** el front **nunca** llama a `oracleapex.com` directo. Siempre pasa por
`/api/ords/`. Eso evita CORS y mantiene el token fuera de la URL.

## El proxy server-side (`src/routes/api/ords.$.ts`)

Reenvía la petición a ORDS server-side. Detalles que costó descubrir:

- **Métodos:** declara handlers `GET, POST, PUT, DELETE`. Si falta uno, ese método del
  CRUD falla silenciosamente (cae al SPA / 404). Al agregar un verbo nuevo, agregarlo aquí.
- **Body solo si existe:** únicamente setea `body` + `content-type` cuando hay payload.
  Un DELETE (o cualquier request sin cuerpo) con `content-type: application/json` y body
  vacío hace que ORDS devuelva **400** `Expected one of <<{,[>> but got EOF`.
- **Headers:** reenvía solo `authorization` (Bearer) y `content-type`. No propaga otros.
- **Query string:** se preserva (`incoming.search`), así llegan `?cod_empresa=...` etc.

## `VITE_API_URL` por entorno

`src/lib/api.ts` lee `import.meta.env.VITE_API_URL` como base. Debe valer `/api/ords/`
en **todos** los entornos donde haya servidor Node (dev y prod con Nitro), para que use
el proxy:

- `.env` (dev) → `VITE_API_URL=/api/ords/`
- `.env.production` → `VITE_API_URL=/api/ords/` + `ORDS_TARGET=https://oracleapex.com`

> **Deploy:** este front necesita correr con **servidor Node** (`node .output/server/index.mjs`),
> NO GitHub Pages estático. En Pages no existe el proxy `/api/ords` → el navegador
> llamaría a ORDS directo y reaparece el CORS. Build: `npm run build` (preset
> `node-server`). Setear en el host: `VITE_API_URL=/api/ords/`, `VITE_APP_ID`,
> `ORDS_TARGET`.

## `src/lib/api.ts` — el cliente

Centraliza sesión + fetch. Piezas:

- **Sesión:** `getSesion()` / `guardarSesion()` / `cerrarSesion()`. Token en
  `localStorage` (recordar) o `sessionStorage` (no recordar). Tipo `Sesion`:
  `{ token, usuario, app_user, app_id }`.
- **`login(usuario, password, recordar)`:** POST a `auth/login` con `{ usuario, password }`.
  El back responde plano `{ success, token, usuario, ... }` (sin envoltura `data`); el
  parser usa `json?.data ?? json` para soportar ambas formas.
- **`authFetch(path, init)`:** inyecta `Authorization: Bearer <token>`, y en **401**
  llama `handleUnauthorized()` (cierra sesión + redirige a login). Usarla en TODA llamada
  protegida; nunca `fetch` directo.

### Agregar una tabla nueva (lado front)

1. Tipos `Tabla` (campos exactos) y `TablaInput` (sin PK).
2. Funciones que usan `authFetch`:
   - `listarTablas(codEmpresa)` → `GET tabla?cod_empresa=:n`, devuelve `data.data`.
   - `obtenerTabla(id, codEmpresa)` → `GET tabla/:id?cod_empresa=:n`.
   - `crearTabla(input)` → `POST tabla`, body JSON, devuelve la PK nueva.
   - `actualizarTabla(id, input)` → `PUT tabla/:id`, body JSON.
   - `eliminarTabla(id, codEmpresa)` → `DELETE tabla/:id?cod_empresa=:n` (sin body).
3. `cod_empresa` se pasa explícito (no está en `Sesion`). Hoy fijo en el componente
   (`COD_EMPRESA`); si se necesita global, agregarlo a `Sesion` en el login.

## Menú dinámico y páginas (`src/routes/home.tsx`)

El menú lateral y los "Accesos rápidos" **no son estáticos**: se construyen desde el
endpoint `menu/paginas` (`getMenuPaginas`), que devuelve las páginas del usuario según
sus permisos. Cada usuario ve un menú distinto.

- **Carga única:** `HomePage` hace el `useQuery(["menu-paginas"])` una sola vez y pasa
  `paginas` al sidebar y a `QuickActions` (no duplicar el query).
- **Agrupación:** el sidebar agrupa por `parent_entry_text` (el menú padre en APEX) en
  secciones colapsables (`NavGrupo`). Dashboard es una entrada fija aparte.
- **Navegación por page_id:** el estado `active` es `"dashboard" | number` (el `page_id`).
  Click en una entrada → `onNav(page_id)`.
- **Resolver la vista:** el mapa `VISTAS: Record<number, () => ReactElement>` relaciona
  `page_id` → componente. Si la página activa está en `VISTAS`, se renderiza; si no,
  muestra `PlaceholderView` con su `page_title`.

### Registrar una página nueva en el menú

1. Implementar el componente (ej. `src/components/<tabla>-view.tsx`).
2. Conocer el `page_id` de esa página en APEX (app 86972).
3. Agregar una línea al mapa `VISTAS` en `home.tsx`:
   ```tsx
   const VISTAS: Record<number, () => ReactElement> = {
     6: () => <MarcasView />, // Marcas
     // <page_id>: () => <NuevaView />,
   };
   ```
   Con eso la entrada del menú y su acceso rápido abren el componente automáticamente.
   No hay que tocar el sidebar ni el endpoint: el menú se arma solo desde la respuesta.

## El componente (`src/components/marcas-view.tsx` — modelo)

- **react-query** para todo el estado servidor:
  - `useQuery({ queryKey: ["tabla", codEmpresa], queryFn, retry: false })` para listar.
  - `useMutation` + `qc.invalidateQueries({ queryKey: ["tabla"] })` en `onSuccess`.
- **Ordenamiento en el front:** ordenar el array del query antes de render, no en el back.
  Ej. marcas: `.sort((a, b) => b.id_marca - a.id_marca)`. El `ORDER BY` del paquete es
  solo un default.
- **Filtro** local sobre los datos ya cargados (sin re-fetch).
- Modal único con estados `create | edit | view | closed`; el form sincroniza sus inputs
  al abrir comparando una `key` (`mode:id`) contra la anterior.
- Errores: `catch` → estado `error` mostrado en el modal / `isError` en la tabla.

## Checklist al tocar un endpoint

- [ ] ¿El verbo está declarado en el proxy `ords.$.ts`?
- [ ] ¿El back tiene `DEFINE_PARAMETER` del header Authorization? (si no → "Token invalido")
- [ ] ¿DELETE/GET van sin body? (si mandan content-type JSON vacío → 400)
- [ ] ¿`VITE_API_URL` = `/api/ords/` en el entorno donde falla?
- [ ] ¿La respuesta es JSON? Si llega HTML "Service Unavailable" → error 500 en el handler
      PL/SQL (revisar el bloque del handler en ORDS).

## APK Android (Capacitor)

El proyecto tiene un APK que es una **WebView remota**: carga la app publicada en GitHub Pages
(`server.url` en `capacitor.config.ts`). El contenido web es dinámico → páginas nuevas y cambios se
ven con solo `git push` (Pages), sin regenerar el APK. Guía de build completa: `GENERAR_APK.md`.

- **Descargar APK:** botón en el login (`src/routes/index.tsx`), visible solo en Android y fuera del
  APK. Apunta al asset `lubrimesys.apk` del último Release de GitHub.
- **Aviso de actualización:** `src/components/apk-update-banner.tsx` + `src/hooks/use-apk-update.ts`.
  Dentro del APK compara su versión (`@capacitor/app`) contra `public/apk-version.json`; si hay una
  mayor, muestra un banner con botón para descargar el APK nuevo. Al publicar una versión: subir
  `versionName` en `android/app/build.gradle`, regenerar/subir el APK al Release, y actualizar la
  versión en `public/apk-version.json`.
- Solo hay que **regenerar el APK** si cambia ícono, nombre, `appId`, `server.url`, un plugin nativo,
  o la versión. Nunca por cambios de contenido web.
