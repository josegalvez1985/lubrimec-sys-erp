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

**Un solo archivo por tabla: `db/<tabla>_sql.sql`** (formato unificado). Contiene el paquete
CRUD **y** los endpoints ORDS, en dos secciones marcadas con comentarios. Modelo vivo:
`db/marcas_sql.sql`. (Los antiguos pares `PKG_<TABLA>.sql` + `ORDS_<TABLA>.sql` ya fueron
fusionados; **no** volver a separarlos.) Estructura del archivo:

```
-- <cabecera: tabla, page_id, PK, notas>
-- === 1) PAQUETE PKG_<TABLA>_LUBRIMEC ===
CREATE OR REPLACE PACKAGE PKG_<TABLA>_LUBRIMEC AS ... END; /
CREATE OR REPLACE PACKAGE BODY PKG_<TABLA>_LUBRIMEC AS ... END; /
-- === 2) ENDPOINTS ORDS ===
BEGIN ... (DELETE_HANDLER + DEFINE_TEMPLATE/HANDLER/PARAMETER) ... COMMIT; END; /
```

Se ejecuta completo de una vez (el paquete queda compilado antes de que los handlers ORDS lo
referencien). Excepciones que **sí** quedan en archivos aparte: piezas compartidas o sin paquete
CRUD — `PKG_AUTH_LUBRIMEC.sql`, `PROC_ENVIAR_MENSAJES_WHATSAPP.sql`, `WHATSAPP_DDL.sql`, y los
endpoints de solo lectura sin paquete (`ORDS_MENU_PAGINAS.sql`, `ORDS_VENTAS_*.sql`,
`pedidos_articulos_sql.sql`, `articulos_mas_vendidos_sql.sql`).

### Sección 1) Paquete

- Procedimientos: `LISTAR`, `OBTENER`, `INSERTAR`, `ACTUALIZAR`, `ELIMINAR`.
- Cada uno: 1) valida token → 401 si NULL, 2) ejecuta, 3) responde con APEX_JSON.
- Reusar el patrón de helpers `p_error(status, reason, message)` y
  `f_usuario(token)` de `PKG_MARCAS_LUBRIMEC`.
- Si la PK la asigna un trigger (renumerar), una secuencia o `GENERATED ... AS IDENTITY`,
  **no** incluir la PK en el INSERT y usar `RETURNING <pk> INTO l_id` para devolverla (modelos:
  `rubros_sql.sql` trigger, `monedas_sql.sql` secuencia, `condiciones_facturas_sql.sql` IDENTITY).
- Si la PK **la ingresa el usuario** (no autogenerada), validarla obligatoria y devolver 409 en
  `DUP_VAL_ON_INDEX` (modelos: `iva_sql.sql`, `unidades_medidas_sql.sql`).
- **Detalle maestro-detalle: verificar SIEMPRE si la PK es compuesta o global.** No asumir que el
  `nro_linea` de una tabla de detalle se numera por documento. `VENTAS_DETALLE` tiene PK compuesta
  `(id_factura, nro_linea)` → ahí `MAX(nro_linea)+1 WHERE id_factura` es correcto. Pero
  `COMPRAS_DETALLE` tiene **`PRIMARY KEY (nro_linea)` a secas** (global a toda la tabla) y un
  trigger `TRG_COMPRAS_DETALLE` que lo asigna desde `seq_compras_detalle` cuando llega NULL.
  Numerarlo a mano por factura repetía números ya usados por otras facturas → **ORA-00001**
  (`unique constraint COMPRAS_DETALLE_PK violated ... columns (NRO_LINEA)`). Fix: **no** incluir la
  columna en el INSERT y leerla con `RETURNING nro_linea INTO l_nro_linea`. Pista de que hay
  trigger: otro módulo inserta en esa tabla sin pasar la columna y funciona (`ajustar_inventarios_sql.sql`).
  El mensaje de Oracle dice qué columnas cubre la constraint: si lista una sola, la PK **no** es compuesta.
- **FK a otra tabla** (ej. `id_articulo`): capturar `-2291` (FK padre no existe) → 400 con mensaje
  claro. En LISTAR/OBTENER hacer `LEFT JOIN` a la tabla padre para devolver su descripción como
  campo de solo lectura (modelos: `codigos_barras_sql.sql`, `articulos_proveedores_sql.sql`).
