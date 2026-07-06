# Guía para mapear tablas → endpoints ORDS

Patrón establecido en el proyecto para exponer una tabla Oracle como API REST CRUD,
consumida desde el frontend TanStack. Tomar `marcas` como referencia viva.

## Arquitectura

```
Frontend (src/lib/api.ts)
  → fetch a /api/ords/<ruta>            (mismo origen, sin CORS)
  → proxy server-side (src/routes/api/ords.$.ts)
  → ORDS_TARGET + /ords/josegalvez/lubrimec/<ruta>   (Oracle APEX)
  → handler PL/SQL → PKG_<TABLA>_LUBRIMEC → tabla
```

- **Backend:** Oracle APEX/ORDS. Esquema `JOSEGALVEZ`, módulo ORDS `lubrimec`,
  base path `/ords/josegalvez/lubrimec/`.
- **Auth:** token Bearer. El handler lee el header `Authorization` en el bind
  `:authorization`, le quita el prefijo `Bearer ` y lo pasa al paquete, que valida con
  `PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(token)`. Devuelve el usuario o `NULL` si es inválido.
- **Contrato JSON uniforme:** `{ success: bool, message?: str, data?: obj|array, ... }`.
- **Proxy:** todas las llamadas del front pasan por `/api/ords/$` para evitar CORS
  del navegador. Por eso el header CORS en los handlers es defensivo, no crítico.

## Convenciones de las rutas

| Método | Ruta | Acción |
|---|---|---|
| GET | `/<tabla>?<filtros>` | listar |
| GET | `/<tabla>/:id` | obtener uno |
| POST | `/<tabla>` | insertar |
| PUT | `/<tabla>/:id` | actualizar |
| DELETE | `/<tabla>/:id` | eliminar |

Casi todas las tablas filtran por `cod_empresa` (multiempresa). El listar lo recibe
como query param `?cod_empresa=:n`.

## Pasos para una tabla nueva

1. **Crear el paquete** `db/PKG_<TABLA>_LUBRIMEC.sql` (spec + body).
   - Procedimientos: `LISTAR`, `OBTENER`, `INSERTAR`, `ACTUALIZAR`, `ELIMINAR`.
   - Cada uno: 1) valida token → 401 si NULL, 2) ejecuta, 3) responde con APEX_JSON.
   - Reusar el patrón de helpers `p_error(status, reason, message)` y
     `f_usuario(token)` de `PKG_MARCAS_LUBRIMEC`.
   - Si la PK la asigna un trigger (renumerar), una secuencia o `GENERATED ... AS IDENTITY`,
     **no** incluir la PK en el INSERT y usar `RETURNING <pk> INTO l_id` para devolverla (modelos:
     `rubros_sql.sql` trigger, `monedas_sql.sql` secuencia, `condiciones_facturas_sql.sql` IDENTITY).
   - Si la PK **la ingresa el usuario** (no autogenerada), validarla obligatoria y devolver 409 en
     `DUP_VAL_ON_INDEX` (modelos: `iva_sql.sql`, `unidades_medidas_sql.sql`).
   - Estados: 201 Created, 400 Bad Request, 404 Not Found, 401 Unauthorized,
     500 Internal Server Error.

