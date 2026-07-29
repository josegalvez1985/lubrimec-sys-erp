# Guía portable: login con Oracle APEX/ORDS + React

Cómo replicar el login de Lubrimesys en **otro proyecto** con la misma temática (backend Oracle
APEX/ORDS + frontend React/TanStack). Está escrita para copiar y renombrar: donde diga `<APP>`
(ej. `TALLERSYS`), `<esquema>` (ej. `josegalvez`) y `<modulo>` (ej. `tallersys`), poné lo tuyo.

> **Nota:** el script ORDS del endpoint `auth/login` **no está versionado** en este repo (se creó a
> mano en ORDS; solo el paquete está en `db/PKG_AUTH_LUBRIMEC.sql`). El de la sección 1.3 está
> reconstruido siguiendo el patrón plano que usa el resto del proyecto (`db/marcas_sql.sql`).

## Cómo funciona (resumen)

```
Login form (React)
  → login(usuario, password)  [src/lib/api.ts]
  → POST /api/ords/auth/login            (mismo origen → sin CORS)
  → proxy server-side [src/routes/api/ords.$.ts]
  → POST https://oracleapex.com/ords/<esquema>/<modulo>/auth/login
  → handler ORDS plano → PKG_AUTH_<APP>.LOGIN
      → APEX_UTIL.IS_LOGIN_PASSWORD_VALID (valida contra los usuarios del workspace APEX)
      → genera token, lo guarda en <APP>_TOKENS (6 h), responde { success, data: { token, ... } }
  → el front guarda la sesión en localStorage / sessionStorage
  → cada llamada protegida manda Authorization: Bearer <token>
  → cada handler ORDS mapea ese header al bind :authorization y el paquete lo valida
    con PKG_AUTH_<APP>.VALIDAR_TOKEN → devuelve el usuario o NULL (401)
```

Decisiones de fondo, para no re-discutirlas:

- **Token opaco en tabla**, no JWT: `RAWTOHEX(SYS_GUID())` x2, guardado en `<APP>_TOKENS` con fecha
  de expiración. Simple, revocable (logout = `ACTIVO='N'`) y sin librerías.
- **Un solo token activo por usuario:** el login desactiva los anteriores antes de insertar.
- **Las credenciales las valida APEX**, no una tabla propia: los usuarios son los del workspace
  APEX. Si el proyecto nuevo tiene su propia tabla de usuarios, lo único que cambia es
  `credenciales_validas` (ver 1.2).
- **El front nunca llama a ORDS directo** cuando hay servidor Node: siempre `/api/ords/`.

---

# 1) Backend (Oracle)

## 1.1 DDL de la tabla de tokens

```sql
CREATE TABLE <APP>_TOKENS (
    TOKEN             VARCHAR2(128) NOT NULL,
    USUARIO           VARCHAR2(255) NOT NULL,
    FECHA_CREACION    TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    FECHA_EXPIRACION  TIMESTAMP     NOT NULL,
    ACTIVO            CHAR(1)       DEFAULT 'S' NOT NULL,
    CONSTRAINT PK_<APP>_TOKENS PRIMARY KEY (TOKEN),
    CONSTRAINT CK_<APP>_TOKENS_ACT CHECK (ACTIVO IN ('S','N'))
);

-- Índice del camino caliente: VALIDAR_TOKEN corre en CADA request protegido.
CREATE INDEX IX_<APP>_TOKENS_ACT ON <APP>_TOKENS (TOKEN, ACTIVO, FECHA_EXPIRACION);
CREATE INDEX IX_<APP>_TOKENS_USR ON <APP>_TOKENS (USUARIO, ACTIVO);
```

Opcional pero recomendado — purga de tokens viejos (la tabla crece con cada login):

```sql
BEGIN
  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'JOB_PURGAR_<APP>_TOKENS',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN DELETE FROM <APP>_TOKENS WHERE FECHA_EXPIRACION < SYSTIMESTAMP - 7; COMMIT; END;',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=DAILY;BYHOUR=3',
    enabled         => TRUE);
END;
/
```

## 1.2 Paquete `PKG_AUTH_<APP>`

Spec + body en un archivo `db/PKG_AUTH_<APP>.sql`. Es el original del proyecto con los nombres
parametrizados y la spec explícita (en este repo la spec no está versionada, solo el body).