- **Selector de FK (LOV):** añadir un `PROCEDURE BUSCAR_*(token, cod_empresa)` que devuelva la
  **lista completa** del catálogo, con los atributos que el front necesite para filtrar o para
  una cascada (`es_activo`, `id_rubro`, `id_marca`, etc.); el filtrado es **100% del front**
  (ver la REGLA más abajo). Modelo: `BUSCAR_ARTICULOS` en `inventario_sql.sql`.
  Los `BUSCAR_*` viejos con `q` + `FETCH FIRST 30` (`codigos_barras_sql.sql`,
  `articulos_proveedores_sql.sql`, `numeros_vouchers_sql.sql`) son **legado**: no copiarlos en
  páginas nuevas.
  - **`q` vacío → 400** (solo aplica a los `BUSCAR_*` legado que aún reciben `q`): el handler ORDS
    rechaza `q=` vacío. El proc debe tratar `TRIM(q) IS NULL` como "sin filtro" (devuelve los
    primeros 30), y el **cliente** front debe omitir el param `q` cuando no hay texto (ver
    `src/GUIA_FRONT.md`, gotcha del buscador). Modelo: `BUSCAR_PERSONAS` en
    `numeros_vouchers_sql.sql` (endpoint `personas/buscar`, usado por el buscador de cliente del POS).
  - **No mandar texto libre por query string.** `URLSearchParams` codifica el espacio como `+` y
    `UTL_URL.UNESCAPE` **no** lo revierte: toda búsqueda con espacios llega con `+` incrustado y no
    matchea nada. Otra razón para que el filtrado viva en el front.
  - **Búsqueda por RUC/CI:** normalizar guiones/espacios en ambos lados para que `4962931` matchee
    `496293-1`: `REPLACE(REPLACE(UPPER(nro_ruc),'-'),' ') LIKE l_qn`, con `l_qn` el término también
    sin guiones ni espacios. Modelo: `BUSCAR_PERSONAS` en `numeros_vouchers_sql.sql`.
  - **REGLA — LOV completa, filtro en el front (TODA LOV, sin excepciones):** el proc devuelve
    **la lista completa** (sin `q`, sin `FETCH FIRST 30`),
    y el **front** hace el filtrado flexible (mayúsculas/minúsculas, multi-palabra en cualquier
    orden, ID parcial, RUC/CI con o sin guion, sin tope de resultados). Requerimiento explícito del usuario para el
    LOV de proveedores de Compras. Modelo: `BUSCAR_PROVEEDORES` en `compras_sql.sql` (endpoint
    `compras-cabecera/buscar-proveedores?cod_empresa=:n`) + `buscarProveedoresCompra` en
    `src/lib/api.ts`.
    **Esta variante es LA regla para TODA LOV nueva, incluidas las de artículos** (pedido
    explícito del usuario, repetido; costó varias iteraciones). NO volver al patrón `q` +
    `FETCH FIRST 30` en la BD salvo pedido explícito. Modelo con artículos:
    `PKG_INVENTARIO_LUBRIMEC.BUSCAR_ARTICULOS` (`inventario_sql.sql`): devuelve el catálogo
    completo con sus atributos de cascada (`es_activo`, `id_rubro`, `id_marca`) y el front
    filtra todo (multi-palabra en cualquier orden, ID parcial, cascada), sin tope.
    **Ya migrados** (todos los `BUSCAR_ARTICULOS` del proyecto siguen la regla):
    `inventario_sql.sql`, `compras_sql.sql` (`compras-cabecera/buscar-articulos`) y
    `codigos_barras_sql.sql` (`articulos/buscar`, el genérico que usan también
    artículos-proveedores y vehículos-repuestos).
    La regla no es solo para artículos: `BUSCAR_COMPRAS` de `compras_pagos_sql.sql`
    (`compras/buscar`, LOV de facturas del pago) también devuelve la lista completa —
    ahí el front filtra además por **fecha** (`dd/mm/yyyy` e ISO) y por serie-número
    de comprobante.
    - Al migrar un proc viejo, **dejar `p_q` en la firma** aunque no se use: el handler ORDS ya
      bindea `:q` y cambiar la firma obliga a tocar el script ORDS. Se ignora y se documenta.
    - **Agregar campos a una LOV compartida es seguro; quitarlos no.** `articulos/buscar`
      (`codigos_barras_sql.sql`) lo usan tres páginas (códigos de barras, artículos-proveedores,
      vehículos-repuestos), así que el `BUSCAR_ARTICULOS` devuelve la **unión** de lo que cada una
      necesita: sumó `id_rubro` y `rubro` (`LEFT JOIN rubros`) para que la pág 94 ofrezca solo
      artículos de rubros de filtros, y las otras dos simplemente ignoran esas claves. En el front
      los campos nuevos van **opcionales** (`rubro?: string | null`): `APEX_JSON` omite las claves
      NULL y una BD sin el paquete nuevo no los manda.
  - **`ARTICULOS` tiene DOS columnas de activo — filtrar por `ESTADO`, no por `es_activo`.**
    `ESTADO = 'A'` es Activo/Inactivo (lo que muestra el APEX y lo que el usuario espera ver);
    `es_activo` (`'S'`/`'N'`) es otra cosa. Filtrar por la equivocada dejaba fuera artículos
    válidos de las LOVs. Usar `UPPER(NVL(estado, 'A')) = 'A'` (criterio único en
    `compras_sql.sql` y `codigos_barras_sql.sql`).
- **Imagen en BLOB** (modelo: `articulos_sql.sql`). Reglas para no serializar megas de más:
  - `LISTAR` **no** devuelve el blob: solo `CASE WHEN DBMS_LOB.GETLENGTH(archivo_imagen) > 0 THEN 1
    ELSE 0 END AS tiene_imagen`.
  - `OBTENER` devuelve `imagen_base64` con `APEX_WEB_SERVICE.BLOB2CLOBBASE64(blob)`.
  - `INSERTAR`/`ACTUALIZAR` reciben `p_imagen_base64 IN CLOB`; se convierte con
    `APEX_WEB_SERVICE.CLOBBASE642BLOB`. En ACTUALIZAR, si viene NULL/vacío **no** se toca la imagen
    (solo se actualizan los campos de negocio); si viene, se hace un UPDATE aparte del blob.
  - **Servir el thumbnail:** `PROCEDURE SERVIR_IMAGEN(p_id, p_cod_empresa)` que emite el blob con
    `OWA_UTIL.MIME_HEADER(mime)` + `WPG_DOCLOAD.DOWNLOAD_FILE(blob)`. Su endpoint `tabla/:id/imagen`
    es **público** (sin `DEFINE_PARAMETER` de Authorization): el `<img>` del navegador no manda el
    header. El proxy (`ords.$.ts`) reenvía binarios como `arrayBuffer`, no como texto.