2. **Crear el script ORDS** `db/ORDS_<TABLA>.sql`.
   - **Estructura PLANA:** cada `DEFINE_HANDLER` instala directamente la lógica de
     negocio en su `p_source`. **NO** usar el patrón anidado "GET que se redefine a sí
     mismo" (un GET cuyo `p_source` borra y recrea handlers): dejaba instalado el bloque
     de setup en vez de la query real y provocaba **HTTP 500**. Fue la causa del fallo de
     `menu/paginas`; ver el fix en `db/ORDS_MENU_PAGINAS.sql`.
   - Como el `p_source` es plano, usar `q'~ ... ~'` (quote alternativo) en vez de duplicar
     comillas. El CORS se emite con `HTP.P('Access-Control-...')` dentro del bloque.
   - **Bind del token — OBLIGATORIO:** tras cada `DEFINE_HANDLER` agregar un
     `ORDS.DEFINE_PARAMETER` que mapee el header `Authorization` → bind `:authorization`
     (`p_source_type => 'HEADER'`, `p_bind_variable_name => 'authorization'`). Sin esto
     `:authorization` llega NULL y todo responde "Token invalido o expirado".
   - Limpieza idempotente al inicio: `ORDS.DELETE_HANDLER` por cada método (en `BEGIN
     ... EXCEPTION WHEN OTHERS THEN NULL; END;`) para poder re-ejecutar el script.
   - Dos plantillas: `<tabla>` (colección: GET listar, POST) y
     `<tabla>/:id` (item: GET obtener, PUT, DELETE). OPTIONS no hace falta: el proxy
     server-side evita el preflight CORS del navegador.

3. **Agregar el cliente** en `src/lib/api.ts`.
   - Tipo `Tabla` (campos exactos de la tabla) y `TablaInput` (sin PK).
   - Funciones `listarTablas(codEmpresa)`, `obtenerTabla(id)`, `crearTabla(input)`,
     `actualizarTabla(id, input)`, `eliminarTabla(id)`.
   - Usar el helper `authFetch(path, init)` ya existente (mete Bearer, maneja 401).

4. **Ejecutar en BD** (esquema JOSEGALVEZ, en orden): primero el paquete, luego el ORDS.

## Mapeo de tipos Oracle → TypeScript

| Oracle | TypeScript |
|---|---|
| `NUMBER` | `number` |
| `VARCHAR2` | `string` |
| columna nullable | `T \| null` |
| `DATE` / `TIMESTAMP` | `string` (ISO) |

## Vista con formulario CRUD (front)

Patrón para una página tipo CRUD con tabla + formulario (modelo: `src/components/marcas-view.tsx`;
CRUD completo con varios campos: `src/components/personas-view.tsx`).

1. **Cliente en `api.ts`:** tipo `Tabla` (campos exactos) y `TablaInput = Omit<Tabla, "pk">`.
   Funciones `listar/crear/actualizar/eliminar`. `crear*` devuelve la PK (`data.<pk>`), leída del
   JSON de respuesta del INSERT (`RETURNING <pk>`).
2. **Vista:** `useQuery` para listar (`queryKey: ["tabla", cod_empresa]`), `useMutation` +
   `qc.invalidateQueries` para borrar/guardar. Tabla con búsqueda en memoria y columna de acciones
   (ver/editar/borrar con `lucide` `Eye`/`Pencil`/`Trash2`). Formulario en `Dialog` con un
   `ModalState` (`closed | create | edit | view`); confirmación de borrado con `AlertDialog`.
3. **Sincronizar el form al abrir:** patrón `lastKey`/`key` (`${mode}:${pk ?? "new"}`) que
   reinicializa el estado del form cuando cambia la fila seleccionada, sin `useEffect`.
4. **Registrar** la vista en `VISTAS` de `src/routes/home.tsx` por su `page_id` (así el menú la
   marca como implementada; ver `PAGINAS_IMPLEMENTADAS`).

Gotchas de formularios:
- **Campos "-" en la BD = vacío en el form.** Varias columnas guardan `'-'` como "sin dato";
  normalizarlas a `""` al cargar y a `null` al guardar (helper `limpiar` en `personas-view`).
- **Autocopia de campos** (ej. `nombre_fantasia` desde `nombre`): copiar mientras el destino no se
  haya editado a mano; usar una bandera `tocada` que se activa en el `onChange` del destino.
- **Fechas:** intercambiar como texto `YYYY-MM-DD` (input `type="date"`); en PL/SQL convertir con
  `TO_DATE(p_txt, 'YYYY-MM-DD')`, tolerando NULL.