```sql
--------------------------------------------------------------------------------
-- Autenticacion: login (genera token Bearer), logout y validacion de token.
-- Tabla <APP>_TOKENS: TOKEN, USUARIO, FECHA_CREACION, FECHA_EXPIRACION, ACTIVO.
-- Vencimiento del token: 6 horas (l_exp en LOGIN).
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_AUTH_<APP> AS

  -- Valida credenciales y, si son correctas, emite un token nuevo.
  -- Escribe la respuesta JSON directamente (lo llama el handler ORDS).
  PROCEDURE login(p_usuario IN VARCHAR2, p_password IN VARCHAR2);

  -- Desactiva el token (cierre de sesion explicito).
  PROCEDURE logout(p_token IN VARCHAR2);

  -- Devuelve el usuario dueño del token, o NULL si es invalido/expirado.
  -- La usan TODOS los paquetes de negocio para autorizar.
  FUNCTION validar_token(p_token IN VARCHAR2) RETURN VARCHAR2;

END PKG_AUTH_<APP>;
/

CREATE OR REPLACE PACKAGE BODY PKG_AUTH_<APP> AS

FUNCTION generar_token(p_usuario IN VARCHAR2) RETURN VARCHAR2 IS
BEGIN
    RETURN UPPER(RAWTOHEX(SYS_GUID()) || RAWTOHEX(SYS_GUID()));
END generar_token;

-- Valida contra los usuarios del workspace APEX.
-- Si el proyecto nuevo tiene su propia tabla de usuarios, ESTA es la unica
-- funcion a cambiar (comparar hash propio, LDAP, etc.).
FUNCTION credenciales_validas(
    p_usuario  IN VARCHAR2,
    p_password IN VARCHAR2
) RETURN BOOLEAN IS
    l_security_group_id NUMBER;
BEGIN
    l_security_group_id := APEX_UTIL.FIND_SECURITY_GROUP_ID(p_workspace => '<workspace>');
    APEX_UTIL.SET_SECURITY_GROUP_ID(p_security_group_id => l_security_group_id);
    RETURN APEX_UTIL.IS_LOGIN_PASSWORD_VALID(
        p_username => UPPER(p_usuario),
        p_password => p_password);
END credenciales_validas;

PROCEDURE login(p_usuario IN VARCHAR2, p_password IN VARCHAR2) IS
    l_token VARCHAR2(128);
    l_exp   TIMESTAMP;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    -- Solo si el front va a llamar a ORDS SIN proxy (ej. GitHub Pages estatico):
    -- HTP.P('Access-Control-Allow-Origin: *');
    -- HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    IF p_usuario IS NULL OR p_password IS NULL THEN
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Usuario y contrasena son obligatorios');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    IF credenciales_validas(p_usuario, p_password) THEN
        l_token := generar_token(p_usuario);
        l_exp   := SYSTIMESTAMP + NUMTODSINTERVAL(6 * 60 * 60, 'SECOND');  -- 6 horas

        -- Un solo token activo por usuario: desactiva los anteriores.
        UPDATE <APP>_TOKENS SET ACTIVO = 'N'
         WHERE USUARIO = UPPER(p_usuario) AND ACTIVO = 'S';

        INSERT INTO <APP>_TOKENS (TOKEN, USUARIO, FECHA_CREACION, FECHA_EXPIRACION, ACTIVO)
        VALUES (l_token, UPPER(p_usuario), SYSTIMESTAMP, l_exp, 'S');
        COMMIT;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('message', 'Autenticacion exitosa');
        APEX_JSON.OPEN_OBJECT('data');
        APEX_JSON.WRITE('token',   l_token);
        APEX_JSON.WRITE('usuario', UPPER(p_usuario));
        APEX_JSON.WRITE('expira',  TO_CHAR(l_exp, 'YYYY-MM-DD"T"HH24:MI:SS'));
        -- Si el front necesita mas datos de sesion (app_user, app_id, cod_empresa,
        -- rol), escribirlos ACA (ver "Extender la sesion" mas abajo).
        APEX_JSON.CLOSE_OBJECT;
        APEX_JSON.CLOSE_OBJECT;
    ELSE
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Usuario o contrasena incorrectos');
        APEX_JSON.CLOSE_OBJECT;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END login;

PROCEDURE logout(p_token IN VARCHAR2) IS
    l_filas NUMBER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    OWA_UTIL.HTTP_HEADER_CLOSE;
    UPDATE <APP>_TOKENS SET ACTIVO = 'N'
     WHERE TOKEN = UPPER(p_token) AND ACTIVO = 'S';
    l_filas := SQL%ROWCOUNT;
    COMMIT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', l_filas > 0);
    APEX_JSON.WRITE('message',
        CASE WHEN l_filas > 0 THEN 'Sesion cerrada'
             ELSE 'Token no encontrado o ya inactivo' END);
    APEX_JSON.CLOSE_OBJECT;
END logout;

FUNCTION validar_token(p_token IN VARCHAR2) RETURN VARCHAR2 IS
    l_usuario VARCHAR2(255);
BEGIN
    SELECT USUARIO INTO l_usuario
      FROM <APP>_TOKENS
     WHERE TOKEN = UPPER(p_token)
       AND ACTIVO = 'S'
       AND FECHA_EXPIRACION > SYSTIMESTAMP;
    RETURN l_usuario;
EXCEPTION
    WHEN NO_DATA_FOUND THEN RETURN NULL;
END validar_token;

END PKG_AUTH_<APP>;
/
```