- **ELIMINAR de una cabecera con hijos → borrado en cascada manual.** Si la tabla tiene hijos con FK
  (`VENTAS_CABECERA` ← `VENTAS_DETALLE`/`VENTAS_COBROS`), un `DELETE` solo de la cabecera falla
  **siempre** con `ORA-02292` en cuanto la fila tiene detalle: el usuario ve "no se puede eliminar"
  para toda venta real. El procedimiento debe: 1) validar que exista (con un `SELECT COUNT(*)`, ya
  que el `SQL%ROWCOUNT` del DELETE deja de servir), 2) borrar los hijos, 3) borrar la cabecera,
  4) **un solo `COMMIT`** al final (atómico, `ROLLBACK` en el `EXCEPTION`). Dejar el `-2292` mapeado
  a 409 para hijos de **otras** tablas no contempladas. Modelo: `PKG_VENTAS_LUBRIMEC.ELIMINAR`
  (`ventas_sql.sql`).
- **Total del maestro calculado desde el detalle:** cuando la grilla necesita el total por fila
  (ej. el importe de cada factura), calcularlo en el `LISTAR` con una **subconsulta escalar** sobre
  el detalle, con la **misma fórmula** que usa el procedimiento de detalle para que los números
  coincidan entre pantallas:
  `(SELECT NVL(SUM(NVL(d.cantidad,0)*NVL(d.precio,0)),0) FROM ventas_detalle d WHERE d.id_factura = b.id_factura) AS total`.
  Modelo: `PKG_VENTAS_LUBRIMEC.LISTAR`.
- Estados: 201 Created, 400 Bad Request, 404 Not Found, 401 Unauthorized,
  500 Internal Server Error.

### Sección 2) Endpoints ORDS

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

   - **Query params** (los que no son `:id` de la ruta): no se auto-bindean fiable; leerlos del
     `QUERY_STRING` crudo con el helper `get_qs(qs, key)` (modelo en cualquier handler de
     `codigos_barras_sql.sql`). El `:id` de la ruta sí llega como bind.

### Agregar el cliente en `src/lib/api.ts`

   - Tipo `Tabla` (campos exactos de la tabla, incluidos los de solo lectura del JOIN) y
     `TablaInput` (solo lo que se escribe, sin PK ni campos del JOIN).
   - Funciones `listarTablas(codEmpresa)`, `obtenerTabla(id)`, `crearTabla(input)`,
     `actualizarTabla(id, input)`, `eliminarTabla(id)`. Si hay FK con selector: `buscar*(codEmpresa, q)`.
   - Usar el helper `authFetch(path, init)` ya existente (mete Bearer, maneja 401).

### Ejecutar en BD

Ejecutar el archivo `<tabla>_sql.sql` **completo** como el esquema JOSEGALVEZ (una sola corrida:
paquete + ORDS). Requiere `PKG_AUTH_LUBRIMEC` ya compilado.

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
  SQL y usar la variable. Pasó con `f_fecha` en `PKG_PERSONAS_LUBRIMEC` y de nuevo con `f_flag` en
  `PKG_ROLES_PAG_LUBRIMEC` (fix: `l_x := f_x(...)` en el DECLARE y usar `l_x` en el INSERT/UPDATE).
- **`APEX_JSON.WRITE('campo', NULL)` es ambiguo** (`PLS-00307: demasiadas declaraciones de WRITE`):
  el compilador no sabe qué overload usar. No existe `WRITE_NULL` en todas las versiones
  (`PLS-00302`). Fix: usar una **variable tipada** puesta a NULL (ej. `l_b64 CLOB := NULL;`
  `APEX_JSON.WRITE('imagen_base64', l_b64);`). Pasó en `PKG_MONEDAS_LUBRIMEC`.

## Permisos por usuario (app_user)

Cuando el APEX restringe qué ve cada usuario (ej. solo `JOSEG` ve todo o ciertos campos), replicarlo
en el paquete: recibir `p_app_user IN VARCHAR2` y decidir el filtro/visibilidad dentro del PL/SQL.

**Preferir la función del APEX antes que hardcodear un usuario.** Cuando el IR oculta columnas con
la condición `pkg_apex_admin.fn_verifica_campo(p_app_id, p_app_page_id, p_app_user_id)` (que lee el
flag `ROLES_PAGINAS.ver_campos`), el permiso es **dato**, no una constante: se administra desde la
página 37 y puede dárselo a cualquier usuario. Llamar a la misma función —igual que con
`FN_SALDO_PROVEEDOR` en las LOVs— en vez de escribir `= 'JOSEG'`, que deja fuera a cualquier otro
usuario habilitado. Modelo: `ventas_articulos_sql.sql` (pág 54):

```plsql
BEGIN
    l_ve_campos := PKG_APEX_ADMIN.FN_VERIFICA_CAMPO(
                       p_app_id => TO_NUMBER(l_app_id), p_app_page_id => 54,
                       p_app_user_id => UPPER(l_app_user));
EXCEPTION WHEN OTHERS THEN l_ve_campos := FALSE;   -- fail-closed, como el APEX
END;
IF l_ve_campos IS NULL THEN l_ve_campos := FALSE; END IF;
```

