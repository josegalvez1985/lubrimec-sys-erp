--------------------------------------------------------------------------------
-- SORTEAR (pagina APEX 108) — paquete + endpoint ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- Devuelve los telefonos de VENTAS_CABECERA entre dos fechas (replica el
-- proceso AJAX GET_TELEFONOS_JSON): sin DISTINCT (mas ventas = mas chances) y
-- sin filtro de cod_empresa, tal cual el APEX. El sorteo (animacion, ganador,
-- enmascarado ****9999) es 100% en el front.
--
-- Rutas:
--   GET /lubrimec/sorteo/telefonos?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
--
-- === 1) PAQUETE PKG_SORTEO_LUBRIMEC ========================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_SORTEO_LUBRIMEC AS

  PROCEDURE TELEFONOS(
      p_token       IN VARCHAR2,
      p_fecha_desde IN VARCHAR2,   -- YYYY-MM-DD
      p_fecha_hasta IN VARCHAR2);  -- YYYY-MM-DD

END PKG_SORTEO_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_SORTEO_LUBRIMEC AS

  PROCEDURE p_error(p_status IN NUMBER, p_reason IN VARCHAR2, p_message IN VARCHAR2) IS
  BEGIN
    OWA_UTIL.STATUS_LINE(p_status, p_reason, FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', FALSE);
    APEX_JSON.WRITE('message', p_message);
    APEX_JSON.CLOSE_OBJECT;
  END p_error;

  PROCEDURE TELEFONOS(
      p_token       IN VARCHAR2,
      p_fecha_desde IN VARCHAR2,
      p_fecha_hasta IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_desde   DATE;
    l_hasta   DATE;
  BEGIN
    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL THEN
      p_error(400, 'Bad Request', 'fecha_desde y fecha_hasta son obligatorias');
      RETURN;
    END IF;

    l_desde := TO_DATE(p_fecha_desde, 'YYYY-MM-DD');
    l_hasta := TO_DATE(p_fecha_hasta, 'YYYY-MM-DD');

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    -- Tal cual el APEX: BETWEEN directo (sin trunc), sin DISTINCT y sin
    -- cod_empresa. Cada venta con telefono es una participacion.
    FOR r IN (
        SELECT nro_telefono
          FROM ventas_cabecera
         WHERE fec_comprobante BETWEEN l_desde AND l_hasta
           AND nro_telefono IS NOT NULL
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('nro_telefono', r.nro_telefono);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END TELEFONOS;

END PKG_SORTEO_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINT ORDS ======================================================
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'sorteo/telefonos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'sorteo/telefonos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'sorteo/telefonos',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);
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

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_SORTEO_LUBRIMEC.TELEFONOS(
        p_token       => l_token,
        p_fecha_desde => get_qs(l_qs, 'fecha_desde'),
        p_fecha_hasta => get_qs(l_qs, 'fecha_hasta'));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'sorteo/telefonos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
