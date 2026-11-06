# Lubrimesys — Sistema administrativo ERP

Panel administrativo web (PWA) para Lubrimec: inventario, ventas, clientes, reportes y mensajería
por WhatsApp. Frontend **TanStack Start** (React 19) sobre backend **Oracle APEX/ORDS**.

## Stack

- **Frontend:** TanStack Start (React 19 + Router + Query), shadcn/ui (Radix + Tailwind v4), Vite.
  Los `paths` del `tsconfig` (el alias `@/`) los resuelve Vite de forma **nativa**
  (`resolve.tsconfigPaths: true`, desde Vite 7); ya no se usa el plugin `vite-tsconfig-paths`.
- **Servidor:** Nitro (Node). Gestor de paquetes: **npm**.
- **Backend:** Oracle APEX/ORDS (esquema `JOSEGALVEZ`, módulo `lubrimec`). Auth con token Bearer
  (6 h, tabla `LUBRIMEC_TOKENS`). Las credenciales las valida APEX; los **usuarios bloqueados**
  (`ACCOUNT_LOCKED`) se rechazan en el login **y** en cada request, así bloquear a alguien en APEX
  le corta también la sesión que ya tenía abierta (`PKG_AUTH_LUBRIMEC.usuario_bloqueado`).
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

**Primer arranque (después de clonar):** no hay nada que configurar.

```bash
npm install
npm run dev            # http://localhost:8080 (puerto fijo: strictPort)
```

Los valores de desarrollo vienen en **`.env.development`**, que está en el repo y Vite lee solo
con `npm run dev`. `ORDS_TARGET` no hace falta: el proxy ya apunta a `https://oracleapex.com` por
defecto.

> **Para cambiar algo solo en tu máquina,** crear un `.env` desde `.env.example` (git lo ignora).
> Ojo: `.env.development` tiene prioridad sobre `.env`; para pisar una variable de ese archivo,
> usar `.env.development.local`.

> **Síntoma de que falta `VITE_API_URL`:** el login responde **"Usuario o contraseña incorrectos"**
> con credenciales válidas. La llamada va a `/auth/login` del propio dev server, que devuelve el
> HTML del SPA; al no ser JSON, el cliente lo reporta como credenciales inválidas.

> **Nada sensible en `.env.development`, `.env.example` ni en el repo.** Solo llevan URLs y el app
> id, datos públicos (las `VITE_*` además terminan embebidas en el JS que baja el navegador). Las
> claves y contraseñas no van acá: la clave de la API del asistente se carga en Oracle con
> `PKG_IA_LUBRIMEC.fijar_clave` y las credenciales las valida APEX. Si algún día hace falta un
> secreto del lado servidor, va **solo** en el `.env` local (ignorado por git) y en
> `.env.example` se agrega el nombre con el valor vacío.

### Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm run build` | Build de producción. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier. |
| `npm run cap:sync` | Sincroniza la config de Capacitor con Android. |

## Diseño responsive (Web + Mobile)

La app tiene que servir bien **1920×1080 y 1366×768** en escritorio y tener una experiencia
**móvil propia**, no una versión encogida. **Nunca con `zoom` global.**

Los tamaños de control y los espaciados viven **centralizados en variables CSS** en
`src/styles.css` (`--ui-font`, `--control-h`, `--panel-p`, `--cell-px`, `--topbar-h`,
`--sidebar-w`, …), que consumen los componentes de `src/components/ui/` y el shell. Cambiar un
valor ahí reescala toda la app sin tocar las vistas. Tres regímenes:

| Rango | Comportamiento |
|---|---|
| Escritorio (default) | `clamp()` entre 1280 y 1920px: controles ~32px en 1366, ~36px en 1920 |
| Notebook chico / tablet (`<1024px`) | extremo compacto de la escala, fijo |
| Móvil (`<640px`) | controles **más grandes** (44px táctiles) y campos de 16px (evita el zoom de iOS) |

Lo que ya es automático en móvil: el **`DataTable` se convierte en tarjetas** (una por fila, con
sus totales al pie y acciones de 40px) en vez de una tabla con scroll horizontal, y los
`DialogContent` traen alto máximo, scroll y margen lateral. Detalle y qué sigue siendo
responsabilidad de cada vista: [src/GUIA_FRONT.md](src/GUIA_FRONT.md).

## Estructura

- `src/routes/` — rutas (login `index.tsx`, `home.tsx`) y proxy ORDS (`api/ords.$.ts`).
- `src/components/` — vistas de páginas (`marcas-view.tsx`, `whatsapp-view.tsx`) y UI (`ui/`:
  `data-table`, `faceta`, `input-monto`, `buscador-select` (catálogos grandes, dropdown inline),
  `buscador-modal` (catálogos grandes en modal aparte con buscador) y `selector-modal` para LOVs
  cortas en modal de botones).
- `src/lib/api.ts` — cliente HTTP: sesión, `authFetch`, funciones por tabla.
- `src/lib/vistas.tsx` — mapa `page_id` → vista, cargadas con `React.lazy` (una por chunk).
- `src/hooks/` — hooks (aviso de actualización del APK).
- `db/` — paquetes PL/SQL y scripts ORDS de cada tabla.
- `android/` — proyecto Capacitor para el APK.

## Backend (ORDS) — agregar una tabla

Patrón: **un solo archivo por tabla**, `db/<tabla>_sql.sql`, con el paquete PL/SQL
(`PKG_<TABLA>_LUBRIMEC`) y los endpoints ORDS en dos secciones — más el cliente en
`src/lib/api.ts`. (Los pares separados `PKG_*.sql` + `ORDS_*.sql` son la convención vieja; no
volver a separarlos.) Guía completa: **[db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md)**.
Referencia viva: tabla `marcas`.

> Los `.sql` de este repo **no se aplican solos**: hay que ejecutarlos a mano en la BD como
> `JOSEGALVEZ`. Si el front manda un parámetro que el handler ignora, o un endpoint responde 404,
> lo primero a descartar es que la BD tenga una versión anterior del paquete.

Detalles del consumo desde el front y gotchas del proxy: **[src/GUIA_FRONT.md](src/GUIA_FRONT.md)**.

## Páginas implementadas

Las páginas se mapean por `page_id` de APEX en `src/lib/vistas.tsx` (mapa `VISTAS`), cada una
cargada con `React.lazy` para que baje solo al abrirse. El menú y los accesos rápidos se arman
dinámicamente desde el endpoint `menu/paginas`.

- **Shell (menú y topbar)** — el **sidebar arranca siempre oculto** (la preferencia no se recuerda);
  se muestra con el botón de la topbar. Junto al usuario hay un **botón Home** que vuelve al
  dashboard, visible solo cuando se está en otra página.
