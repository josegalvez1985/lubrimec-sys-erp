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
3. Agregar el import y una línea al mapa `VISTAS` en `home.tsx`:
   ```tsx
   const VISTAS: Record<number, () => ReactElement> = {
     6: () => <MarcasView />, // Marcas
     // <page_id>: () => <NuevaView />,
   };
   ```
   Con eso la entrada del menú y su acceso rápido abren el componente automáticamente.
   No hay que tocar el sidebar ni el endpoint: el menú se arma solo desde la respuesta.
   Páginas ya con vista propia (referencia de `page_id`): 24 Códigos de Barras, 27
   Artículos-Proveedores, 2 Personas, 6 Marcas, 117 WhatsApp, etc. (ver el mapa completo).

### CRUD con FK: selector con buscador (modelos: `codigos-barras-view`, `articulos-proveedores-view`)

Cuando un campo es una FK (elegir un artículo, un proveedor…), **no** cargar toda la tabla en un
`<select>`: usar un buscador con debounce contra un endpoint `*/buscar` (devuelve ≤30 filas).

- El backend expone `articulos/buscar?cod_empresa=&q=` y `proveedores/buscar?...` (ver
  `db/GUIA_ENDPOINTS.md`, sección "Selector de FK"). Cliente: `buscarArticulos` / `buscarProveedores`.
- Componente compartido **`src/components/ui/buscador-select.tsx`** (`BuscadorSelect`): input con
  debounce de 300ms → `useQuery({ enabled: abierto })` → dropdown de resultados; al elegir llama
  `onSelect(item)`. Usado en `articulos-proveedores-view`, `codigos-barras-view` y
  `vehiculos-repuestos-view`. **No dupliques** este componente por vista; importá el de `ui/`.
- **Gotcha:** no pongas un `<Input>` de "fallback manual" con el mismo valor **debajo** del
  `BuscadorSelect` — su dropdown es `absolute` y el input siguiente compite/lo tapa, y parecía "no
  funcionar" (pasó en la pág 94). Si necesitás mostrar el valor elegido, usá un `<p>` de texto.
- La grilla usa `DataTable` y muestra las columnas de solo lectura del JOIN (descripción del
  artículo, nombre del proveedor).

### Imágenes en BLOB (modelos: `articulos-view`, `monedas-view`)

Tablas con imagen (`archivo_imagen BLOB` + `mime_type`). Dos caminos según el tamaño esperado:

- **Subir / editar:** el archivo se lee a base64 en el navegador (`FileReader`/`btoa` por chunks) y
  viaja como `imagen_base64` en el JSON del POST/PUT. El backend lo convierte a BLOB. Enviar `null`
  = no tocar la imagen (patrón de `monedas_detalle` y `articulos`).
- **Mostrar en un modal (una imagen):** el `OBTENER` (`GET tabla/:id`) devuelve `imagen_base64`; el
  front la pinta con `src={`data:${mime};base64,${b64}`}`. Bien para 1 imagen a la vez.
- **Thumbnail en una grilla (muchas):** el `LISTAR` **no** trae los blobs (solo un flag
  `tiene_imagen`); cada fila apunta a un endpoint **público** que sirve el BLOB directo:
  `<img src={urlImagenArticulo(id, codEmpresa)}>` → `GET articulos/:id/imagen`. Es público porque el
  navegador no manda `Authorization` en un `<img>`. Cliente: helper `urlImagenArticulo` en `api.ts`.
- **Proxy y binarios:** `src/routes/api/ords.$.ts` reenvía el body como `arrayBuffer()` (no
  `res.text()`, que corrompe binarios decodificándolos como UTF-8). Sirve igual para JSON e imágenes.

## Sin caché: todo dato se consulta en el momento

**Regla del proyecto:** los datos vienen de sistemas externos (se crean/modifican desde otras
apps), así que **nunca** se sirve nada cacheado. Al abrir/refrescar una vista, la consulta va al
servidor. Esto ya está configurado globalmente en 3 niveles; al crear una página nueva **no hay
que hacer nada extra**, solo respetar el patrón:

1. **react-query (global):** `src/router.tsx` fija defaults `staleTime: 0`, `gcTime: 0`,
   `refetchOnMount/WindowFocus/Reconnect: "always"`. No pongas `staleTime` en `useQuery` (rompería
   la regla). Para refrescar tras una mutación igual conviene `qc.invalidateQueries`.
2. **HTTP (global):** `authFetch` (y `login`, `getMenuPaginas`) mandan `cache: "no-store"`. Toda
   función nueva que use `authFetch` ya queda cubierta. Si hacés un `fetch` directo (raro), agregá
   `cache: "no-store"`.