- **Fail-closed:** ante cualquier error se oculta. El APEX hace lo mismo (su `EXCEPTION` devuelve
  `NULL`, que como condición de display no muestra la columna).
- **No escribir la clave en el JSON** cuando no hay permiso (`APEX_JSON` omite lo no escrito):
  ocultar la columna solo en el front deja el costo y la rentabilidad viajando al navegador, donde
  cualquiera los ve en la pestaña Red. El front declara esos campos **opcionales**.
- Devolver además un flag (`ver_campos` = `'S'` / `'N'`) para que el front sepa si dibujar la columna.
- `existencia_articulos_sql.sql` (pág 70) y `conteo_efectivo_sql.sql` (pág 85) todavía comparan
  contra `'JOSEG'`: es una aproximación previa a esta regla, no el modelo a copiar.
- El front pasa `app_user` como **query param** (`?app_user=JOSEG&...`); leerlo con `get_qs` como
  cualquier otro query param. Viene en MAYÚSCULAS (igual que en `menu/paginas`).
- Ejemplo de regla (pág 85 conteo-efectivo): `l_es_admin := (UPPER(NVL(p_app_user,'-')) = 'JOSEG')`;
  si es admin filtra por fecha opcional, si no fuerza `TRUNC(fecha)=TRUNC(SYSDATE)`.
- Un endpoint de **resumen/totales** solo para admin devuelve `{ visible:false }` cuando no es JOSEG
  (el front no dibuja el panel). Modelo: `PKG_CONTEO_EFECTIVO_LUBRIMEC.RESUMEN` + endpoint
  `conteo-efectivo/resumen`.

## Sub-ruta fija junto a `/:id` (ej. `/resumen`, `/buscar`)

Una plantilla con segmento fijo (`tabla/resumen`) que convive con `tabla/:id` puede colisionar: si la
petición cae en `:id`, `TO_NUMBER('resumen')` revienta → **400**. Fijar `p_priority => 1` en la
plantilla del segmento fijo para que ORDS la matchee **antes** que `:id` (que va con prioridad 0).
Modelo: `conteo-efectivo/resumen`.

## Convención de archivos SQL

**Un archivo por página, nombre en minúsculas con sufijo `_sql.sql` y SIN prefijo `ORDS_`** —
aunque el archivo sea solo endpoints de lectura sin paquete. Nombrar `db/<tabla_o_recurso>_sql.sql`.
El nombre del archivo **no** afecta las rutas ORDS (esas son literales dentro de
`ORDS.DEFINE_TEMPLATE`). Ejecutar completo como JOSEGALVEZ: corre primero el paquete (si hay), luego
el bloque `BEGIN ... ORDS.DEFINE_* ... END;`.

- **CRUD simple:** `marcas_sql.sql`, `personas_sql.sql`, `iva_sql.sql`, `rubros_sql.sql`.
- **Selector de FK:** `codigos_barras_sql.sql`, `articulos_proveedores_sql.sql`.
- **LOV filtrada por una función de negocio del APEX:** `compras_pagos_sql.sql` (pág 77/78) —
  la LOV de facturas del pago replica el `WHERE` de la LOV de APEX tal cual, incluida la llamada
  a `PKG_COMPRAS.FN_SALDO_PROVEEDOR(cod_empresa, id_factura) = 'S'` (solo facturas con saldo).
  Cuando una LOV del APEX llama a una función del esquema, **usar la misma función** en vez de
  reimplementar el cálculo: así las dos pantallas nunca se contradicen. `LISTAR`/`OBTENER`
  devuelven además los campos del JOIN que el front necesita para rearmar la etiqueta de la LOV
  (`fec_comprobante`, `ser_timbrado`, `nro_comprobante`, proveedor).
- **Imagen BLOB:** `articulos_sql.sql`, `monedas_sql.sql`.
- **Reporte facetado de solo lectura (sin paquete):** `compras_articulos_sql.sql`,
  `ficha_existencia_sql.sql`, `articulos_sin_barra_sql.sql`, `existencia_articulos_sql.sql`,
  `articulos_no_inventariados_sql.sql` (pág 81), `precios_mayoristas_sql.sql` (pág 82),
  `marcas_vs_descripcion_sql.sql` (pág 93).
- **Rango de fechas con default calculado:** `costo_inventarios_sql.sql` (pág 92) — recibe
  `desde`/`hasta` opcionales (YYYY-MM-DD); sin ellos usa el parámetro `FECHA_INVENTARIO`
  (inicio del inventario en curso) → hoy, y devuelve en el JSON el rango efectivo
  (`fecha_desde`/`fecha_hasta`) + `fecha_inicio_inventario` para mostrarlos en el front.
  (En APEX los binds NULL no traían filas; el default evita la pantalla vacía.)
- **Módulo Inventario:** `inventario_sql.sql` (pág 58/59, CRUD + LOVs propias + código de barras),
  `articulos_para_inventario_sql.sql` (pág 76), `ajustar_inventarios_sql.sql` (pág 87/88, ajuste
  con comprobante AJS-E atómico + foto pública), `planilla_inventarios_sql.sql` (pág 112/113/115,
  planilla masiva + upload de foto binario).