- **Asistente** (sin page_id, en todas las pantallas) — botón redondo que arranca abajo a la
  derecha y se puede **arrastrar a cualquier lugar de la pantalla**, con mouse o con el dedo (el
  lugar se recuerda en cada dispositivo). Al tocarlo abre un chat: responde cómo se usa una
  pantalla (con esta sección del README como manual) y
  preguntas sobre los datos (ventas, stock, cobros…). En escritorio es un panel a la derecha que
  no tapa la página y sigue abierto al navegar; en el celular, una hoja casi a pantalla completa
  (el botón atrás del APK la cierra). Lo ve todo el que entra, sin permiso en Roles de Páginas;
  límite de preguntas por usuario y por día (30 de entrada). **Compras, costos, márgenes,
  comisiones y sueldos solo se los responde a JOSEG**; a los demás les dice que no están disponibles
  para su usuario. La conversación vive solo en memoria:
  recargar o cambiar de usuario la borra. **Solo lee**: si piden cargar algo, explica en qué
  pantalla se hace. **Nunca muestra cómo está hecha la base** (tablas, columnas, paquetes, SQL),
  aunque se lo pidan: lo prohíben sus instrucciones, el backend borra de la respuesta cualquier
  nombre del esquema que se le escape, el SQL no viaja al navegador y los errores llegan sin
  detalle técnico. El manual que recibe se arma en el build sin nombres técnicos (plugin de
  `vite.config.ts` + `src/lib/manual-asistente.ts`), así que el README completo tampoco se publica.
  Front: `src/components/asistente.tsx`, `src/lib/asistente.ts` y
  `src/components/markdown.tsx` (renderer propio, sin dependencias ni HTML crudo). Backend:
  `db/ia_asistente_sql.sql` — la IA corre en Oracle (`PKG_IA_LUBRIMEC` llama a la API de Claude,
  la clave nunca llega al navegador) y cada consulta SQL que pide pasa un filtro y corre en
  `READ ONLY`; las tablas `LUBRIMEC_*` (tokens, clave, registro) quedan fuera de su alcance. La
  clave se carga a mano con `PKG_IA_LUBRIMEC.fijar_clave` y se prueba con `PKG_IA_LUBRIMEC.probar`;
  modelo, límite y filas se cambian en `LUBRIMEC_IA_CONFIG`, y cada pregunta (con su SQL y
  tokens) queda en `LUBRIMEC_IA_CONSULTAS`. El manual se arma con el título
  `## Páginas implementadas` hasta `## Rendimiento`: si se renombran, el asistente pierde el manual.
- **Dashboard** (vista fija) — de arriba a abajo. Todos los paneles de cobros **se ocultan si no
  tienen registros** (si el endpoint falla, en cambio, muestran el error):
  - **Cobros por acreditar** (tarjeta): cheques/tarjetas/transferencias pendientes; cada fila abre
    el modal de acreditación de la página 111.
  - **Cobranza de hoy + Cobros con tarjeta** (misma fila desde `xl`): a la izquierda el KPI del
    total cobrado hoy y la dona por forma de cobro; a la derecha los cobros con tarjeta por
    acreditar. La cobranza reusa el endpoint `cierre-dia` (trae todo sin filtrar fecha en SQL) y
    filtra "hoy" + agrupa por forma en el front (mismo patrón que la página Cierre del Día).
  - **Ventas por día:** gráfico (barras/línea/área, recharts) con filtros año/mes. Endpoints:
    `db/ORDS_VENTAS_DASHBOARD.sql` (`ventas/anios`, `ventas/meses`, `ventas/por-dia`).
- **Marcas** (page_id 6) — CRUD, referencia del patrón.
- **Personas** (page_id 2) — CRUD de clientes/proveedores. Tabla con búsqueda (nombre/CI/RUC/
  teléfono) y columna de acciones (ver/editar/borrar); formulario en modal para crear/editar
  (selects tipo F/J, cliente-proveedor C/P/A, sexo, fecha). "Nombre de fantasía" se autocopia del
  "Nombre" hasta que se edite a mano. Backend: `db/personas_sql.sql`.
- **Pedidos de Artículos** (page_id 63) — **una fila por `codigo_oem`** con Existencia y los
  totales Vendidas/Compradas; la segunda columna es **"Rubro / Artículo"**: muestra el nombre del
  artículo cuando el OEM tiene **un solo proveedor** (no hay ambigüedad) y el rubro cuando tiene
  varios (única etiqueta común). Tocando el OEM se abre un **modal con el desglose por proveedor**
  (artículo, costo último, compradas, vendidas del artículo). El endpoint devuelve una fila por
  (OEM, proveedor), así que la grilla repetía cada OEM tantas veces como proveedores tuviera: el
  agrupado se hace en el front (`agrupar()`) desde el grano **artículo**: el backend devuelve
  `ventas_articulo` y `existencia_articulo` además de los totales por OEM, y el front los suma por
  artículo distinto. Gracias a eso **filtrar por proveedor o marca acota las tres columnas a la
  vez** (existencia, ventas y compras de los artículos filtrados), en lugar de mezclar una
  columna acotada con dos enteras (ver "Dataset con grano mixto" en
  [src/GUIA_FRONT.md](src/GUIA_FRONT.md)). Filtrado 100% en el front: búsqueda (incluye las
  descripciones de los artículos, que ya no son columna) + facetas dependientes en sidebar (En
  Falta, Rubro, Proveedor, Marca — las dos últimas multivaluadas y de fila: el OEM pasa si alguna
  de sus filas cumple lo tildado, y se acota a esas filas, así que filtrar por **marca** también
  recalcula existencia, ventas y compras con solo los artículos de esa marca; con proveedor y
  marca a la vez, la misma fila tiene que cumplir los dos) y orden por columnas. La marca es la
  del artículo (`marca` en el endpoint); mientras la BD no tenga esa versión, la faceta no
  aparece. Check + cantidad por fila y botón "Copiar pedido" al portapapeles: cada línea lleva el
  **costo de compra** (costo último de esa línea artículo + proveedor; con más de una unidad,
  `₲ costo c/u = ₲ subtotal`) y el texto cierra con `Total: ₲ …` (las líneas sin costo no suman y
  se avisan como `(N sin costo)`). Backend:
  `db/pedidos_articulos_sql.sql` (query cruda, devuelve todo el dataset).
  **La columna Ventas se corrige respecto del APEX**, que la tiene rota (daba 0 para todo): la
  rama VENTAS del UNION cruzaba el cliente de `ventas_cabecera` contra el proveedor de
  `articulos_proveedores`, y un `JOIN personas` inner sobre ese `LEFT JOIN` descartaba el resto.
  Acá las ventas se calculan por `codigo_oem` en un CTE propio (`ventas_oem`), igual que la
  existencia. Los comprobantes **AJS** (ajustes de stock/inventario) ya no se cuentan como venta
  ni como compra, aunque sí siguen moviendo la existencia. Una venta no tiene proveedor: cada fila
  artículo+proveedor muestra el total vendido de ese OEM, al lado del stock del mismo OEM.
- **Ventas Por Artículos** (page_id 54) — grilla con filtros (búsqueda, fecha, año/mes,
  vendedor), totales, export a Excel/PDF y vista de tarjetas en móvil. Por defecto carga el
  último día con ventas. **Permiso `ver_campos`:** 9 columnas (Stock, Costo, Total Costo,
  Precio Lista, %, Descuento, Rent., %Rent. y Factura) solo se ven si
  `pkg_apex_admin.fn_verifica_campo(app_id, 54, app_user)` es verdadero; el backend ni siquiera
  las manda. Backend: `db/ventas_articulos_sql.sql`.