3. **Service Worker (`public/sw.js`):** NO cachea la API (rutas `/api/ords/`, `/ords/`,
   `oracleapex.com` pasan directo a la red) ni `apk-version.json` ni `.apk`. Estrategia:
   **network-first para HTML/navegaciones** (imprescindible: si el HTML fuera cache-first, tras
   un deploy los usuarios seguirían con el bundle viejo para siempre — pasó) y cache-first solo
   para assets con hash. Si cambiás `sw.js`, subí la constante `CACHE` (`lubrimesys-vN`) para
   forzar la purga en los clientes.

## El componente (`src/components/marcas-view.tsx` — modelo)

- **react-query** para todo el estado servidor:
  - `useQuery({ queryKey: ["tabla", codEmpresa], queryFn, retry: false })` para listar.
  - `useMutation` + `qc.invalidateQueries({ queryKey: ["tabla"] })` en `onSuccess`.
  - **No** agregar `staleTime` (la regla global es 0; ver "Sin caché").
- **Ordenamiento en el front:** ordenar el array del query antes de render, no en el back.
  Ej. marcas: `.sort((a, b) => b.id_marca - a.id_marca)`. El `ORDER BY` del paquete es
  solo un default.
- **Filtro** local sobre los datos ya cargados (sin re-fetch).
- Modal único con estados `create | edit | view | closed`; el form sincroniza sus inputs
  al abrir comparando una `key` (`mode:id`) contra la anterior.
- Errores: `catch` → estado `error` mostrado en el modal / `isError` en la tabla.

## DataTable reutilizable (`src/components/ui/data-table.tsx`)

Grilla genérica estilo Interactive Report de APEX. **Usarla en toda grilla nueva** (modelos:
`rubros-view`, `personas-view`, `empresas-view`, `iva-view`, `unidades-medidas-view`). Da, sin
reimplementar: **ordenar por columna** (click en header, 3 estados: asc → desc → sin orden),
**search global**, **filtro por columna** (ícono embudo, "contiene"), **mostrar/ocultar columnas**,
**densidad compacta**, **export a Excel** (prop `exportName`) y un contador "N de M".

Uso:
```tsx
const COLUMNAS: Column<Fila>[] = [
  { key: "id", header: "ID", num: true, accessor: (r) => r.id,
    render: (r) => <Badge>{r.id}</Badge>, className: "w-16" },
  { key: "nombre", header: "Nombre", accessor: (r) => r.nombre, hideable: false },
];
<DataTable
  columns={COLUMNAS}
  rows={filas}                       // datos crudos; el filtrado/orden es interno
  getRowId={(r) => r.id}
  initialSort={{ key: "nombre", dir: "asc" }}
  exportName="rubros"                          // muestra botón "Excel"; sin esta prop no aparece
  actions={(r) => <BotonesAccion row={r} />}   // slot columna Acciones (ver/editar/borrar)
/>
```
Notas de `Column<T>`:
- `accessor` = valor crudo para ordenar/filtrar/search (texto o número). Sin `accessor` la columna
  no ordena ni filtra (útil para columnas de solo-render).
- `render` = celda a mostrar; si falta, usa el `accessor` (null/"" → "—").
- `num: true` alinea a la derecha y ordena numéricamente.
- `sortable`/`filterable`/`hideable` = `false` para desactivar por columna (la columna principal
  suele ir `hideable: false`).
- `footer: (rows) => ReactNode` = **fila de totales al pie** (el "sum on break" de APEX). Recibe las
  filas visibles ya filtradas/ordenadas. Si **ninguna** columna define `footer`, no se muestra el pie.
  Sumar sobre las filas: `footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))`.
  Poner `footer: () => "Total"` en la primera columna como etiqueta. Modelo: `conteo-efectivo-view.tsx`.
- El componente **no** hace fetch ni pagina: recibe el array ya traído (regla "sin caché" intacta).
- El search/filtro reemplaza al `<Input>` manual: quitar el estado `filtro` local de la vista.
- **Export Excel** (`exportName`): exporta las columnas **visibles** con `accessor` y las filas
  **ya filtradas/ordenadas** (lo que se ve en pantalla), reusando `exportarExcel` de
  `src/lib/export.ts`. Sin `exportName` no se muestra el botón.

## Reglas transversales (obligatorias en toda vista nueva)

- **Montos con separador de miles — SIEMPRE.** Todo campo de monto/importe/precio/total/cantidad
  grande lleva separador de miles (es-PY), tanto al mostrar como al editar.
  - **Mostrar** (grillas, campos readonly, reportes): `Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 })`
    para guaraníes. Ver `fmtNum`/`fmtMonto` en las vistas.
  - **Editar**: NO usar `<input type="number">` (no admite separador). Usar el componente
    **`src/components/ui/input-monto.tsx`** (`InputMonto`): input de texto con miles en vivo, trabaja
    con `value: number | null` + `onValueChange`, prop `maxDecimals` (0 = guaraníes). Modelos:
    `suba-precios-view`, `compras-pagos-view`, `descuentos-escalonados-view`, `conteo-efectivo-view`.
  - Porcentajes, nro de recibo e IDs **no** son montos: pueden seguir como `type="number"`.