**Puntos que importan:**

- `UPPER()` en usuario y token en todos lados. El token se guarda y se compara en mayúsculas; si en
  el front lo mandás tal cual (hex ya en mayúsculas) no hay problema, pero no cambies el criterio.
- El paquete **emite sus propios headers HTTP** (`MIME_HEADER` + `HTTP_HEADER_CLOSE`). Por eso el
  handler ORDS del login **no debe emitirlos otra vez** (ver 1.3): headers duplicados = respuesta
  corrupta.
- Credenciales inválidas responden **HTTP 200** con `success: false`, no 401. Es intencional (el
  header ya se abrió y `STATUS_LINE` deja de tener efecto). El front decide por `success`.
- El `COMMIT` va dentro del `IF`, y el `EXCEPTION` hace `ROLLBACK`.

## 1.3 Endpoints ORDS (`auth/login`, `auth/logout`)

Archivo `db/auth_sql.sql`. Estructura **plana**: la lógica va directo en el `p_source` del handler.
Nunca el patrón anidado de "un GET que se redefine a sí mismo" (provoca HTTP 500).

Si el módulo todavía no existe, primero:

```sql
BEGIN
  ORDS.ENABLE_SCHEMA(
      p_enabled             => TRUE,
      p_schema              => '<ESQUEMA>',
      p_url_mapping_type    => 'BASE_PATH',
      p_url_mapping_pattern => '<esquema>',
      p_auto_rest_auth      => FALSE);

  ORDS.DEFINE_MODULE(
      p_module_name    => '<modulo>',
      p_base_path      => '/<modulo>/',
      p_items_per_page => 0,
      p_status         => 'PUBLISHED');
  COMMIT;
END;
/
```

Los endpoints:

```sql
--------------------------------------------------------------------------------
-- AUTH — endpoints ORDS (publicos: no llevan DEFINE_PARAMETER de Authorization
-- salvo logout, que si necesita el token).
--
--   POST /<modulo>/auth/login   { usuario, password }  -> { success, data:{token,...} }
--   POST /<modulo>/auth/logout                          -> desactiva el token
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('<modulo>', 'auth/login',  'POST'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('<modulo>', 'auth/logout', 'POST'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- /auth/login
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => '<modulo>',
        p_pattern     => 'auth/login',
        p_priority    => 0,
        p_etag_type   => 'NONE');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- :usuario y :password los auto-bindea ORDS desde el JSON PLANO del body.
  -- OJO: el paquete ya emite MIME_HEADER/HTTP_HEADER_CLOSE — no emitirlos aca.
  ORDS.DEFINE_HANDLER(
      p_module_name => '<modulo>',
      p_pattern     => 'auth/login',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
BEGIN
    PKG_AUTH_<APP>.LOGIN(
        p_usuario  => :usuario,
        p_password => :password);
END;
~');

  ----------------------------------------------------------------------------
  -- /auth/logout  (lee el token del header Authorization)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => '<modulo>',
        p_pattern     => 'auth/logout',
        p_priority    => 0,
        p_etag_type   => 'NONE');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => '<modulo>',
      p_pattern     => 'auth/logout',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;
    PKG_AUTH_<APP>.LOGOUT(p_token => l_token);
END;
~');

  -- OBLIGATORIO: sin esto :authorization llega NULL.
  ORDS.DEFINE_PARAMETER(
      p_module_name        => '<modulo>',
      p_pattern            => 'auth/logout',
      p_method             => 'POST',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  COMMIT;
END;
/
```

## 1.4 Consumir el token en cada endpoint de negocio

Este es el contrato que hace que el login sirva de algo. **En cada handler protegido:**

