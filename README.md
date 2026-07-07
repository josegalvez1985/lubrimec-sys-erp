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

- **Dashboard** (vista fija) — de arriba a abajo:
  - **Cobros por acreditar** (tarjeta): cheques/tarjetas/transferencias pendientes; cada fila abre
    el modal de acreditación de la página 111. Se oculta si no hay pendientes.
  - **Cobranza de hoy:** KPI del total cobrado hoy (tarjeta) + dona por forma de cobro. Reusa el
    endpoint `cierre-dia` (trae todo sin filtrar fecha en SQL) y filtra "hoy" + agrupa por forma en
    el front (mismo patrón que la página Cierre del Día).
  - **Ventas por día:** gráfico (barras/línea/área, recharts) con filtros año/mes. Endpoints:
    `db/ORDS_VENTAS_DASHBOARD.sql` (`ventas/anios`, `ventas/meses`, `ventas/por-dia`).
- **Marcas** (page_id 6) — CRUD, referencia del patrón.
- **Personas** (page_id 2) — CRUD de clientes/proveedores. Tabla con búsqueda (nombre/CI/RUC/
  teléfono) y columna de acciones (ver/editar/borrar); formulario en modal para crear/editar
  (selects tipo F/J, cliente-proveedor C/P/A, sexo, fecha). "Nombre de fantasía" se autocopia del
  "Nombre" hasta que se edite a mano. Backend: `db/personas_sql.sql`.
- **Pedidos de Artículos** (page_id 63) — grilla de compras/ventas/existencia/costo por artículo.
  Filtrado 100% en el front: búsqueda + facetas dependientes en sidebar (En Falta, Rubro, Proveedor)
  y orden por columnas. Check + cantidad por fila y botón "Copiar pedido" al portapapeles. Backend:
  `db/ORDS_PEDIDOS_ARTICULOS.sql` (query cruda, devuelve todo el dataset).
- **Ventas Por Artículos** (page_id 54) — grilla con filtros (búsqueda, fecha, año/mes,
  vendedor), totales, export a Excel/PDF y vista de tarjetas en móvil. Por defecto carga el
  último día con ventas. Backend: `db/ORDS_VENTAS_ARTICULOS.sql`.
- **Artículos Más Vendidos** (page_id 102) — ranking por cantidad de ventas. El backend
  (`db/ORDS_ARTICULOS_MAS_VENDIDOS.sql`) devuelve **todo el dataset de una vez** y el filtrado se
  hace **100% en el front** (sin round-trips por filtro):
  - **Búsqueda** dinámica (al escribir, sobre descripción/OEM/proveedor/marca).
  - **Facetas dependientes** multi-select (proveedor, rubro, viscosidad, marca, unidad) con
    checklist desplegable: OR dentro de una faceta, AND entre facetas distintas; las opciones de
    cada faceta se recalculan según lo ya filtrado (no se ofrecen valores incompatibles).
  - **Armar pedido:** check + cantidad por artículo y botón "Copiar pedido" que copia al
    portapapeles el listado (`N x descripción`) para enviarlo al proveedor por WhatsApp (copia con
    fallback a `execCommand` para HTTP/WebView sin `navigator.clipboard`).
  - Export a Excel/PDF.
- **Cotización** (page_id 98) — no es una vista propia: abre el cotizador externo
  (`https://www.lubrimec.shop/cotizador`) embebido en un modal (iframe). Se intercepta en
  `handleNav` de `src/routes/home.tsx`.
- **Mensajes a WhatsApp** (page_id 117) — envío masivo de texto/imagen vía wasenderapi:
  números desde la BD (`numeros_whatsapp`) o manuales, importar CSV de contactos, envío async con
  progreso, borrador persistente, guía de uso integrada. Backend: `db/whatsapp_sql.sql`
  (paquete + endpoints), `db/PROC_ENVIAR_MENSAJES_WHATSAPP.sql`, `db/WHATSAPP_DDL.sql`.
- **Códigos de Barras** (page_id 24) — CRUD de `codigos_barras`. El artículo se elige con un
  buscador con debounce (endpoint `articulos/buscar`); grilla con `DataTable` + export. Backend:
  `db/codigos_barras_sql.sql`.
- **Artículos-Proveedores** (page_id 27) — CRUD de `articulos_proveedores` (relación artículo↔
  proveedor + código del proveedor). Dos buscadores con debounce (`articulos/buscar`,
  `proveedores/buscar`). Backend: `db/articulos_proveedores_sql.sql`.
- **Artículos** (page_id 4) — CRUD de `articulos` (tabla maestra). FKs (IVA, unidad, rubro, marca,
  viscosidad) por `<select>` de catálogos; imagen en BLOB. `precio_venta`, `existencia`,
  `cantidad_vendida`, `costo_ultima_compra`, `fecha_ultimo_inventario` son **solo lectura** (los
  mantienen otros procesos). La grilla muestra un **thumbnail** por el endpoint público
  `articulos/:id/imagen`; el modal de detalle trae la imagen grande vía `articulos/:id` (base64).
  Backend: `db/articulos_sql.sql`.