Gotcha de PL/SQL (paquete):
- **Una función local del paquete NO se puede llamar dentro de una sentencia SQL** (INSERT/UPDATE):
  da `PLS-00231: la función no se puede utilizar en SQL`. Calcularla en una variable local antes del
  SQL y usar la variable. Pasó con `f_fecha` en `PKG_PERSONAS_LUBRIMEC` (fix: `l_fecha := f_fecha(...)`
  y luego usar `l_fecha` en el INSERT/UPDATE).
- **`APEX_JSON.WRITE('campo', NULL)` es ambiguo** (`PLS-00307: demasiadas declaraciones de WRITE`):
  el compilador no sabe qué overload usar. No existe `WRITE_NULL` en todas las versiones
  (`PLS-00302`). Fix: usar una **variable tipada** puesta a NULL (ej. `l_b64 CLOB := NULL;`
  `APEX_JSON.WRITE('imagen_base64', l_b64);`). Pasó en `PKG_MONEDAS_LUBRIMEC`.

## Convención de archivos SQL

Desde 2026-07: **un solo archivo por página** con el paquete + los endpoints ORDS juntos, nombrado
`db/<tabla>_sql.sql` (minúsculas). Ejecutar completo como JOSEGALVEZ: corre primero el paquete,
luego el bloque `BEGIN ... ORDS.DEFINE_* ... END;`. Ejemplos: `personas_sql.sql`, `iva_sql.sql`,
`monedas_sql.sql`, `rubros_sql.sql`. (Las páginas viejas — marcas, whatsapp, ventas — quedan como
`PKG_*.sql` + `ORDS_*.sql` separados; no hace falta migrarlas.)

## Formularios cabecera + detalle (maestro-detalle)

Modelo: **Monedas** (`db/monedas_sql.sql` + `src/components/monedas-view.tsx`). Una tabla cabecera
(`MONEDAS`) y una de detalle (`MONEDAS_DETALLE`, FK a la cabecera, PK compuesta).

Backend (paquete + ORDS en el mismo archivo):
- Un solo paquete con procedimientos de **cabecera** (`LISTAR/INSERTAR/ACTUALIZAR/ELIMINAR`) y de
  **detalle** (`LISTAR_DETALLE`, `GUARDAR_DETALLE`, `ELIMINAR_DETALLE`).
- Rutas anidadas: `/<tabla>` y `/<tabla>/:id` para la cabecera; `/<tabla>/:id/detalle` y
  `/<tabla>/:id/detalle/:subid` para el detalle (el `:id` padre viaja en la URL).
- **Detalle con upsert:** si la PK del detalle la ingresa el usuario, hacer `GUARDAR_DETALLE` que
  inserta o actualiza según exista (evita distinguir POST/PUT).
- **Borrado en cascada manual:** al eliminar la cabecera, borrar antes el detalle (o confiar en la
  FK y devolver 409 si `SQLCODE = -2292`).
- **Imágenes BLOB:** se intercambian como **base64 en el JSON**. Guardar:
  `APEX_WEB_SERVICE.CLOBBASE642BLOB` (quitar antes el prefijo `data:...;base64,`). Leer:
  `APEX_WEB_SERVICE.BLOB2CLOBBASE64` + quitar `CHR(13)/CHR(10)`. El front arma el `data:` URL con el
  `mime_type`. Ver el gotcha de `WRITE(campo, NULL)` arriba.

Front (React):
- **Master-detail panel:** lista de cabeceras a la izquierda; al seleccionar una, panel derecho con
  su detalle. Cada nivel tiene su `useQuery` (`["<tabla>"]` y `["<tabla>-detalle", id]`) y su modal.
- Al mutar el detalle, invalidar **ambas** queries (el detalle y la cabecera, si esta muestra un
  contador tipo `cant_detalle`).
- Imagen: leer el archivo a base64 en el front (`btoa` por chunks para no reventar la pila) y mandar
  `{ valor, imagen_base64, nombre_imagen, mime_type }`; `imagen_base64: null` = no tocar la imagen.