- **Botón "Limpiar" en toda vista con filtros.** Si la vista tiene filtros propios (facetas, checkboxes,
  fecha, search fuera de la grilla), agregar un botón **"Limpiar"** (ícono `X`) que resetee todos los
  filtros; mostrarlo solo si hay alguno activo. Etiqueta "Limpiar" (no "Restablecer" aunque el APEX
  diga eso). Modelos: `post-venta-view`, `suba-precios-view`, `conteo-efectivo-view`. (El `DataTable`
  ya trae su propio "Limpiar" para search/filtros de columna.)
- **Permisos por usuario (app_user).** Cuando el APEX restringe por usuario (ej. solo `JOSEG` ve
  ciertos datos/campos), replicarlo: el front lee `getSesion().app_user` (viene en MAYÚSCULAS) y el
  backend recibe `app_user` como query param para decidir el filtro/visibilidad. Modelo: `conteo-efectivo`
  (JOSEG filtra por fecha y ve el panel de totales; el resto solo ve el día de hoy, sin panel).

## Gotchas de UI

- **Layout responsivo:** el `<main>` del shell (`home.tsx`) lleva `min-w-0` — es hijo flex, y
  sin eso cualquier contenido ancho (tablas, gráficos) empuja la página entera más allá del
  viewport en móvil en lugar de scrollear dentro de su contenedor.
- **Tablas anchas en móvil:** no alcanzan `overflow-x-auto`; el patrón es doble render —
  tarjetas en `md:hidden` con los campos clave y la grilla completa en `hidden md:block`
  (modelo: `ventas-articulos-view.tsx`).
- **Gráficos:** recharts con `ResponsiveContainer` (modelo: `ventas-dashboard-chart.tsx`).
  Colores del tema vía `var(--primary)`, `var(--border)`, etc. (funcionan en claro/oscuro).
- **Export Excel/PDF** (modelo: `ventas-articulos-view.tsx`): Excel = tabla HTML descargada
  como `.xls` (sin librería); PDF = `jspdf` + `jspdf-autotable`, se abre en pestaña nueva con
  `window.open(doc.output("bloburl"))`, no `doc.save()`. Definir las columnas una sola vez
  (array `COLUMNAS` con `titulo` + `valor(fila)`) y reusarlas en grilla + ambos exports; los
  totales igual (`filaTotales`). **Encabezado del PDF:** logo del proyecto + título + subtítulo
  gris — el logo se carga de `public/logo.png` con fetch → data URL (`cargarLogo()`) y se
  incrusta con `doc.addImage(...)`; si falla el fetch, el PDF sale sin logo (nunca abortar el
  export por el logo). Todo reporte PDF nuevo debe seguir este formato de encabezado.
- **Subir imágenes a wasender:** el MIME se detecta de los **magic bytes** del archivo, nunca
  de `file.type` (en Android miente: fotos `.jpg` que son WEBP/HEIC). wasender `/api/upload`
  valida contenido vs. tipo declarado y solo acepta JPEG/PNG; lo demás se recodifica a JPEG
  con canvas. Ver `mimeReal`/`recodificarJpeg` en `whatsapp-view.tsx`.

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

- **Descargar APK:** botón en el login (`src/routes/index.tsx`). Sirve `public/lubrimesys.apk`
  directo desde GitHub Pages (mismo origen; ya no se usa GitHub Releases). Al tocarlo se abre
  `src/components/apk-install-guide.tsx` con los pasos de instalación: Android **no abre el
  instalador solo** tras una descarga web (no hay API para eso) — el usuario debe tocar la
  notificación de descarga y permitir "Instalar apps de fuentes desconocidas".
- **Aviso de actualización:** `src/components/apk-update-banner.tsx` + `src/hooks/use-apk-update.ts`.
  Dentro del APK compara su versión (`@capacitor/app`) contra `public/apk-version.json`; si hay una
  mayor, muestra un banner con botón que descarga el APK nuevo y abre la misma guía de instalación.
  Al publicar una versión: subir `versionName` en `android/app/build.gradle`, regenerar el APK a
  `public/lubrimesys.apk` y poner la misma versión en `public/apk-version.json` (ver GENERAR_APK.md).
- **Biometría (`src/lib/biometric.ts`):** solo dentro del APK (`capacitor-native-biometric`).
  Se **activa desde Perfil** (`perfil-modal.tsx`): pide la contraseña, la valida con `login()` y
  recién ahí guarda las credenciales en el Keystore tras verificar huella/cara. El login solo
  muestra "Ingresar con biometría" cuando ya está activa.
- Solo hay que **regenerar el APK** si cambia ícono, nombre, `appId`, `server.url`, un plugin nativo,
  o la versión. Nunca por cambios de contenido web.
