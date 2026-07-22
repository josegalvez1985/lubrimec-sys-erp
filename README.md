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
- **Compras por Artículos** (page_id 55) — reporte de solo lectura de `COMPRAS_ARTICULOS`
  (`tip_comprobante != 'AJS'`). Búsqueda + facetas Proveedor/Fecha/Referencia, **carga incremental
  por mes** ("Mostrar más"), imagen por artículo, total al pie y export. Backend:
  `db/compras_articulos_sql.sql`.
- **Ficha de Artículos** (page_id 56) — reporte de solo lectura de `V_FICHA_EXISTENCIA`
  (movimientos por artículo). Búsqueda + facetas Rubro/Tipo/Activo/Fecha, carga por mes, imagen.
  Backend: `db/ficha_existencia_sql.sql`.
- **Artículos sin Código de Barra** (page_id 57) — artículos activos con existencia y sin código
  de barra (excluye rubros 30/39). Búsqueda + faceta Rubro + imagen. Backend:
  `db/articulos_sin_barra_sql.sql`.
- **Consulta de Precios** (page_id 61) — buscador por **código de barra** (pistola en mostrador):
  resuelve el artículo desde `codigos_barras` y muestra una tarjeta con precio
  (`pkg_ventas.fn_precio_venta`), existencia (`pkg_stock.fn_existencia`), imagen embebida, marca,
  rubro y viscosidad. Backend: `db/consulta_precios_sql.sql`.
- **Existencia de Artículos** (page_id 70) — existencia agrupada por artículo (SUM de cantidad) +
  costo. Búsqueda + facetas OEM/Activo, imagen. **Costo último / total costo solo para JOSEG**
  (permiso por usuario, replica `fn_verifica_campo`). Backend: `db/existencia_articulos_sql.sql`.
- **Compras Vs Ventas** (page_id 75) — dos grillas (compras `COMPRAS_ARTICULOS` sin `FCR`, ventas
  `VENTAS_ARTICULOS`) del año elegido + KPIs de resumen (Rentabilidad / Compras / **Ganancia** =
  rentabilidad − compras). Filtros Año/Mes (single-select, actuales por defecto) y ¿Activos/Gastos?
  como botones Si/No, imagen por artículo. Un solo endpoint devuelve ambos datasets. Backend:
  `db/compras_vs_ventas_sql.sql`.
- **Saldos de Proveedores** (page_id 79) — facturas de compra (`FCR`) + pagos (UNION), con saldo
  por factura (`pkg_compras.fn_saldo_proveedor`) y próximo pago (`fn_fecha_pago`). Búsqueda +
  facetas Proveedor/Factura + botones ¿Saldo? y KPI de saldo total pendiente. Backend:
  `db/saldos_proveedores_sql.sql`.
- **Consulta de Inventarios** (page_id 80) — último inventario por artículo (`V_FICHA_EXISTENCIA`)
  con cantidad física vs sistema y diferencia. Búsqueda + facetas Fecha/Rubro/Marca + botones
  ¿Con diferencia?/¿Cerrado?/¿Es activo?. **Vista en tarjetas** con imagen embebida (como el APEX
  NATIVE_CARDS). Backend: `db/consulta_inventarios_sql.sql`.
- **Punto de Venta** (page_id 39) — POS completo (reemplaza las páginas APEX 39/40/45/47 y sus
  `apex_collections`): panel de artículos con stock (facetas Marca/Rubro, búsqueda, lector de código
  de barra, % descuento, imagen) + carrito en estado React (cantidad ±, total) + modal de
  facturación con datos de la factura (cliente con buscador, vendedor, serie/talonario) y **formas de
  cobro múltiples**. **Efectivo con vuelto:** el cajero ingresa lo recibido; se imputa `min(recibido,
  restante)` y el excedente es el vuelto (se guardan `total`/`efectivo_recibido`/`efectivo_vuelto`).
  Con una sola forma de cobro no se controla el total (permite vuelto); con varias, la suma debe
  igualarlo, y nunca superarlo. **Validaciones todas en el front** (cabecera, detalle, cobros). En
  **móvil** el carrito se abre desde un botón flotante (FAB) en un modal. Al facturar, un POST atómico
  (`pos/registrar`) hace los 3 INSERT (`VENTAS_CABECERA/DETALLE/COBROS`) en una transacción con
  `PKG_VENTAS.fn_id_factura()`. La grilla usa la query "POS v2" (precio de tabla, existencia
  compras−ventas, descuento por `fn_porc_descuento`). Backend: `db/punto_venta_sql.sql`.