- **Maestro-detalle:** `ventas_sql.sql` (pág 60/109) y `compras_sql.sql` (pág 28/36) — cabecera con
  total calculado del detalle + `LEFT JOIN` a las FK para devolver descripciones de solo lectura
  (`desc_moneda`, `desc_condicion`, `nombre_comprador`, `nombre_proveedor`), upsert de línea y
  LOVs propias del módulo. Ojo con la numeración del detalle (ver la nota de PK compuesta vs
  global más arriba).
- **Proceso de negocio replicado del APEX:** `ajustar_inventarios_sql.sql` — el proceso AFTER
  SUBMIT del APEX (nro de comprobante con algoritmo de huecos + INSERT cabecera/detalle + UPDATE
  de cierre) se replica como UN procedimiento con COMMIT único al final (atómico, ROLLBACK en
  el EXCEPTION), en vez de los COMMIT intermedios del APEX.
- **Otros:** `parametros_sql.sql` (pág 89/90), `sortear_sql.sql` (pág 108),
  `roles_paginas_sql.sql` (pág 37/38/64, PK compuesta + LOVs de vistas APEX con workspace fix).

> Los `ORDS_*.sql` en mayúsculas son la convención vieja (quedan `ORDS_MENU_PAGINAS`,
> `ORDS_VENTAS_DASHBOARD`, `ORDS_POST_VENTA`, `ORDS_SUBA_PRECIOS`, `ORDS_CIERRE_DIA`); al
> tocarlos, renombrarlos con `git mv` a minúsculas. Ya migrados así: `ventas_articulos_sql.sql`
> (pág 54), `pedidos_articulos_sql.sql` (pág 63), `articulos_mas_vendidos_sql.sql` (pág 102).

## Reporte facetado de solo lectura (front filtra todo)

Patrón para páginas APEX de **búsqueda facetada** (Interactive Report + facetas): páginas 55, 56,
57, 70, 102, 63. El backend es un handler plano de solo lectura que devuelve **todo el dataset** de
la vista (`WHERE cod_empresa` + los filtros fijos del IR); el filtrado (búsqueda global + facetas
multi-select dependientes) es **100% en el front**. No filtrar por fecha en el `WHERE` de la vista:
si la vista es pesada puede colgar/500 (pasó con `V_COBROS_CLIENTES`); traer todo y filtrar/paginar
por mes en el front.

- Front: componente compartido de facetas `src/components/ui/faceta.tsx` (look de Pedidos de
  Artículos) + `DataTable` con total al pie y export. Imagen por artículo con `ArticuloImgModal`.
  Para datasets con fecha, **carga incremental por mes** ("Mostrar más"). Ver `src/GUIA_FRONT.md`.
- Permiso por usuario: si el IR oculta columnas por `fn_verifica_campo` (ej. costos solo para
  JOSEG), el handler recibe `app_user` como query param y solo escribe esas columnas si corresponde
  (modelo: `existencia_articulos_sql.sql`, misma idea que `conteo-efectivo`).

## POST con body JSON complejo (arrays anidados) + registro atómico

Cuando el body no es plano (arrays de objetos, ej. un carrito con detalle + cobros), ORDS **no**
puede auto-bindear a variables (`:descripcion`, etc.). Leer el cuerpo crudo con el bind implícito
**`:body_text`** (CLOB) en el handler `plsql/block` y parsearlo con `APEX_JSON.PARSE` /
`APEX_JSON.GET_*` dentro del paquete. Modelo: `punto_venta_sql.sql` (`pos/registrar`).

- **NO** declarar el body con `ORDS.DEFINE_PARAMETER(... p_source_type => 'BODY' ...)`: en algunas
  versiones de ORDS eso viola `REST_PARAMS_SOURCE_TYPE_CK` y falla la creación del endpoint.
  `:body_text` está disponible sin declararlo (solo se declara el `Authorization` HEADER).
- Leer arrays con `APEX_JSON.GET_COUNT('detalle')` + `GET_NUMBER('detalle[%d].campo', i)` en un loop.
- **Registro atómico multi-tabla:** el POS reemplaza las `apex_collections` del APEX (CARRITO/
  CABECERA/FORMAPAGO) por estado en React + un único POST que hace todos los INSERT en una
  transacción (rollback ante error). El id lo da `PKG_VENTAS.fn_id_factura()`. Modelo:
  `PKG_PUNTO_VENTA_LUBRIMEC.REGISTRAR` (VENTAS_CABECERA + DETALLE + COBROS).

## Upload binario (imagen cruda) con `:body` BLOB

Para **subir** una imagen sin base64 (ej. la foto del conteo, pág 115): el front manda el archivo
como **body binario crudo** (`Content-Type: image/jpeg`) y el handler lo lee con el bind implícito
**`:body`** (BLOB). Modelo: `PUT planilla-inventarios/:id/foto` en `db/planilla_inventarios_sql.sql`.

- **`:body` solo puede referenciarse UNA vez** en el bloque (se lee en streaming): asignarlo a una
  variable local al inicio (`l_foto := :body;`) antes de cualquier otra cosa.
- Declarar `p_mimes_allowed => 'image/jpeg,image/png,application/octet-stream'` en el handler.
- No confundir con `:body_text` (CLOB, para JSON complejo — ver sección anterior). Con `:body` el
  cuerpo NO es JSON: los query params (`cod_empresa`) van en la URL y se leen con `get_qs`.