1. Leer `:authorization`, quitarle el prefijo `Bearer `, pasar el token al paquete.
2. Declarar el `ORDS.DEFINE_PARAMETER` del header (**una vez por handler**, no por template).

```sql
  ORDS.DEFINE_HANDLER(
      p_module_name => '<modulo>',
      p_pattern     => 'marcas',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    PKG_MARCAS_<APP>.LISTAR(p_token => l_token, p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => '<modulo>',
      p_pattern            => 'marcas',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');
```

Y en **cada paquete de negocio**, los dos helpers privados (copiar tal cual):

```sql
  PROCEDURE p_error(p_status IN NUMBER, p_reason IN VARCHAR2, p_message IN VARCHAR2) IS
  BEGIN
    OWA_UTIL.STATUS_LINE(p_status, p_reason, FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', FALSE);
    APEX_JSON.WRITE('message', p_message);
    APEX_JSON.CLOSE_OBJECT;
  END p_error;

  FUNCTION f_usuario(p_token IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN PKG_AUTH_<APP>.VALIDAR_TOKEN(p_token);
  END f_usuario;
```

Primeras líneas de **todo** procedimiento protegido:

```sql
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;
```

> El `STATUS_LINE(401)` a veces no llega al cliente porque el handler ya abrió la respuesta (status
> 200 con `success:false`). Por eso el front detecta la expiración **también por el mensaje**
> (ver `esTokenInvalido` en 2.3). No quites esa red de seguridad.

---

# 2) Frontend (React / TanStack Start)

## 2.1 Proxy server-side — `src/routes/api/ords.$.ts`

Evita el CORS del navegador y mantiene el token fuera de la URL. Copiar tal cual, cambiando
`ORDS_PREFIX`:

```ts
import { createFileRoute } from "@tanstack/react-router";

const ORDS_TARGET = process.env.ORDS_TARGET ?? "https://oracleapex.com";
const ORDS_PREFIX = "/ords/<esquema>/<modulo>/";

async function forward(request: Request, splat: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${ORDS_TARGET}${ORDS_PREFIX}${splat}${incoming.search}`;

  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  headers.set("accept", "application/json");
  headers.set("user-agent", "Mozilla/5.0 (<app>-proxy)");

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    // arrayBuffer y no text(): text() corrompe binarios (uploads de fotos).
    const body = await request.arrayBuffer();
    // Solo mandar body+content-type si hay payload: un DELETE con content-type
    // JSON y cuerpo vacio hace que ORDS responda 400 ("Expected {,[ but got EOF").
    if (body.byteLength > 0) {
      init.body = body;
      headers.set("content-type", request.headers.get("content-type") ?? "application/json");
    }
  }

  const res = await fetch(target, init);
  const contentType = res.headers.get("content-type") ?? "application/json";
  const body = await res.arrayBuffer();
  const outHeaders: Record<string, string> = { "content-type": contentType };
  const cacheControl = res.headers.get("cache-control");
  if (cacheControl) outHeaders["cache-control"] = cacheControl;
  return new Response(body, { status: res.status, headers: outHeaders });
}