## Archivos de referencia (tabla `marcas`)

- `db/marcas_sql.sql` — modelo CRUD: paquete + endpoints ORDS en un solo archivo
  (sección `=== 1) PAQUETE ===` y `=== 2) ENDPOINTS ORDS ===`, estructura plana +
  `DEFINE_PARAMETER` del header). **Todo endpoint nuevo sigue este formato unificado.**
- `db/personas_sql.sql` — CRUD con muchos campos (fecha, códigos de 1 char, helper JSON).
- `db/codigos_barras_sql.sql` / `db/articulos_proveedores_sql.sql` — CRUD con selector
  (endpoint de búsqueda `articulos/buscar`, `proveedores/buscar`) para elegir la FK en el form.
- `db/ORDS_MENU_PAGINAS.sql` — endpoint de solo lectura (sin paquete), también modelo plano.
- `db/ORDS_VENTAS_DASHBOARD.sql` — 3 GET de solo lectura para los gráficos del dashboard
  (`ventas/anios|meses|por-dia`), `cod_empresa` opcional con default 24.
- `db/ORDS_VENTAS_ARTICULOS.sql` — GET con múltiples filtros opcionales (patrón
  `l_x IS NULL OR ...`) y **default calculado** (sin filtros de fecha carga el último día con
  ventas y lo informa en `fecha_default`). Funciones costosas (`fn_precio_venta`,
  `fn_existencia_oem`) en CTEs sobre las filas ya filtradas, una vez por artículo.
- `src/lib/api.ts` (sección `Marcas`) — cliente frontend modelo.

## Notas / gotchas

- `cod_empresa` **no** viene en la sesión (`Sesion` solo trae token/usuario/app_user/app_id).
  Pasarlo explícito a `listar*`. Si se necesita global, agregarlo a `Sesion` en el login.
- Los binds de body en POST/PUT (`:descripcion`, etc.) ORDS los mapea automático
  desde el JSON del request. Los de ruta (`:id`) desde la URL.
- **Query params (`?app_id=...`) NO se auto-bindean** a `:app_id` de forma fiable; suelen
  llegar NULL. Leerlos del query string crudo dentro del handler:
  `OWA_UTIL.GET_CGI_ENV('QUERY_STRING')` + parseo manual (ver `get_qs` en
  `db/ORDS_MENU_PAGINAS.sql`). Síntoma de bind NULL: el `WHERE` filtra por NULL → 0 filas.
- `TO_NUMBER(:param)` para binds numéricos que llegan como texto (query/body).
- El proxy reenvía solo `authorization` + `content-type`; no propaga otros headers.
- **Vistas APEX desde ORDS:** un handler que consulta `APEX_APPLICATION_PAGES`,
  `APEX_APPLICATION_LIST_ENTRIES`, etc. devuelve 0 filas aunque la query corra bien en
  SQL Commands. Falta el contexto de workspace. Fijarlo antes de la query:
  `wwv_flow_api.set_security_group_id(p_security_group_id => 36593577189528884915);`
  (workspace JOSEGALVEZ). Ver `db/ORDS_MENU_PAGINAS.sql`.
- **Ordenamiento:** preferir ordenar en el front (ej. `marcas` se ordena por `id_marca`
  desc en `marcas-view.tsx`). El `ORDER BY` del paquete es solo un default.
- El proxy soporta **GET, POST, PUT, DELETE**. Solo envía body+`content-type` si hay
  payload: un DELETE con `content-type: application/json` y cuerpo vacío hace que ORDS
  responda 400 (`Expected one of <<{,[>> but got EOF`).
- **menu/paginas:** devuelve las páginas del usuario (`page_id`, `page_title`,
  `parent_entry_text`). El front arma el menú dinámico desde ahí; cada `page_id` se mapea
  a un componente en `VISTAS` (ver `src/GUIA_FRONT.md`). `app_user` debe ir en MAYÚSCULAS
  (los `app_user_id` en `roles_paginas` están en mayúsculas).