- **Artículos Más Vendidos** (page_id 102) — ranking por cantidad de ventas. El backend
  (`db/articulos_mas_vendidos_sql.sql`) devuelve **todo el dataset de una vez** y el filtrado se
  hace **100% en el front** (sin round-trips por filtro):
  - **Búsqueda** dinámica (al escribir, sobre descripción/OEM/proveedor/marca).
  - **Facetas dependientes** multi-select (proveedor, rubro, viscosidad, marca, unidad) con
    checklist desplegable: OR dentro de una faceta, AND entre facetas distintas; las opciones de
    cada faceta se recalculan según lo ya filtrado (no se ofrecen valores incompatibles).
  - **Orden por columna:** las 7 columnas ordenan (click en el header, asc/desc). Arranca en
    Cantidad Ventas desc, que es el orden que ya devuelve el backend. El `sort` usa el valor
    **crudo**, no el formateado (con `fmtN` el orden saldría alfabético), la fecha se invierte a
    `yyyymmdd` para comparar, y se ordena **antes de paginar** (si no, cada página se ordenaría
    por separado). Cambiar el orden vuelve a la página 1.
  - **30 filas por página** (`POR_PAGINA`).
  - **Armar pedido:** check + cantidad por artículo, botón "Copiar pedido" y botón **"Limpiar"**
    que vacía el pedido (aparece solo si hay algo cargado). El texto copiado antepone el **código
    del proveedor**: `N x <id_cod_proveedor> · <OEM> <descripción>` — el OEM solo si la
    descripción no lo trae ya adentro. Copia con fallback a `execCommand` para HTTP/WebView sin
    `navigator.clipboard`.
  - **`cod_proveedor`** (columna "Cód. Prov."): el/los código(s) con que el proveedor identifica
    el artículo. Se calcula en el CTE `codigos_prov`, **colapsado a una fila antes de unirlo** —
    joinear `articulos_proveedores` directo duplica filas (ver "fan-out" en
    [db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md)). El vínculo va por **nombre**, porque
    `articulos_mas_vendidos` guarda `nombre_proveedor` y no `cod_persona`.
  - **Solo proveedores** (CTE `prov_valido`): se listan únicamente artículos cuyo proveedor tiene
    `ind_cliente_proveedor` en (P, A), mismo criterio que la pág 63 y que las LOVs de proveedores.
    Es un INNER JOIN: un artículo cuyo proveedor esté marcado solo como Cliente **no aparece**.
  - Export a Excel/PDF.

  > **Ojo con `cantidad_ventas` y `stock`:** la página **no los calcula**, los lee tal cual de la
  > tabla `articulos_mas_vendidos`, que arma el job `JOB_ARTICULOS_MAS_VENDIDOS` (fuera de este
  > repo). Si algún número sale inflado, el origen está en ese job — probablemente el mismo
  > fan-out de `articulos_proveedores`, no en el handler ni en el front.
- **Cotización** (page_id 98) — no es una vista propia: abre el cotizador externo
  (`https://www.lubrimec.shop/cotizador`) embebido en un modal (iframe). Se intercepta en
  `handleNav` de `src/routes/home.tsx`.
- **Mensajes a WhatsApp** (page_id 117) — envío masivo de texto/imagen vía wasenderapi:
  números desde la BD (`numeros_whatsapp`) o manuales, importar CSV de contactos, envío async con
  progreso, borrador persistente, guía de uso integrada. Backend: `db/whatsapp_sql.sql`
  (paquete + endpoints), `db/PROC_ENVIAR_MENSAJES_WHATSAPP.sql`, `db/WHATSAPP_DDL.sql`.
- **Códigos de Barras** (page_id 24) — CRUD de `codigos_barras`. El artículo se elige con un
  buscador con debounce sobre el endpoint `articulos/buscar`, que devuelve el **catálogo completo**
  de artículos activos (`ESTADO='A'`) y filtra en el front por palabras sueltas, ID u OEM parcial;
  grilla con `DataTable` + export. Ese mismo endpoint alimenta las LOVs de artículos de
  Artículos-Proveedores y Vehículos-Repuestos. Backend: `db/codigos_barras_sql.sql`.
- **Artículos-Proveedores** (page_id 27) — CRUD de `articulos_proveedores` (relación artículo↔
  proveedor + código del proveedor). Dos buscadores con debounce (`articulos/buscar`,
  `proveedores/buscar`). Backend: `db/articulos_proveedores_sql.sql`.
- **Artículos** (page_id 4) — CRUD de `articulos` (tabla maestra). FKs (IVA, unidad, rubro, marca,
  viscosidad) por `<select>` de catálogos; imagen en BLOB. `precio_venta`, `existencia`,
  `cantidad_vendida`, `costo_ultima_compra`, `fecha_ultimo_inventario` son **solo lectura** (los
  mantienen otros procesos). La grilla muestra un **thumbnail** por el endpoint público
  `articulos/:id/imagen` (al tocarlo se **amplía en un modal**); el modal de detalle trae la imagen
  grande vía `articulos/:id` (base64). Backend: `db/articulos_sql.sql`.
  **Stock por artículo:** grilla y detalle lo calculan con `pkg_stock.fn_existencia(id_articulo,
  cod_empresa)` (decisión del usuario: por artículo, no por OEM). La columna guardada
  `ARTICULOS.existencia` queda desactualizada y hacía que el stock no coincidiera con Ventas por
  Artículos.
- **Detalle de Monedas** (page_id 83) — vista propia del detalle de `monedas_detalle`: selector de
  moneda + denominaciones con imagen. Reutiliza `DetalleMoneda` de la página 18. Sin backend nuevo.
- **Vehículos-Repuestos** (page_id 94) — CRUD de `vehiculos_repuestos` (modelo ↔ código OEM). El
  OEM se elige con un buscador que toma el `codigo_oem` de un artículo (endpoint `articulos/buscar`,
  catálogo **completo** como toda LOV) y que muestra el **rubro** de cada artículo en la etiqueta,
  para distinguir Filtro de aire / Filtro / Filtro de caja al elegir. La grilla muestra el **Rubro**
  del artículo con ese OEM (JOIN de solo lectura, no se guarda en la tabla) y botones para filtrar
  por rubro las filas ya cargadas. Al lado del OEM, un ícono abre la **imagen del repuesto**
  (`ArticuloImgModal`): es la del artículo con ese OEM —activo primero, el más nuevo, mismo
  criterio que el rubro—, que el `LISTAR` devuelve como `id_articulo` + `articulo` (`OUTER APPLY`).
  Sin artículo para ese OEM, o con la BD sin el paquete nuevo, el ícono no aparece. Backend:
  `db/vehiculos_repuestos_sql.sql` + `BUSCAR_ARTICULOS` de `db/codigos_barras_sql.sql`.
- **Rendición de Caja** (page_id 73) — CRUD de `rendiciones_cajas` (cierres de caja por fecha).
  Al elegir la fecha, un endpoint `rendiciones/sugeridos` precarga (editables) caja anterior, venta
  y pago replicando los auto-cálculos del modal APEX; Total Caja = caja anterior + venta − retiro
  − pago, se calcula en vivo. Backend: `db/rendiciones_cajas_sql.sql`.
