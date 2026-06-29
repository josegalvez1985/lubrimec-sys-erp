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
- **Auth:** token Bearer validado con `PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(:token)`.
  Devuelve el usuario o `NULL` si es inválido/expirado.
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
   - Si la PK la asigna un trigger (renumerar), usar `RETURNING <pk> INTO` en el INSERT.
   - Estados: 201 Created, 400 Bad Request, 404 Not Found, 401 Unauthorized,
     500 Internal Server Error.

2. **Crear el script ORDS** `db/ORDS_<TABLA>.sql`.
   - **IMPORTANTE:** ORDS rechaza `OPTIONS` en `DEFINE_HANDLER` directo
     (restricción `ORDS_HANDLERS_MD_CK`). Solución: el handler GET de cada plantilla
     lleva en su `p_source` un bloque PL/SQL que **borra y recrea** todos los handlers
     de esa plantilla (incluido OPTIONS) con `DEFINE_HANDLER` anidado. Ese bloque sí
     puede crear OPTIONS porque se ejecuta dentro de PL/SQL, no por el check de ORDS.
   - Comillas: el `p_source` exterior usa `''` (dobles) y el interior `''''` (cuádruples).
     Partir palabras conflictivas con `'' || ''` cuando ORDS confunde el cierre
     (ver `p_method` y `lubrimec` en los archivos de referencia).
   - Dos plantillas: `<tabla>` (colección: GET listar, POST, OPTIONS) y
     `<tabla>/:id` (item: GET obtener, PUT, DELETE, OPTIONS).

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

## Archivos de referencia (tabla `marcas`)

- `db/PKG_MARCAS_LUBRIMEC.sql` — paquete CRUD modelo.
- `db/ORDS_MARCAS.sql` — script ORDS modelo (incluye el truco OPTIONS anidado).
- `src/lib/api.ts` (sección `Marcas`) — cliente frontend modelo.

## Notas / gotchas

- `cod_empresa` **no** viene en la sesión (`Sesion` solo trae token/usuario/app_user/app_id).
  Pasarlo explícito a `listar*`. Si se necesita global, agregarlo a `Sesion` en el login.
- Los binds de body en POST/PUT (`:descripcion`, etc.) ORDS los mapea automático
  desde el JSON del request. Los de ruta (`:id`) desde la URL; los de query desde `?`.
- `TO_NUMBER(:param)` para binds numéricos que llegan como texto (query/body).
- El proxy reenvía solo `authorization` + `content-type`; no propaga otros headers.