export const Route = createFileRoute("/api/ords/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => forward(request, params._splat ?? ""),
      POST: ({ request, params }) => forward(request, params._splat ?? ""),
      PUT: ({ request, params }) => forward(request, params._splat ?? ""),
      DELETE: ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
```

**Declarar los 4 verbos.** Si falta uno, ese método cae al SPA / 404 y falla "en silencio".

## 2.2 Variables de entorno

`.env` (dev) y el entorno de producción con servidor Node:

```
VITE_API_URL=/api/ords/
ORDS_TARGET=https://oracleapex.com
```

Si el deploy es **estático** (GitHub Pages, sin servidor Node) no existe el proxy: ahí
`VITE_API_URL` debe apuntar directo a ORDS (`https://oracleapex.com/ords/<esquema>/<modulo>/`) y el
backend **tiene que** emitir los headers CORS (incluido en `auth/login`, ver el comentario en 1.2).

## 2.3 Cliente — `src/lib/api.ts`

Núcleo de sesión + fetch. Todo esto es copiable tal cual:

```ts
const BASE = import.meta.env.VITE_API_URL ?? "";

function url(path: string) {
  return `${BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export type Sesion = {
  token: string;
  usuario: string;
  app_user: string;
  app_id: string;
};

export function getSesion(): Sesion | null {
  if (typeof window === "undefined") return null; // SSR: no hay storage
  const raw = localStorage.getItem("sesion") ?? sessionStorage.getItem("sesion");
  return raw ? (JSON.parse(raw) as Sesion) : null;
}

// "Recordar" = localStorage (sobrevive al cierre del navegador).
// Sin recordar = sessionStorage (muere con la pestaña). Nunca los dos a la vez.
function guardarSesion(s: Sesion, recordar: boolean) {
  const store = recordar ? localStorage : sessionStorage;
  const otro = recordar ? sessionStorage : localStorage;
  otro.removeItem("sesion");
  store.setItem("sesion", JSON.stringify(s));
}

export function cerrarSesion() {
  localStorage.removeItem("sesion");
  sessionStorage.removeItem("sesion");
}

function handleUnauthorized() {
  cerrarSesion();
  if (typeof window !== "undefined") {
    window.location.href = import.meta.env.BASE_URL || "/";
  }
}

// Detecta el rechazo de token aun cuando el status HTTP no llego como 401:
// algunos handlers ORDS ya abrieron la respuesta y el STATUS_LINE queda en 200.
function esTokenInvalido(res: Response, data: { success?: boolean; message?: string }) {
  return (
    res.status === 401 ||
    (data?.success === false &&
      typeof data?.message === "string" &&
      /token\s+invalido|token\s+inválido/i.test(data.message))
  );
}

export async function login(usuario: string, password: string, recordar = false): Promise<Sesion> {
  const res = await fetch(url("auth/login"), {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, password }),
  });
  const json = await res.json().catch(() => ({}));
  // El back puede responder plano { success, token } o envuelto { data: {...} }.
  const data = json?.data ?? json;
  if (!res.ok || json?.success === false || !data?.token) {
    throw new Error(json?.message ?? "Usuario o contraseña incorrectos");
  }
  const sesion: Sesion = {
    token: data.token,
    usuario: data.usuario ?? usuario,
    app_user: String(data.app_user ?? usuario).toUpperCase(), // los permisos van en MAYUSCULAS
    app_id: String(data.app_id ?? import.meta.env.VITE_APP_ID ?? ""),
  };
  guardarSesion(sesion, recordar);
  return sesion;
}