- **Ventas** (page_id 60) — grilla de `ventas_cabecera` (solo update/delete: las ventas se crean en
  otro sistema) con filtros de fecha (por defecto el último día con ventas) y **columna Total con
  fila de totales al pie** (el backend la calcula sumando el detalle). Por fila: **Artículos**
  (detalle `ventas_detalle` editable, pág 109), **Cobros** (cobros de la factura editables, pág 110,
  reusa el modal de la pág 65) y editar/eliminar la cabecera. **Eliminar una venta borra en cascada**
  sus cobros y su detalle en una sola transacción (antes fallaba con ORA-02292 y el error quedaba
  mudo). Backend: `db/ventas_sql.sql`.
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
  factura, % recargo del rubro, **precio de venta sugerido** (compra más recargo, redondeado hacia
  arriba al millar, con delivery prorrateado) y **precio de venta anterior** (`pkg_ventas.fn_precio_venta`).
  Grilla con margen/rubro/marca/OEM. Backend: `db/precios_ventas_sql.sql`.
  - **Pestaña "Evolución"** (`evolucion-precios.tsx`, lazy con recharts): cómo cambió el precio
    de venta y el costo en cada registro. Patrón en [src/GUIA_FRONT.md](src/GUIA_FRONT.md)
    ("Reporte con gráficos" y "Filtro multi-selección con chips").
    - **Sin endpoint propio:** reusa `listarPreciosVentas` y calcula en el front lo que sería un
      `LAG()` (precio anterior, variación Gs./%, variación del costo, días entre cambios)
      **sobre el historial entero, y recién después filtra el período** (si no, el primer cambio
      del período quedaría sin precio anterior).
    - **Filtros:** rango de fechas con atajos (3/6/12 meses/Todo), búsqueda, facetas
      Rubro/Marca/**Viscosidad** y "Solo cambios de precio" (oculta los re-registros con el mismo
      precio). La viscosidad sale del `LEFT JOIN viscosidad_lubricantes` del `LISTAR` de
      `db/precios_ventas_sql.sql`; la faceta solo aparece si el backend manda el campo.
    - **Filtro por artículo (multi, hasta 8):** buscador + chips. Acota la tabla y ofrece solo los
      artículos que pasan los demás filtros (las facetas no se acotan por él). Un elegido que deja
      de pasar otro filtro queda como chip atenuado.
    - **Gráfico escalonado** (un precio rige hasta el cambio siguiente):
      - Sin artículos elegidos o con uno: precio de venta y costo de ese artículo (por defecto el
        del cambio más reciente; el ícono de cada fila de la tabla lo cambia).
      - Con **2 o más: comparación** en Gs. con un solo eje. Cada artículo en su color y, en ese
        color, **precio de venta con línea llena y costo con línea punteada** (el color dice qué
        artículo, el trazo qué medida). El color se asigna al elegir el artículo (tokens
        `--viz-serie-1..8` de `styles.css`) y no cambia aunque se quiten otros.
      - Selector **Ambos / Precio venta / Costo** en el panel del gráfico.
    - **Tabla de detalle** (fecha, anterior → nuevo, variación Gs./%, costo, variación del costo,
      margen, días) con export a Excel.
    - **PDF:** logo, filtros aplicados, el gráfico tal como se ve (respeta el selector de líneas)
      y la tabla (`exportarPdfReporte` + `graficoAPng` en `src/lib/export.ts`).
    - **Descartado por el usuario:** KPIs, gráficos por mes, ranking de mayores aumentos y
      variación por rubro. Se probaron y no le servían; no volver a proponerlos.
- **Suba de Precios** (page_id 100) — último precio por artículo con margen y stock. Búsqueda
  (filtro estándar de artículos: palabras sueltas, OEM con o sin guion, ID) + facetas
  Stock/Rubro/Marca con el `Faceta` compartido. **Stock** (Con stock / Sin stock) sale del `stock`
  que ya manda el endpoint (`PKG_STOCK.fn_existencia`, por artículo); el negativo cuenta como
  "Sin stock". Un ícono en la celda Artículo abre la **imagen** (`ArticuloImgModal`, por el
  `id_articulo` que ya trae la fila; va dentro de la celda y no como columna, ver abajo por
  qué). El lápiz de cada fila abre el modal de siempre
  ("Actualizar precio", `POST suba-precios`). Backend: `db/ORDS_SUBA_PRECIOS.sql`.
  - **Nueva suba**, desde el botón del encabezado (elige el artículo con `BuscadorModal`:
    catálogo completo, también artículos sin precio; tiene "Guardar y otro") o desde el botón ↗
    de cada fila (artículo fijo, guarda y cierra). Precarga, como Precios de Ventas, el **costo
    de la última compra** (+ delivery prorrateado) y el **% de recargo del rubro**. Si ese costo
    difiere del del precio vigente, muestra la **sugerencia de cambio de costo** (anterior →
    nuevo, %) con opción de mantener el anterior. Precio por recargo sobre costo o por **% de
    suba sobre el vigente**, redondeado hacia arriba al millar; vista previa con variación y
    margen; avisos si no sube, si el margen queda bajo el recargo del rubro o si queda bajo el
    costo (este pide confirmar).
  - Graba con el `POST precios-ventas` de la pág 34, que guarda además `id_factura`/`nro_linea`
    de la compra de donde salió el costo.
  - **Costo de la última compra en la grilla:** "Precio Compra" muestra debajo `↑ 58.000` (ámbar)
    o `↓ 38.000` cuando la última compra difiere del costo del precio vigente (fecha y % en el
    tooltip), el botón ↗ de la fila se resalta si el costo subió, y la faceta **Costo de compra**
    (Costo subió / bajó / Sin cambio / …) filtra a quién hay que subirle el precio. Va dentro de
    la celda y no como columna aparte: cada columna suma ~100 px y en 1366 px la de acciones
    quedaba cortada.
  - **Endpoints propios** (bloque independiente al final del `.sql`; hay que ejecutarlo):
    `suba-precios/sugerir` (modal) y `suba-precios/ultimas-compras` (grilla), con el mismo
    criterio de "última compra" (sin AJS, `fec_comprobante DESC NULLS LAST`).
    `precios-ventas/sugerir` sin factura toma la línea de compra con `ROWNUM = 1` **sin
    `ORDER BY`** —una cualquiera, no la última— y no se tocó para no cambiar Precios de Ventas.
    Mientras la BD no tenga el bloque, la grilla queda como antes (sin marca ni faceta) y el modal
    avisa y usa el costo del precio vigente y el % del rubro de `precios-ventas/sugerir`.
- **Compras por Artículos** (page_id 55) — reporte de solo lectura de `COMPRAS_ARTICULOS`
  (`tip_comprobante != 'AJS'`). Búsqueda + facetas Proveedor/Fecha/Referencia, **carga incremental
  por mes** ("Mostrar más"), imagen por artículo, total al pie y export. Backend:
  `db/compras_articulos_sql.sql`.
- **Ficha de Artículos** (page_id 56) — reporte de solo lectura de `V_FICHA_EXISTENCIA`
  (movimientos por artículo). Búsqueda + facetas Rubro/Tipo/¿Bien de uso? (Sí/No)/Fecha, carga por
  mes, imagen.
  Backend: `db/ficha_existencia_sql.sql`.
- **Artículos sin Código de Barra** (page_id 57) — artículos activos con existencia y sin código
  de barra (excluye rubros 30/39). Búsqueda + faceta Rubro + imagen. Backend:
  `db/articulos_sin_barra_sql.sql`.
- **Consulta de Precios** (page_id 61) — buscador por **código de barra** (pistola en mostrador):
  resuelve el artículo desde `codigos_barras` y muestra una tarjeta con precio
  (`pkg_ventas.fn_precio_venta`), existencia (`pkg_stock.fn_existencia`), imagen embebida, marca,
  rubro y viscosidad. Backend: `db/consulta_precios_sql.sql`.
- **Existencia de Artículos** (page_id 70) — existencia agrupada por artículo (suma de sus
  movimientos) y costo. Búsqueda, imagen y facetas Rubro, OEM y **¿Bien de uso?** (Sí/No: Sí son
  los que no se venden, como una notebook o una mesa). Filtro **Existencia** Con/Sin/Todos: arranca
  en Todos, y cero, negativo o sin dato cuentan como "Sin". La columna **Rubro** se oculta en la
  grilla y en el Excel con un solo rubro filtrado; con varios sigue visible. La faceta y la columna
  Rubro aparecen cuando el servidor tiene la versión nueva del reporte. El **costo** es el guardado
  en el artículo o, si no tiene (los bienes de uso nunca reciben precio de venta), el de la última
  compra; sin ninguna compra se ve "—" y no suma al total. **Costo último y total costo solo para
  JOSEG** (permiso por usuario). Backend: `db/existencia_articulos_sql.sql`.
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
  `apex_collections`): panel de artículos con stock (facetas Marca/Rubro con botón **Limpiar**,
  búsqueda, lector de código de barra, % descuento, imagen que se **amplía en un modal** al tocarla)
  + carrito en estado React (cantidad ±, total) + modal de facturación con datos de la factura
  (cliente con buscador, vendedor, serie/talonario) y **formas de cobro múltiples**. El modal abre
  **precargado**: cliente `cod_persona` 1 ("sin cliente"), vendedor por `app_user`, serie **A**, y el
  foco va directo a la forma de cobro; vendedor, talonario, forma de cobro y banco se eligen con
  `SelectorModal` (modal de botones, ver `src/GUIA_FRONT.md`) y solo se listan **vendedores activos**. **Efectivo con vuelto:** el cajero ingresa lo recibido; se imputa lo menor entre lo recibido y lo
  restante, y el excedente es el vuelto (se guardan `total`/`efectivo_recibido`/`efectivo_vuelto`).
  Con una sola forma de cobro no se controla el total (permite vuelto); con varias, la suma debe
  igualarlo, y nunca superarlo. **Validaciones todas en el front** (cabecera, detalle, cobros). En
  **móvil** el carrito se abre desde un botón flotante (FAB) en un modal. Al facturar, un POST atómico
  (`pos/registrar`) hace los 3 INSERT (`VENTAS_CABECERA/DETALLE/COBROS`) en una transacción con
  `PKG_VENTAS.fn_id_factura()`. La grilla usa la query "POS v2" (precio de tabla, existencia
  compras−ventas, descuento por `fn_porc_descuento`). Backend: `db/punto_venta_sql.sql`.
- **Compras** (page_id 28/36) — maestro-detalle de `compras_cabecera`/`compras_detalle` (réplica de
  Ventas): grilla con filtros año/mes, alta "Nueva compra" (sugeridos de nro/timbrado), edición y
  detalle de artículos con costo anterior por proveedor.
  - **Ver cabecera:** modal de solo lectura (ícono 👁 en la grilla y botón dentro del detalle) con
    **todos** los datos del comprobante — serie, timbrado, moneda, tipo de cambio, condición,
    comprador, costo delivery y total. Los campos que el modal de edición no permite tocar igual
    se muestran ahí como texto (nada queda invisible).
  - **Costo delivery** editable en la cabecera (`costo_delivery`); condición y comprador vienen
    resueltos por JOIN (`desc_condicion`, `nombre_comprador`).
  - **Alta encadenada de líneas:** al agregar un artículo el modal no se cierra — limpia los
    campos, refresca la grilla y el total, y deja el foco listo para el siguiente.
  - **Recibo de salario** (botón "Recibo" de la pág 29): solo en comprobantes `SAL`, desde un
    ícono en la fila de la grilla y desde el modal de edición (según el tipo **guardado**, como
    el APEX). PDF A5 apaisado con jsPDF (`src/lib/recibo-salario.ts`, reemplaza el pdfMake +
    `numeros_letras.js` del APEX): empresa, trabajador (el proveedor) con su CI, conceptos (los
    artículos del detalle, `NVL(cantidad,1) * NVL(precio,0)`), total en letras y firmas. Sin
    endpoint nuevo: el detalle y el CI (LOV de proveedores) ya existían. Los datos de la empresa
    (razón social, RUC, dirección) están fijos en el archivo, igual que en el APEX.
  - **LOVs propias** (proveedores y artículos): el endpoint devuelve el catálogo **completo** y el
    front filtra flexible — nombre sin distinguir mayúsculas/minúsculas, RUC/CI con o sin guion,
    palabras sueltas en cualquier orden, OEM con o sin guion (`9091503001` ≡ `90915-03001`), sin
    tope de resultados. Es **la** regla del proyecto para toda LOV (ver las guías).
  - Backend: `db/compras_sql.sql`.
- **Pagos de Compras** (page_id 77/78) — CRUD de `COMPRAS_PAGOS`: grilla con `DataTable` + export
  y modal de alta/edición (la página APEX 78 "Crear Pago de Factura").
  - **LOV de facturas:** solo comprobantes `FCR` de la empresa **con saldo pendiente**
    (`PKG_COMPRAS.FN_SALDO_PROVEEDOR = 'S'`), ordenados por fecha. El endpoint devuelve la lista
    completa y el front filtra por proveedor, comprobante, id o fecha (palabras sueltas en
    cualquier orden, con o sin separadores). La etiqueta replica la del APEX:
    `proveedor, dd/mm/yyyy, serie-nro`.
  - Forma de pago con `SelectorModal` (catálogo corto), monto con `InputMonto` (separador de
    miles), observación en textarea de 1000 caracteres, nro de recibo obligatorio.
  - Backend: `db/compras_pagos_sql.sql`.
- **Inventario** (page_id 58/59) — CRUD de conteos de `INVENTARIO`. El modal Crear (pág 59) filtra
  el artículo por ¿Es Activo?/Categoría/Marca y lo elige en un **modal propio con buscador**
  (`BuscadorModal`, no el dropdown inline). La lista sale de la tabla **`ARTICULOS` completa**
  (más vendidos primero): antes salía de `V_PEDIDO_PROVEEDOR` y faltaban los artículos que nunca
  pasaron por compras. Resuelve códigos de barra
  (`inventario/articulo-por-barra`) y el backend calcula `cantidad_sistema` con
  `pkg_stock.fn_existencia`. LOVs propias del módulo (lista completa + filtro front). Backend:
  `db/inventario_sql.sql`.
  - **Pestañas Conteos / Comparación** (`inventario-pagina.tsx`, mismo patrón que Conteo de
    Efectivo): la vista de conteos queda **sin cambios** y montada; `vistas.tsx` apunta al
    envoltorio.
  - **Comparación** (`comparacion-inventario.tsx`, lazy con recharts). **Un inventario = los
    conteos de una fecha** (definido con el usuario); si un artículo se contó dos veces el mismo
    día vale el último (id mayor). Por defecto analiza el último inventario contra el
    **anterior**, los **últimos 3 o 6**, **todos** los anteriores, o **fechas elegidas** (hasta 7).
    Con más de 12 fechas el gráfico de exactitud se compacta (una línea por fecha, solo el %), la
    racha se angosta a un ancho fijo, y con más de 7 la tabla/PDF cambian la columna por fecha
    por "Con dif. en X de Y". Diferencias en
    **Guaraníes o Unidades** (las dos, a pedido): Gs. = diferencia × **costo último actual**
    (`pkg_compras.fn_costo_ultimo`, igual que Costo de Inventarios y Ajustar Inventarios).
    **Sin endpoint nuevo:** el `LISTAR` de la grilla suma `costo_ultimo` (misma `queryKey`); si la
    BD tiene el paquete anterior, el campo no llega y la pestaña queda solo en unidades con un
    aviso. Tres piezas:
    - **Tarjeta en texto:** % de exactitud (artículos contados sin diferencia), puntos contra el
      anterior o el promedio, faltantes/sobrantes/neto en u. y Gs., el artículo que más pesa y
      cuántos de los que fallaron **ya habían fallado** en los comparados.
    - **Exactitud de cada inventario:** barra 100 % apilada por fecha (faltante | exacto |
      sobrante); compara proporciones, así un inventario de 400 artículos y uno de 50 se leen
      igual. A la derecha, la exactitud escrita y las diferencias en la medida elegida.
    - **Artículos con mayor diferencia** (top 12): barra divergente (faltante a la izquierda,
      sobrante a la derecha) y, al lado, la **racha**: un cuadrito por inventario comparado con lo
      que dio ese artículo (hueco = no se contó). Muestra los que fallan siempre.
    - Tabla con todos los artículos del inventario (diferencia en u. y Gs. + una columna por
      inventario comparado) y PDF (en el PDF, solo los artículos con diferencia).
    - **Filtro por artículos contados** (buscador + chips + "Limpiar"): el catálogo son todos los
      artículos contados alguna vez (con en cuántos inventarios y el último). Con artículos
      elegidos, cada inventario se recalcula solo con ellos y quedan las fechas que contaron
      alguno, así "Inventario anterior" es el anterior en que **se contaron esos artículos**. Un
      elegido que no se contó en el inventario analizado queda como chip atenuado. El PDF lista
      los artículos filtrados en el subtítulo.
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
- **Conteo de Efectivo** (page_id 85/86) — CRUD de `CONTEO_EFECTIVO` (`total = valor × cantidad`).
  Permisos por usuario: todos consultan cualquier fecha (filtro y "Mostrar más"); el que no es
  JOSEG carga conteos **solo en el día actual** (el backend fuerza la fecha); **modificar y
  eliminar solo JOSEG** (403 al resto, decidido con el usuario del token), igual que el panel
  de totales. La grilla muestra la foto de cada billete al lado del valor (endpoint público
  `monedas/:id/detalle/:valor/imagen`, con reintento ante 404 pasajeros de ORDS).
  En el modal, moneda y **valor del billete** se eligen con `SelectorModal`: una grilla de tarjetas
  donde cada denominación muestra **la imagen del billete** guardada en `MONEDAS_DETALLE`. Backend:
  `db/conteo_efectivo_sql.sql`.
  - **Pestañas Conteo / Comparación** (`conteo-efectivo-pagina.tsx`): la pestaña Conteo es la
    vista de siempre **sin ningún cambio** (`conteo-efectivo-view.tsx`; queda montada al cambiar
    de pestaña, así no pierde su filtro). En `vistas.tsx` la pág 85 apunta al envoltorio.
  - **Comparación** (`comparacion-conteo.tsx`, lazy con recharts): el conteo de una fecha contra
    el **conteo anterior** (el último previo, no "ayer": los domingos sin conteo no dejan el
    gráfico vacío), los **últimos 7 o 30** conteos, o **fechas elegidas** (buscador + chips,
    hasta 7).
    **Sin endpoint nuevo:** pide el historial al mismo `LISTAR` con `dias=0` (misma `queryKey`
    que "Mostrar todos" del listado) y agrupa en el front por fecha y por billete. La ven todos,
    igual que el listado. Tres piezas, de arriba hacia abajo:
    - **¿Cuánto cambió?** Tarjeta con el total del día, la diferencia en Gs. y % contra el
      conteo anterior o el promedio, la diferencia de billetes y **el billete que más explica la
      diferencia** (el de mayor diferencia en plata).
    - **¿Qué billetes cambiaron?** Siempre **barras comparativas**: por billete, una barra por
      fecha con su color (el día analizado en naranja), largo = **monto** (cantidad × valor) y el
      monto escrito al final; la cantidad de billetes va en el tooltip. En el eje, la **foto del
      billete** al lado del valor. A la derecha, en una columna fija, la diferencia en plata del
      día contra la referencia. Hasta 7 fechas comparadas cada una tiene su barra (8 colores
      categóricos con el día); con **Últimos 30** las barras son día contra **promedio**.
    - **¿Es normal?** (solo contra varias fechas): total de cada conteo en orden cronológico, cada
      fecha con el mismo color que en el gráfico de billetes y una línea punteada en el promedio.
    - Tabla por billete (día, referencia, diferencia en billetes y en plata) con Excel, y
      **PDF** con KPIs, los gráficos y la tabla. Si hay conteos en más de una moneda aparece un
      selector (no se suman monedas distintas).
- **Planilla para inventarios** (page_id 112/113/115) — conteos **abiertos** de `INVENTARIO`.
  "Crear Planilla" (pág 113) genera conteos masivos por Rubro/Marca/Viscosidad (LOVs en cascada
  derivadas de los artículos pendientes según la fecha del parámetro `FECHA_INVENTARIO`). El modal
  Cantidad (pág 115) edita la cantidad física y permite **tomar una foto** (cámara trasera,
  compresión a 600px JPEG ≤100KB) que se sube como **binario crudo** (`PUT
  planilla-inventarios/:id/foto`); muestra además la imagen del artículo.
  Backend: `db/planilla_inventarios_sql.sql`.
- **Sortear** (page_id 108) — sorteo de teléfonos de `VENTAS_CABECERA` en un rango de fechas
  (cada venta = una participación). Animación de 10 s con números enmascarados (`••••9999`) y
  botón "Mostrar Ganador" que revela el número completo. Backend: `db/sortear_sql.sql`.
- **Roles de Páginas** (page_id 37/38/64) — CRUD de `ROLES_PAGINAS` (PK compuesta
  app_id+página+usuario; 5 permisos S/N). LOVs de usuarios (`WWV_FLOW_USERS`) y páginas
  (`APEX_APPLICATION_PAGES`, requiere el fix de workspace); al crear se excluyen las páginas ya
  asignadas al usuario. "Copiar Roles" (pág 64) copia los roles de un usuario a otro (solo los
  que no tiene). Backend: `db/roles_paginas_sql.sql`.

## Rendimiento

Dos reglas que sostienen el arranque de la app; romperlas se nota enseguida:

1. **Las vistas se cargan con `React.lazy`** (`src/lib/vistas.tsx`). Con imports estáticos las
   61 vistas caen en el chunk de `/home`: eran **1,5 MB (371 KB gzip)** y el dashboard tenía que
   bajar y parsear todo el ERP antes de pintar. Hoy el arranque es **62 KB (17,6 KB gzip)** —21×
   menos— repartido en ~148 chunks, y `jspdf`, `html2canvas` y `recharts` quedaron fuera del
   arranque (bajan con la pantalla que los usa). Al agregar una página: anotarla en `vistas.tsx`
   con `vista(...)`, **nunca** con un import estático en `home.tsx`.
2. **Nada que se tipee va en una `queryKey`.** Como no hay caché (ver GUIA_FRONT), cada cambio
   de `queryKey` es un viaje al servidor: un valor que cambia tecla a tecla dispara una consulta
   por pulsación. En el POS, `descuento` en la `queryKey` hacía que cada tecla relanzara una
   consulta de **12,5 s**; ahora el catálogo se pide una vez y el descuento se aplica en el front.
   Un `<select>`, un `type="date"` o un id de LOV sí pueden ir: cambian por selección, no por
   carácter.

Detalle y casos concretos: **[src/GUIA_FRONT.md](src/GUIA_FRONT.md)** — "Qué NO poner en una
`queryKey`".

## Deploy

- **GitHub Pages** (SPA estático): workflow `.github/workflows/deploy-pages.yml` se dispara en push a
  `main`. En Pages, `VITE_API_URL` apunta directo a ORDS.
- **Servidor Node (Nitro):** `npm run build` (preset node-server) + `node .output/server/index.mjs`.
  Requiere `VITE_API_URL=/api/ords/`, `VITE_APP_ID`, `ORDS_TARGET` (ver `.env.production`).

## Asistente: puesta en marcha

Tiene una parte en Oracle y otra en el sitio. Nada de esto lleva claves en el repo.

1. **Ejecutar `db/ia_asistente_sql.sql`** completo como `JOSEGALVEZ`, en SQL Workshop → SQL Scripts,
   después de `PKG_AUTH_LUBRIMEC`. Se puede correr las veces que haga falta: no pisa la clave ni
   la configuración que ya esté cargada.
2. **Cargar la clave**, solo la primera vez y en SQL Commands, nunca en un archivo:
   `BEGIN PKG_IA_LUBRIMEC.fijar_clave('<la clave>'); END;`. Si la API responde que la clave no
   tiene workspace, cargarlo también con `PKG_IA_LUBRIMEC.fijar_workspace_id`.
3. **Probar la conexión:** `BEGIN PKG_IA_LUBRIMEC.probar; END;` tiene que decir `[OK]`.
4. **Probar las barreras** sin gastar tokens, con `PKG_IA_LUBRIMEC.probar_consulta`: un `SELECT`
   común da `[OK]`; un `DELETE` o una tabla `LUBRIMEC_*` dan `[RECHAZADA]`. Para lo que solo ve
   JOSEG, el segundo parámetro es el usuario:
   `probar_consulta('SELECT MAX(costo_ultima_compra) FROM articulos', 'JOSEG')` da `[OK]` y sin
   él da `[RECHAZADA]`. Más casos en el encabezado del `.sql`.
5. **Publicar el sitio:** el botón, el chat y el manual llegan con el push a `main`.

Qué hay que hacer según lo que cambie:

| Cambio | Dónde se escribe | Para que llegue |
|---|---|---|
| Cómo se usa una pantalla | Este README, "Páginas implementadas" | Push (el manual se arma en el build) |
| Lo básico del sistema (login, menú, el botón) | `GUIA_BASICA` en `src/lib/asistente.ts` | Push |
| Qué significa un dato ("Lo propio de este negocio") | `instrucciones` en `db/ia_asistente_sql.sql` | Volver a ejecutar ese `.sql` |
| Modelo, límite diario, filas | `LUBRIMEC_IA_CONFIG` | `UPDATE` + `COMMIT`, sin ejecutar el script |

> **Compras, costos, márgenes, comisiones y sueldos: solo JOSEG** (decisión del dueño). Se decide
> en Oracle con el usuario del token, y rechaza la consulta aunque la IA la intente: tablas
> `COMPRAS_*`, columnas con esos nombres (`c_sensible` en `db/ia_asistente_sql.sql`) y `SELECT *`.
> **El resto sí lo ve todo, sin los permisos de cada pantalla.** El chequeo es por nombre: una
> vista que traiga un costo con otro nombre pasaría, y hay que sumarla a `c_sensible` (el
> encabezado del `.sql` trae la consulta para revisarlas). Sumar ahí también cualquier dato nuevo
> que solo deba ver JOSEG.

Guía para llevarlo a otro proyecto: [GUIA_ASISTENTE_IA.md](GUIA_ASISTENTE_IA.md).

## Backup por correo

La base está en un workspace gratuito que Oracle podría dar de baja. `db/backup_sql.sql` genera
una copia completa en scripts SQL comprimidos y la manda por correo todos los días a las **03:00 de
Paraguay** (job `JOB_BACKUP_LUBRIMEC`). Hay que ejecutarlo a mano como todo `.sql`.

> **Falta verificarlo en esta instancia:** que `APEX_MAIL` mande los adjuntos (`oracleapex.com` no
> publica sus límites), que deje exportar APEX y ORDS, y una restauración de prueba. Hasta eso, no
> dar por respaldada la base.

- **Qué lleva:** estructura (tablas, PK, índices, triggers, FK, vistas, paquetes, jobs...), la
  aplicación APEX y los módulos ORDS si la instancia deja exportarlos, y los datos.
- **Qué no lleva:** imágenes (columnas BLOB) ni database links o permisos de red, por decisión del
  dueño: se vuelven a cargar o configurar después. Tampoco los datos de `LUBRIMEC_*` e `IA_*` (clave
  de la API y sesiones), columnas de contraseñas o tokens, ni las contraseñas de los usuarios de
  APEX.
- **Cómo saber si salió bien:** cada corrida termina con un correo de resumen, y queda en
  `LUBRIMEC_BACKUP_LOG`. Si no llegó, o dice `CON ERRORES`, esa copia no está completa.
- **La casilla no va en el repo:** se carga con `PKG_BACKUP_LUBRIMEC.fijar_destino`. Los adjuntos
  van **sin cifrar**: tiene que ser una casilla solo del dueño, con verificación en dos pasos.

### Puesta en marcha y prueba

Después de ejecutar `db/backup_sql.sql` en SQL Workshop → SQL Scripts, en SQL Commands:

```sql
-- 1. La casilla, y probar que llegue un correo con prueba.zip
BEGIN PKG_BACKUP_LUBRIMEC.fijar_destino('<la casilla>'); END;
BEGIN PKG_BACKUP_LUBRIMEC.probar_correo; END;

-- 2. Generar SIN enviar: mide cuánto pesa y cuánto tarda (corre en segundo plano)
BEGIN PKG_BACKUP_LUBRIMEC.lanzar(p_enviar => FALSE); END;

-- 3. Ver el resultado. ESTADO: EN CURSO, OK, CON ERRORES, ERROR o INTERRUMPIDA.
--    PASO y PASO_EN: en qué va y desde qué hora. DETALLE: el motivo y los minutos de cada etapa
SELECT * FROM lubrimec_backup_log ORDER BY id DESC;

-- 4. La primera copia real, sin esperar a la madrugada
BEGIN PKG_BACKUP_LUBRIMEC.lanzar; END;
```

Si algo no aparece:

```sql
-- Correos pendientes y sus errores
SELECT id, mail_subj, mail_send_count, mail_send_error FROM apex_mail_queue;
-- Si el job está activo y cuándo corre
SELECT job_name, enabled, state, next_run_date FROM user_scheduler_jobs
 WHERE job_name = 'JOB_BACKUP_LUBRIMEC';
-- Cómo le fue a cada corrida
SELECT job_name, status, actual_start_date, errors FROM user_scheduler_job_run_details
 WHERE job_name = 'JOB_BACKUP_LUBRIMEC' OR job_name LIKE 'BACKUP_MANUAL%' OR job_name LIKE 'BACKUP_TRAMO%'
 ORDER BY actual_start_date DESC;
```

### Corre en tramos

La instancia limita la CPU por llamada (`CPU_PER_CALL`, error `ORA-02393`) y un job entero cuenta
como una sola llamada: la copia completa no entra en un job. Por eso cada tramo es un job
(`BACKUP_TRAMO_*`) que usa el 60 % del límite, cierra su parte y deja lo que falta en
`LUBRIMEC_BACKUP_TAREA` para el siguiente. Una tabla grande puede seguir en otro tramo.

Las tablas no se leen todas en la misma foto: si alguien carga algo durante la copia, una venta
puede quedar sin su detalle. Por eso conviene correrla de madrugada; una prueba de día sirve para
medir, no como copia.

### Si queda `EN CURSO` mucho tiempo

`EN CURSO` no prueba que siga corriendo: si Oracle corta la sesión, la corrida no llega a anotar su
final. La siguiente que arranque la marca `INTERRUMPIDA`. Para saberlo ahora:

```sql
-- Si sale una fila, hay un tramo corriendo o por arrancar. Si no sale nada, la corrida murió:
-- el motivo está en USER_SCHEDULER_JOB_RUN_DETAILS (consulta de arriba)
SELECT job_name, state FROM user_scheduler_jobs
 WHERE job_name LIKE 'BACKUP_MANUAL%' OR job_name LIKE 'BACKUP_TRAMO%';
-- Detenerla, con el JOB_NAME de la consulta anterior
BEGIN DBMS_SCHEDULER.STOP_JOB('<job_name>'); END;
```

Si `PASO_EN` no cambia en mucho rato, ese paso es el que se traba. Antes de volver a ejecutar
`db/backup_sql.sql` hay que detener la corrida: reemplazar el paquete mientras se usa deja el script
esperando.

### Configuración

En `LUBRIMEC_BACKUP_CONFIG`, con `UPDATE` + `COMMIT`, sin volver a ejecutar el script:

| Clave | Qué es |
|---|---|
| `DESTINO` | La casilla (con `fijar_destino`) |
| `REMITENTE` | El "De:" del correo; por defecto, el mismo destino |
| `PARTE_MB` | Tamaño de cada `.sql` antes de comprimir (30). Bajarlo si rechazan los adjuntos |
| `APP_ID` | La aplicación APEX a exportar (86972) |
| `CPU_SEG` | Opcional: segundos de CPU por tramo. Sin esto, el 60 % de `CPU_PER_CALL` |

Para cambiar el horario, cambiar `BYHOUR` en `repeat_interval` con
`DBMS_SCHEDULER.SET_ATTRIBUTE` y dejarlo también en el `.sql`, o la próxima ejecución lo pisa.

### Restaurar

1. Crear el esquema en una base con **APEX y ORDS**.
2. Descomprimir los `.zip` del mismo día y correr los `.sql` **en orden de número**, con SQLcl o
   SQL*Plus. La primera parte de `datos` apaga FK y triggers, y la última los vuelve a prender.
3. Importar lo que falte a mano, si el resumen avisó que no se pudo exportar (aplicación APEX o
   módulos ORDS).
4. Volver a cargar lo que no viaja: la clave del asistente (`PKG_IA_LUBRIMEC.fijar_clave`), las
   contraseñas de los usuarios de APEX, las imágenes y las integraciones externas (WaSender,
   permisos de red para salir a esas APIs).

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
- [db/PKG_STOCK.sql](db/PKG_STOCK.sql) — copia de referencia de `PKG_STOCK` (no se despliega):
  qué calcula cada función de stock. `fn_existencia(id_articulo, cod_empresa)` es por artículo;
  `fn_existencia_oem` suma todo el OEM y sale de otra fuente (la usa Ventas por Artículos).
- [src/GUIA_FRONT.md](src/GUIA_FRONT.md) — consumo desde el front, proxy y gotchas.
- [db/backup_sql.sql](db/backup_sql.sql) — backup completo por correo, ver "Backup por correo".
- [GENERAR_APK.md](GENERAR_APK.md) — generar, firmar, publicar y versionar el APK.
- [GUIA_ASISTENTE_IA.md](GUIA_ASISTENTE_IA.md) — guía portable para llevar el asistente con IA a
  **otro** proyecto Oracle APEX/ORDS + React.
- [GUIA_BACKUP.md](GUIA_BACKUP.md) — guía portable para llevar el backup por correo a **otro**
  proyecto y otra base. Su anexo es una copia de `db/backup_sql.sql`: si cambia el script, actualizarlo.
- [GUIA_LOGIN.md](GUIA_LOGIN.md) — guía portable para replicar este login (paquete
  `PKG_AUTH_*` + token en tabla + proxy + sesión en el front) en **otro** proyecto
  Oracle APEX/ORDS + React.

### Reglas que no se reabren

- **LOVs: lista completa del backend + filtrado en el front, sin excepciones** (también artículos).
  Nada de `q` por query string ni `FETCH FIRST 30`. Detalle y por qué, en las dos guías.
- **Sin caché en ningún nivel** (ver arriba).
- **Responsive con variables CSS y breakpoints, nunca `zoom` global**; móvil es una experiencia
  propia (táctil, sin scroll horizontal), no la web reducida (ver arriba).
- **Montos con separador de miles** siempre: `InputMonto` al editar, `Intl.NumberFormat("es-PY")`
  al mostrar. **Fechas siempre `dd/mm/yyyy`** en pantalla (el backend las manda ISO).
- **`onError` obligatorio en toda mutación** (sin él, un 409/500 queda mudo y el usuario reporta
  que "el botón no hace nada").
- **Usuarios bloqueados: mirar SOLO `ACCOUNT_LOCKED`.** `IS_LOGIN_PASSWORD_VALID` únicamente compara
  la contraseña, así que el bloqueo se chequea aparte contra `WWV_FLOW_USERS`. **No** agregar
  `ACCOUNT_EXPIRY` al chequeo: viene con fecha pasada en cuentas activas y rechaza usuarios sanos con
  "La cuenta expiró" (ya pasó). La expiración de la *sesión* es otra cosa (`FECHA_EXPIRACION` del
  token). Detalle en [GUIA_LOGIN.md](GUIA_LOGIN.md).
- **`es_activo` no es "artículo habilitado":** `S` = bien de uso (no se vende), `N` = mercadería.
  Lo que dice si está habilitado es `estado`. En pantalla: **¿Bien de uso?** con Sí/No, nunca la
  letra.
- **El `costo_ultimo` de `V_FICHA_EXISTENCIA` no se usa como costo:** vale 1 cuando no hay costo.
  Detalle y alternativa en [db/GUIA_ENDPOINTS.md](db/GUIA_ENDPOINTS.md).
- Idioma del proyecto (código, comentarios, UI, docs): **español**.