- El proxy (`ords.$.ts`) reenvía el request body como **`arrayBuffer`** — con `request.text()` los
  binarios se corrompen (se decodifican como UTF-8). Ya está arreglado; no regresionarlo.
- Para **mostrar** la imagen después, se usa el endpoint público tipo `SERVIR_IMAGEN`
  (ej. `GET /inventario/:id/foto`, en `db/ajustar_inventarios_sql.sql`, con MIME por magic bytes).

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
- `db/ventas_articulos_sql.sql` — GET con múltiples filtros opcionales (patrón
  `l_x IS NULL OR ...`) y **default calculado** (sin filtros de fecha carga el último día con
  ventas y lo informa en `fecha_default`). Funciones costosas (`fn_precio_venta`,
  `fn_existencia_oem`) en CTEs sobre las filas ya filtradas, una vez por artículo.
- `db/cobros_tarjeta_sql.sql` — solo endpoints ORDS (sin paquete): GET listar sobre una **vista**
  (`v_cobros_clientes`, cobros con tarjeta pendientes de acreditar) + PUT que hace `UPDATE` sobre
  `ventas_cobros` (marca `ind_acreditado='S'` y guarda `monto_acreditado`). Modelo de "GET a vista
  + PUT que muta otra tabla". Panel en el dashboard (`cobros-tarjeta-view.tsx`), no una página del
  menú. `cod_empresa` opcional con default 24.
- `src/lib/api.ts` (sección `Marcas`) — cliente frontend modelo.

## Envío de WhatsApp (proceso en background, no un endpoint CRUD)

`ENVIAR_MENSAJES_WHATSAPP` (`db/PROC_ENVIAR_MENSAJES_WHATSAPP.sql`) corre en background vía
DBMS_SCHEDULER (lo lanza `PKG_WHATSAPP_LUBRIMEC.ENVIAR`, que devuelve un `job_id`; el front hace
polling de `LOG_WHATSAPP`). No puede ser síncrono: hay pausas entre números. **Ritmo anti-bloqueo
actual:** lote de **60** números por corrida (`v_max_registros`), **20s** entre números
(`v_pausa_segs`), y cada **20** números (`v_tanda_numeros`) una pausa larga de **90s**
(`v_pausa_tanda_segs`). Tras el último número no se duerme. Si cambiás estos valores, actualizá
también `MAX_LOTE_BASE` en `whatsapp-view.tsx` (debe coincidir con `v_max_registros`) y los textos
de la UI que describen el ritmo.

## Disparar un job de DBMS_SCHEDULER desde un endpoint

Modelo: `db/cargar_articulos_sql.sql` (`POST cargar-articulos`) — corre
`JOB_CARGA_REPUESTOS`, `JOB_INSERT_LUBRICANTES` y `JOB_ARTICULOS_MAS_VENDIDOS`, el bloque
anónimo que antes se ejecutaba a mano en la BD.

- `DBMS_SCHEDULER.RUN_JOB(job, use_current_session => TRUE)` corre el job **en la sesión del
  request**: el POST es **síncrono** y no responde hasta que termina. Es lo que se quiere (el
  usuario ve el resultado), pero si el job crece puede chocar con el timeout de ORDS/proxy. Si
  eso pasa, la alternativa es `use_current_session => FALSE` + polling (patrón WhatsApp).
- **Un `BEGIN/EXCEPTION` por job**, no un bloque único: el bloque anónimo original abortaba en el
  primer error y no se sabía qué había corrido. La respuesta devuelve
  `data: [{ job, ok, error?, segundos }]` y `success = (0 fallas)`.
- **Sin `COMMIT`/`ROLLBACK` en el handler:** cada job maneja su propia transacción.
- El POST **no lleva body**: los parámetros (`app_user`) van por query string y se leen con
  `get_qs`. El proxy no manda `content-type` cuando no hay payload, así que ORDS no tira el 400
  de "Expected {,[ but got EOF".
- Proceso de carga masiva → **restringido a `app_user = 'JOSEG'`** (403 al resto), igual criterio
  que `conteo-efectivo`/`existencia-articulos`.

## Notas / gotchas

- **`VISCOSIDAD_LUBRICANTES` no tiene `cod_empresa`:** se une solo por id
  (`LEFT JOIN viscosidad_lubricantes vi ON vi.id_viscosidad = ar.id_viscosidad`). Agregarle
  `AND vi.cod_empresa = ...` da ORA-00904. Modelos: `consulta_precios_sql.sql`,
  `articulos_mas_vendidos_sql.sql` y el `LISTAR` de `precios_ventas_sql.sql`.

- **Sumar un campo a un `LISTAR` que usan varias vistas** (el de `precios_ventas_sql.sql` lo usan
  la grilla de la pág 34 y la pestaña Evolución): igual que con las LOVs compartidas, agregar es
  seguro y quitar no. En el front el campo va **opcional** (`viscosidad?: string | null`) y la UI
  que depende de él se **oculta si no llega** (`hayViscosidad` en `evolucion-precios.tsx`): así
  la pantalla no queda con un filtro vacío mientras el `.sql` no se re-ejecute en la BD.