- **Compras** (page_id 28/36) — maestro-detalle de `compras_cabecera`/`compras_detalle` (réplica de
  Ventas): grilla con filtros año/mes, alta "Nueva compra" (sugeridos de nro/timbrado), edición y
  detalle de artículos con costo anterior por proveedor. **LOV de proveedores propio**
  (`compras-cabecera/buscar-proveedores`): el endpoint devuelve **todos** los proveedores y el
  front filtra flexible — nombre sin distinguir mayúsculas/minúsculas, RUC/CI con o sin guion, sin
  tope de resultados (patrón preferido para LOVs de catálogos chicos; ver las guías). Backend:
  `db/compras_sql.sql`.
- **Inventario** (page_id 58/59) — CRUD de conteos de `INVENTARIO`. El modal Crear (pág 59) filtra
  el artículo por ¿Es Activo?/Categoría/Marca, resuelve códigos de barra
  (`inventario/articulo-por-barra`) y el backend calcula `cantidad_sistema` con
  `pkg_stock.fn_existencia`. LOVs propias del módulo (lista completa + filtro front). Backend:
  `db/inventario_sql.sql`.
- **Artículos para Inventario** (page_id 76) — hoja de conteo físico de solo lectura (columna
  Cantidad en blanco para llenar a mano). Búsqueda + facetas Es Activo/Rubro/Marcas 100% en el
  front. Backend: `db/articulos_para_inventario_sql.sql`.
- **Ajustar Inventarios** (page_id 87/88) — último conteo por artículo con costo último y
  diferencia; facetas Cerrado/Diferencia/Rubro/Marca + Total Costo. El modal Aplicar (pág 88)
  genera un **comprobante de ajuste AJS-E** (`COMPRAS_CABECERA`+`DETALLE`) en una transacción
  atómica, cierra el conteo y marca `fecha_ultimo_inventario`; botón "Ajustar Diferencias 0"
  cierra en lote los conteos sin diferencia. Muestra la foto del conteo (endpoint público
  `inventario/:id/foto`). Backend: `db/ajustar_inventarios_sql.sql`.
- **Parámetros** (page_id 89/90) — CRUD de `PARAMETROS` (parámetro/valor/observación);
  parámetro y valor se guardan en MAYÚSCULAS. Backend: `db/parametros_sql.sql`.
- **Planilla para inventarios** (page_id 112/113/115) — conteos **abiertos** de `INVENTARIO`.
  "Crear Planilla" (pág 113) genera conteos masivos por Rubro/Marca/Viscosidad (LOVs en cascada
  derivadas de los artículos pendientes según la fecha del parámetro `FECHA_INVENTARIO`). El modal
  Cantidad (pág 115) edita la cantidad física y permite **tomar una foto** (cámara trasera,
  compresión a 600px JPEG ≤100KB) que se sube como **binario crudo** (`PUT
  planilla-inventarios/:id/foto`, bind `:body` BLOB); muestra además la imagen del artículo.
  Backend: `db/planilla_inventarios_sql.sql`.
- **Sortear** (page_id 108) — sorteo de teléfonos de `VENTAS_CABECERA` en un rango de fechas
  (cada venta = una participación). Animación de 10 s con números enmascarados (`••••9999`) y
  botón "Mostrar Ganador" que revela el número completo. Backend: `db/sortear_sql.sql`.
- **Roles de Páginas** (page_id 37/38/64) — CRUD de `ROLES_PAGINAS` (PK compuesta
  app_id+página+usuario; 5 permisos S/N). LOVs de usuarios (`WWV_FLOW_USERS`) y páginas
  (`APEX_APPLICATION_PAGES`, requiere el fix de workspace); al crear se excluyen las páginas ya
  asignadas al usuario. "Copiar Roles" (pág 64) copia los roles de un usuario a otro (solo los
  que no tiene). Backend: `db/roles_paginas_sql.sql`.

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
