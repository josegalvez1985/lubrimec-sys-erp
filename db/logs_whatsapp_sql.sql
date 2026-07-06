--------------------------------------------------------------------------------
-- LOGS WHATSAPP (pagina APEX 120) — auditoria de envios (SOLO LECTURA).
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- Tabla LOG_WHATSAPP (sin cod_empresa: es global). No hay CRUD de escritura: las
-- filas las insertan los procesos de envio (ver PROC_ENVIAR_MENSAJES_WHATSAPP).
-- Solo un LISTAR con filtros opcionales (patron l_x IS NULL OR ...). El endpoint
-- distinto de whatsapp/logs (ese es el polling del envio en curso).
--
-- === 1) PAQUETE PKG_LOGS_WHATSAPP_LUBRIMEC =================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_LOGS_WHATSAPP_LUBRIMEC AS

  -- Filtros opcionales: numero (LIKE sobre original/limpio), estado exacto,
  -- fecha_desde/fecha_hasta (formato YYYY-MM-DD). Devuelve las ultimas 500 filas.
  PROCEDURE LISTAR(
      p_token IN VARCHAR2, p_numero IN VARCHAR2, p_estado IN VARCHAR2,
      p_fecha_desde IN VARCHAR2, p_fecha_hasta IN VARCHAR2);

END PKG_LOGS_WHATSAPP_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_LOGS_WHATSAPP_LUBRIMEC AS

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
    RETURN PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
  END f_usuario;

  PROCEDURE LISTAR(
      p_token IN VARCHAR2, p_numero IN VARCHAR2, p_estado IN VARCHAR2,
      p_fecha_desde IN VARCHAR2, p_fecha_hasta IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_numero  VARCHAR2(200) := '%' || UPPER(TRIM(p_numero)) || '%';
    l_desde   DATE;
    l_hasta   DATE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      IF TRIM(p_fecha_desde) IS NOT NULL THEN
        l_desde := TO_DATE(p_fecha_desde, 'YYYY-MM-DD');
      END IF;
      IF TRIM(p_fecha_hasta) IS NOT NULL THEN
        l_hasta := TO_DATE(p_fecha_hasta, 'YYYY-MM-DD') + 1; -- hasta fin del dia
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        p_error(400, 'Bad Request', 'Fecha invalida (usar YYYY-MM-DD)');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT id,
               TO_CHAR(fecha, 'DD/MM/YYYY HH24:MI:SS') fecha,
               numero_original, numero_limpio, mensaje, estado,
               http_status, detalle_error
          FROM log_whatsapp
         WHERE (TRIM(p_numero) IS NULL
                OR UPPER(numero_original) LIKE l_numero
                OR UPPER(numero_limpio) LIKE l_numero)
           AND (TRIM(p_estado) IS NULL OR estado = p_estado)
           AND (l_desde IS NULL OR fecha >= l_desde)
           AND (l_hasta IS NULL OR fecha < l_hasta)
         ORDER BY id DESC
         FETCH FIRST 500 ROWS ONLY
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id', r.id);
      APEX_JSON.WRITE('fecha', r.fecha);
      APEX_JSON.WRITE('numero_original', r.numero_original);
      APEX_JSON.WRITE('numero_limpio', r.numero_limpio);
      APEX_JSON.WRITE('mensaje', r.mensaje);
      APEX_JSON.WRITE('estado', r.estado);
      APEX_JSON.WRITE('http_status', r.http_status);
      APEX_JSON.WRITE('detalle_error', r.detalle_error);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

END PKG_LOGS_WHATSAPP_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET /lubrimec/logs-whatsapp?numero=&estado=&fecha_desde=&fecha_hasta=
--       -> auditoria de envios (ultimas 500, filtros opcionales)
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'logs-whatsapp', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'logs-whatsapp',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'logs-whatsapp',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_numero      VARCHAR2(4000); l_estado VARCHAR2(4000);
    l_fdesde      VARCHAR2(4000); l_fhasta VARCHAR2(4000);
    FUNCTION get_qs(p_qs IN VARCHAR2, p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_p PLS_INTEGER; l_e PLS_INTEGER; l_v VARCHAR2(4000);
    BEGIN
        l_p := INSTR('&' || p_qs, '&' || p_key || '=');
        IF l_p = 0 THEN RETURN NULL; END IF;
        l_p := l_p + LENGTH(p_key) + 1;
        l_e := INSTR(p_qs || '&', '&', l_p);
        l_v := SUBSTR(p_qs, l_p, l_e - l_p);
        l_v := REPLACE(l_v, '+', ' ');
        RETURN UTL_URL.UNESCAPE(l_v);
    END;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_query  := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_numero := get_qs(l_query, 'numero');
    l_estado := get_qs(l_query, 'estado');
    l_fdesde := get_qs(l_query, 'fecha_desde');
    l_fhasta := get_qs(l_query, 'fecha_hasta');
    PKG_LOGS_WHATSAPP_LUBRIMEC.LISTAR(
        p_token => l_token, p_numero => l_numero, p_estado => l_estado,
        p_fecha_desde => l_fdesde, p_fecha_hasta => l_fhasta);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'logs-whatsapp',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