- **Un JOIN que multiplica filas duplica todos los `SUM` de la query (fan-out).** Antes de
  sumar, revisar que CADA join de la query sea 1:1 con el grano de la fila. Basta una tabla
  auxiliar con dos filas para la misma clave y todos los totales salen multiplicados, sin ningún
  error: el número simplemente está mal.
  - Caso real (pág 63): `base_movimientos` traía un `LEFT JOIN articulos_proveedores d ON
    (cod_empresa, id_articulo, cod_persona)`. Esa tabla tiene **PK propia**
    (`id_articulo_proveedor`), **no** una clave por artículo+proveedor, y el paquete no valida
    duplicados, así que un artículo cargado dos veces para el mismo proveedor hacía que cada
    línea de compra se contara **dos veces**. Para colmo el join era **código muerto**: lo único
    que sacaba (`d.id_cod_proveedor`) no lo usaba nadie aguas abajo. Venía del APEX.
  - **Chequear la PK real antes de confiar en un join.** "Parece una clave natural" no alcanza:
    varias tablas del esquema tienen PK sustituta y permiten repetidos (`articulos_proveedores`
    por `id_articulo_proveedor`, `compras_detalle` por `nro_linea` global — ver la nota de PK
    compuesta vs global más arriba).
  - **Si el dato SÍ hace falta, colapsar antes de unir.** Es lo que se hizo después para traer
    `id_cod_proveedor` al texto del pedido, en las páginas 63 y 102: un CTE que reduce
    `articulos_proveedores` a UNA fila por clave (`GROUP BY` + `LISTAGG` de los códigos) y recién
    eso se une. El join queda 1:1 por construcción, y de paso se ven todos los códigos en vez de
    elegir uno a dedo. Modelos: `codigos_prov` en `pedidos_articulos_sql.sql` (une por
    `cod_persona`) y en `articulos_mas_vendidos_sql.sql` (une por **nombre**, porque esa tabla
    guarda `nombre_proveedor` y no el código de la persona; genera filas para `nombre` y para
    `nombre_fantasia` para no depender de cuál haya guardado el job).
  - **Una tabla precalculada por un job puede traer el fan-out adentro.**
    `articulos_mas_vendidos` la llena `JOB_ARTICULOS_MAS_VENDIDOS`, que **no está en este repo**:
    el handler de la pág 102 solo lee sus columnas (`cantidad_ventas`, `stock`), no calcula nada.
    Si esos números salen inflados hay que revisar el job, no el endpoint ni el front. El control
    es el mismo de siempre: comparar contra un `SUM` directo sobre `ventas_detalle` agrupado por
    `id_articulo`.
  - **Sacar un `LEFT JOIN` nunca pierde filas**, solo deja de multiplicarlas: si sus columnas no
    se usan, se borra sin pensarlo. Si hiciera falta el dato, va agregado aparte (un CTE con
    `GROUP BY`) o con `DISTINCT`, nunca colgado de la query que suma.
  - **Cómo detectarlo sin acceso a la BD:** buscar en la pantalla dos magnitudes que se calculen
    por caminos distintos y tengan que cerrar entre sí. En la pág 63, `existencia` sale de un CTE
    que NO tiene ese join, así que `compras - ventas = existencia` sirvió de control: la pantalla
    mostraba 22 - 6 con existencia 5, y 11 - 6 = 5 delató que las compras venían al doble. Un OEM
    de la misma pantalla cerraba bien (3 - 1 = 2) porque ese artículo estaba cargado una sola vez:
    que el error aparezca en unas filas y en otras no es la firma del fan-out.

- **"Proveedor" es `ind_cliente_proveedor` en (P, A), no cualquiera que aparezca en una compra.**
  `PERSONAS.ind_cliente_proveedor` vale `C` (Cliente), `P` (Proveedor) o `A` (Ambos), y el
  criterio del proyecto es `NVL(ind_cliente_proveedor, '-') IN ('P', 'A')` — el `NVL` a `'-'`
  deja fuera a quien no lo tenga cargado. Usarlo **tal cual** en toda pantalla que liste
  proveedores, para que no se contradigan entre sí. Ya lo aplican `compras_sql.sql` (LOV),
  `articulos_proveedores_sql.sql` (LOV), `pedidos_articulos_sql.sql` (pág 63) y
  `articulos_mas_vendidos_sql.sql` (pág 102).
  - **Es un INNER JOIN: no filtra columnas, borra filas enteras.** Una compra cargada a una
    persona marcada solo como Cliente desaparece del reporte, totales incluidos. Antes de
    aplicarlo a una pantalla nueva conviene mirar a quién deja afuera:
    `... WHERE NVL(p.ind_cliente_proveedor,'-') NOT IN ('P','A')` sobre las personas que sí
    tienen movimientos. Lo que salga ahí son proveedores mal clasificados, no ruido.
  - **Cuidado cuando solo se tiene el NOMBRE.** `articulos_mas_vendidos` guarda
    `nombre_proveedor`, no `cod_persona`, así que el vínculo va por nombre (CTE `prov_valido`) y
    hay que contemplar `nombre` **y** `nombre_fantasia`: distintas pantallas guardan uno u otro
    (`compras_sql.sql` usa `NVL(nombre_fantasia, nombre)`, la pág 63 usa `nombre` pelado).