- **Detalle de Monedas** (page_id 83) — vista propia del detalle de `monedas_detalle`: selector de
  moneda + denominaciones con imagen. Reutiliza `DetalleMoneda` de la página 18. Sin backend nuevo.
- **Vehículos-Repuestos** (page_id 94) — CRUD de `vehiculos_repuestos` (modelo ↔ código OEM). El
  OEM se elige con un buscador que toma el `codigo_oem` de un artículo (endpoint `articulos/buscar`).
  Backend: `db/vehiculos_repuestos_sql.sql`.
- **Rendición de Caja** (page_id 73) — CRUD de `rendiciones_cajas` (cierres de caja por fecha).
  Al elegir la fecha, un endpoint `rendiciones/sugeridos` precarga (editables) caja anterior, venta
  y pago replicando los auto-cálculos del modal APEX; `Total Caja = caja_anterior + venta − retiro
  − pago` se calcula en vivo. Backend: `db/rendiciones_cajas_sql.sql`.
- **Ventas** (page_id 60) — grilla de `ventas_cabecera` (solo update/delete: las ventas se crean en
  otro sistema) con filtros de fecha (por defecto el último día con ventas). Por fila: **Artículos**
  (detalle `ventas_detalle` editable, pág 109), **Cobros** (cobros de la factura editables, pág 110,
  reusa el modal de la pág 65) y editar/eliminar la cabecera. Backend: `db/ventas_sql.sql`.
- **Cobros de Ventas** (page_id 65) — CRUD de `ventas_cobros`. La factura se elige con buscador
  (`ventas/buscar`); selects de forma/banco/moneda; vuelto auto-calculado (`recibido − total`).
  Filtra por `cod_empresa` vía JOIN a `ventas_cabecera`. Backend: `db/ventas_cobros_sql.sql`.
- **Acreditación de Cobros** (page_id 111) — lista los cobros bancarios (formas 41/42/21) sin
  acreditar (`ind_acreditado='N'`); cada fila abre un modal que hace
  `UPDATE ventas_cobros SET ind_acreditado='S', monto_acreditado=…`. También aparece como tarjeta en
  el dashboard. Backend: `db/ventas_acreditar_sql.sql`.
- **Precios de Ventas** (page_id 34) — CRUD de `precios_ventas` (historial de precios por artículo).
  `fecha` la asigna un trigger; otro trigger sincroniza `articulos.precio_venta` con el último
  precio (el paquete resincroniza también en update/delete). Al elegir artículo, un endpoint
  `precios-ventas/sugerir` replica los Dynamic Actions del APEX: precio de compra + nro línea de la
  factura, % recargo del rubro, **precio de venta sugerido** (`CEIL((compra·(1+recargo/100))/1000)·
  1000` con delivery prorrateado) y **precio de venta anterior** (`pkg_ventas.fn_precio_venta`).
  Grilla con margen/rubro/marca/OEM. Backend: `db/precios_ventas_sql.sql`.

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
- Descarga: botón "Descargar apk" en el login, sirve `public/lubrimesys.apk` desde GitHub Pages.
  Al tocarlo se abre una guía de instalación paso a paso (`apk-install-guide.tsx`): Android no
  abre el instalador solo, hay que tocar el archivo descargado y permitir "Instalar apps
  desconocidas".
- Actualización: banner dentro del APK que compara su versión (`@capacitor/app`) contra
  `public/apk-version.json`. Al tocar "Actualizar" descarga el APK dentro de la app
  (`@capacitor/filesystem`) y lanza el instalador de Android directo
  (`@capacitor-community/file-opener`); si falla, cae al flujo viejo (navegador + guía).
  Android siempre pide confirmar la instalación (no autoactualiza fuera de Play Store).
- Versiones: el login muestra `Sistema vX.Y.Z` (tomada de `public/apk-version.json`, embebida
  en el build) y, dentro del APK, también `APK vX.Y.Z` (el `versionName` instalado).
- Biometría: dentro del APK se activa desde **Perfil** (pide contraseña, la valida contra el
  servidor y guarda en el Keystore); el login solo ofrece "Ingresar con biometría" si ya está
  activa (`src/lib/biometric.ts`).
- Regenerar el APK solo si cambia ícono, nombre, `appId`, `server.url`, un plugin nativo o la versión.

## Documentación

- [db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md) — mapear tablas Oracle a endpoints ORDS.
- [src/GUIA_FRONT.md](src/GUIA_FRONT.md) — consumo desde el front, proxy y gotchas.
- [GENERAR_APK.md](GENERAR_APK.md) — generar, firmar, publicar y versionar el APK.