export async function logout(): Promise<void> {
  const s = getSesion();
  if (s) {
    // Best-effort: si el server no responde igual limpiamos la sesion local.
    await fetch(url("auth/logout"), {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${s.token}` },
    }).catch(() => {});
  }
  cerrarSesion();
}

// USAR EN TODA LLAMADA PROTEGIDA. Nunca fetch directo.
export async function authFetch(path: string, init: RequestInit = {}) {
  const s = getSesion();
  if (!s) throw new Error("No hay sesión activa");
  const res = await fetch(url(path), {
    ...init,
    cache: "no-store", // datos multi-sistema: nunca desde cache
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${s.token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (esTokenInvalido(res, data)) {
    handleUnauthorized();
    throw new Error("Sesión expirada");
  }
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message ?? "Operación fallida");
  }
  return data;
}
```

**Detalles no negociables:**

- `getSesion()` chequea `typeof window === "undefined"`: sin eso rompe en SSR.
- El token va **en el header**, nunca en la query string (queda en logs del servidor).
- `esTokenInvalido` corre **antes** del chequeo de `res.ok`, si no la sesión expirada se reporta
  como un error genérico y el usuario queda trabado.
- `authFetch` es el único lugar que sabe del token. Si aparece un `fetch` con `Authorization`
  suelto en un componente, está mal.

## 2.4 Página de login — `src/routes/index.tsx`

Lo mínimo funcional (el resto de la página del proyecto es decorado):

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { login } from "@/lib/api";

export const Route = createFileRoute("/")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usuario, password, recordar);
      navigate({ to: "/home" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {/* usuario, password (con ojo mostrar/ocultar), checkbox "Mantener sesión iniciada" */}
      {error && <p className="text-destructive">{error}</p>}
      <button type="submit" disabled={loading}>{loading ? "Iniciando..." : "Iniciar sesión"}</button>
    </form>
  );
}
```

Del original conviene conservar: `type={showPwd ? "text" : "password"}` con botón de ojo,
`required` en ambos inputs, el checkbox de recordar atado al tercer parámetro de `login()`, y el
`finally { setLoading(false) }` (si no, un error deja el botón deshabilitado para siempre).

## 2.5 Guard de la página protegida — `src/routes/home.tsx`

```tsx
import { getSesion, cerrarSesion } from "@/lib/api";

const sesion = getSesion();
if (!sesion) {
  navigate({ to: "/" });
  return null;
}

function logout() {
  cerrarSesion();       // o await logout() si implementaste el endpoint
  navigate({ to: "/" });
}
```

Es un guard de UX, **no** de seguridad: quien manipule el localStorage ve el cascarón vacío, pero
sin token válido ningún endpoint le devuelve datos. La autorización real vive en el backend.

---

# 3) Probar sin front

```bash
# Login
curl -X POST "https://oracleapex.com/ords/<esquema>/<modulo>/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"usuario":"joseg","password":"xxx"}'
# → {"success":true,"message":"Autenticacion exitosa","data":{"token":"A1B2...","usuario":"JOSEG","expira":"..."}}

# Endpoint protegido
curl "https://oracleapex.com/ords/<esquema>/<modulo>/marcas?cod_empresa=24" \
  -H "Authorization: Bearer A1B2..."

# Logout
curl -X POST "https://oracleapex.com/ords/<esquema>/<modulo>/auth/logout" \
  -H "Authorization: Bearer A1B2..."
```

Si `curl` directo funciona pero el front no, el problema está en el proxy o en `VITE_API_URL`.

---

# 4) Gotchas (los que costaron tiempo)

| Síntoma | Causa | Fix |
|---|---|---|
| Todo responde `"Token invalido o expirado"` aunque el login dio token | Falta el `ORDS.DEFINE_PARAMETER` del header en ese handler → `:authorization` llega NULL | Agregarlo **por cada handler**, no por template |
| El login responde HTML "Service Unavailable" | Error 500 en el bloque PL/SQL del handler | Revisar el `p_source`; probar el paquete desde SQL Commands |
| `ORA-02290: ORDS_HANDLERS_MD_CK` al crear el handler | Combinación método/`source_type` inválida en `DEFINE_HANDLER` | `p_method` en MAYÚSCULAS; `POST/PUT/DELETE` solo admiten `'plsql/block'`; `items_per_page = 0`; sin `mimes_allowed` salvo upload. Ver la regla exacta con `SELECT search_condition_vc FROM all_constraints WHERE constraint_name='ORDS_HANDLERS_MD_CK'`. El bloque falla antes del `COMMIT` → nada queda a medias, se re-ejecuta |
| Respuesta corrupta / JSON con headers pegados | El handler **y** el paquete emiten `MIME_HEADER` | Emitir los headers en **un solo** lugar (el paquete, para auth) |
| Un método del CRUD "no hace nada" | Falta el verbo en el proxy `ords.$.ts` | Declarar GET/POST/PUT/DELETE |
| 400 `Expected one of <<{,[>> but got EOF` | DELETE/GET con `content-type: application/json` y body vacío | El proxy solo manda body+content-type si hay payload |
| CORS en producción | Deploy estático sin proxy | O servís con Node (proxy) o emitís los headers CORS en ORDS |
| El usuario sigue "logueado" tras expirar el token | Se chequeó `res.ok` antes que el token | `esTokenInvalido` primero, y que dispare `handleUnauthorized()` |
| El login funciona pero los permisos no filtran | `app_user` en minúsculas | Normalizar con `.toUpperCase()` al guardar la sesión |
| Cambié el `.sql` y no pasa nada | Los `.sql` del repo **no se aplican solos** | Ejecutarlos a mano en la BD como el esquema dueño |

---

# 5) Extensiones opcionales

**Extender la sesión (roles, empresa, app_user real).** Hoy `app_user` sale del usuario tipeado y
`cod_empresa` no está en la sesión (se pasa explícito a cada `listar*`). Si el proyecto nuevo lo
necesita global, escribilo en el `data` del `LOGIN` (1.2) y agregalo al tipo `Sesion` (2.3). Es el
único cambio; `authFetch` no se toca.

**Renovar el token.** Hoy son 6 h fijas y al expirar el usuario vuelve al login. Si querés sesión
deslizante, en `VALIDAR_TOKEN` extendé `FECHA_EXPIRACION` cuando quede menos de X (ojo: un UPDATE
por request, medí antes).

**Biometría (solo si hay APK Capacitor).** `capacitor-native-biometric`: se activa desde el perfil
(pide la contraseña, la valida con `login()` y recién ahí guarda las credenciales en el Keystore);
el login solo ofrece el botón si ya está activa. Ver `src/lib/biometric.ts` y `perfil-modal.tsx`.

**Rate limiting.** No hay. Si el endpoint queda expuesto a internet, considerá contar intentos
fallidos por usuario/IP en una tabla y bloquear temporalmente.