- **`tip_comprobante = 'AJS'` NO es una compra.** Los ajustes de stock e inventario se guardan
  en `COMPRAS_CABECERA`/`COMPRAS_DETALLE` (los genera `ajustar_inventarios_sql.sql` como serie
  AJS-E), así que aparecen en cualquier query que lea esas tablas sin filtrar. Toda **lista o
  total de compras** tiene que llevar `AND tip_comprobante NOT IN ('AJS')`. Ya lo aplican
  `compras_sql.sql` (pág 28, listado y filtro de años), `compras_articulos_sql.sql` (pág 55),
  `precios_ventas_sql.sql` (pág 34) y `pedidos_articulos_sql.sql` (pág 63).
  - **Dónde NO ponerlo:** en los cálculos de **existencia**. Un ajuste no es una compra pero sí
    mueve el stock; filtrarlo ahí da saldos equivocados (por eso el CTE `existencias` de la
    pág 63 los incluye a propósito). Tampoco en `OBTENER` ni en nada que busque por
    `id_factura`, ni en el algoritmo de huecos del `nro_comprobante`, que tiene que seguir
    numerando las series AJS.
  - Un ajuste **tampoco es una venta**: el APEX de la pág 63 tenía una rama que sumaba
    `ABS(cantidad)` de los AJS a la columna Ventas. Se sacó.

- **La query del APEX puede estar rota: verificarla, no solo copiarla.** Al portar una página se
  asume que el SQL del Interactive Report es la verdad, pero puede traer un bug de origen que
  nadie notó. Pasó con **Pedidos de Artículos (pág 63)**: la columna Ventas daba 0 para todos los
  artículos, en el APEX y en el port. Dos defectos clásicos, que conviene buscar en toda query
  portada:
  - **Se comparó la persona equivocada.** `VENTAS_CABECERA.cod_persona` es el **cliente**;
    `ARTICULOS_PROVEEDORES.cod_persona` es el **proveedor**. La rama de ventas los igualaba
    (`d.cod_persona = a.cod_persona`), así que no matcheaba nunca. Varias tablas del esquema
    tienen una columna `cod_persona` que significa cosas distintas: confirmar cuál es cuál
    (`ventas_sql.sql` la usa para `nombre_cliente`; `compras_sql.sql` para el proveedor).
  - **Un `JOIN` posterior sobre las columnas de un `LEFT JOIN` lo convierte en `INNER`.** Si
    `d` es `LEFT JOIN` y después viene `JOIN personas e ON e.cod_persona = d.cod_persona`, las
    filas sin match en `d` tienen `d.cod_persona` NULL y el inner las descarta: el `LEFT` no
    sirve de nada. O el segundo join también es `LEFT`, o se toma la columna de una tabla que
    siempre está (en la pág 63 el proveedor sale de `a`, el comprobante).
  - **Síntoma para detectarlo sin correr nada:** una columna numérica que da 0 o vacío en TODAS
    las filas, mientras las columnas que se calculan en otro CTE (ahí la existencia) sí andan.
- **Un dato que no pertenece al grano de la fila no se fuerza al `GROUP BY`.** En la pág 63 las
  filas son artículo+proveedor, pero **una venta no tiene proveedor**. Intentar atribuirla a uno
  es lo que rompió la query. La salida limpia es calcular ese dato en su **propio CTE** con la
  clave que sí le corresponde (ahí `codigo_oem`) y `LEFT JOIN`-earlo al final —el mismo patrón
  que ya usaba `existencias_totales`—, agregando la columna al `GROUP BY`.

- **Síntoma "el código está bien pero la app se comporta viejo":** los `.sql` de este repo **no** se
  aplican solos, hay que ejecutarlos a mano en la BD. Si el front manda un parámetro que el handler
  ya lee y aun así se ignora (ej. `ventas-cobros?id_factura=` devolviendo todos los cobros), o si un
  endpoint responde 404, lo primero a descartar es que la BD tenga una versión anterior del paquete
  o del handler: re-ejecutar el `<tabla>_sql.sql` completo como JOSEGALVEZ. Cuando el dato es crítico
  para la UI conviene además **filtrar defensivamente en el front** (modelo: el modal de cobros de
  `ventas-view.tsx` descarta lo que no sea de esa factura).
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
  `APEX_APPLICATION_LIST_ENTRIES`, `WWV_FLOW_USERS`, etc. devuelve 0 filas aunque la query corra
  bien en SQL Commands. Falta el contexto de workspace. Fijarlo antes de la query:
  `wwv_flow_api.set_security_group_id(p_security_group_id => 36593577189528884915);`
  (workspace JOSEGALVEZ). Ver `db/ORDS_MENU_PAGINAS.sql` y `db/roles_paginas_sql.sql`
  (helper `p_set_workspace`).
- **Ordenamiento:** preferir ordenar en el front (ej. `marcas` se ordena por `id_marca`
  desc en `marcas-view.tsx`). El `ORDER BY` del paquete es solo un default.
- El proxy soporta **GET, POST, PUT, DELETE**. Solo envía body+`content-type` si hay
  payload: un DELETE con `content-type: application/json` y cuerpo vacío hace que ORDS
  responda 400 (`Expected one of <<{,[>> but got EOF`).
- **menu/paginas:** devuelve las páginas del usuario (`page_id`, `page_title`,
  `parent_entry_text`). El front arma el menú dinámico desde ahí; cada `page_id` se mapea
  a un componente en `VISTAS` (ver `src/GUIA_FRONT.md`). `app_user` debe ir en MAYÚSCULAS
  (los `app_user_id` en `roles_paginas` están en mayúsculas).
