--------------------------------------------------------------------------------
-- CARGA DE ARTICULOS — endpoint ORDS que dispara los jobs de carga (sin paquete).
--
-- Replica el bloque anonimo que se corria a mano en la BD:
--
--   BEGIN
--      DBMS_SCHEDULER.RUN_JOB('JOB_CARGA_REPUESTOS',         use_current_session => TRUE);
--      DBMS_SCHEDULER.RUN_JOB('JOB_INSERT_LUBRICANTES',      use_current_session => TRUE);
--      DBMS_SCHEDULER.RUN_JOB('JOB_ARTICULOS_MAS_VENDIDOS',  use_current_session => TRUE);
--   END;
--
--   POST /ords/josegalvez/lubrimec/cargar-articulos
--       -> { success, message, data: [{ job, ok, error?, segundos }] }
--
-- Notas:
-- * `use_current_session => TRUE` corre el job en ESTA sesion: el POST es
--   SINCRONO y no responde hasta que los tres jobs terminan. Es lo pedido (asi
--   el usuario ve el resultado), pero si algun job crece mucho puede chocar con
--   el timeout de ORDS / del proxy. El front avisa que puede tardar.
-- * Cada job va en su propio BEGIN/EXCEPTION: si uno falla, los siguientes
--   igual corren y la respuesta dice cual fallo y por que (el bloque anonimo
--   original abortaba en el primer error).
-- * Solo JOSEG puede dispararlo (mismo criterio de admin que conteo-efectivo /
--   existencia-articulos): es un proceso de carga masiva.
-- * NO lleva COMMIT/ROLLBACK propio: cada job maneja su transaccion.
--
-- Ejecutar como JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC y privilegio para
-- ejecutar los jobs (son del propio esquema JOSEGALVEZ).
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'cargar-articulos', 'POST'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'cargar-articulos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'cargar-articulos',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token    VARCHAR2(256); l_usuario VARCHAR2(255); l_pos PLS_INTEGER;
    l_query    VARCHAR2(4000); l_app_user VARCHAR2(255);
    l_fallas   PLS_INTEGER := 0;
    l_ini      TIMESTAMP;
    l_err      VARCHAR2(1000);
    TYPE t_jobs IS TABLE OF VARCHAR2(128);
    l_jobs     t_jobs := t_jobs('JOB_CARGA_REPUESTOS',
                                'JOB_INSERT_LUBRICANTES',
                                'JOB_ARTICULOS_MAS_VENDIDOS');
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
    HTP.P('Access-Control-Allow-Methods: POST, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(l_token);
    IF l_usuario IS NULL THEN
        OWA_UTIL.STATUS_LINE(401, 'Unauthorized', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado'); APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    -- Solo admin: es una carga masiva que reescribe articulos.
    l_query    := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_app_user := get_qs(l_query, 'app_user');
    IF UPPER(NVL(l_app_user, '-')) != 'JOSEG' THEN
        OWA_UTIL.STATUS_LINE(403, 'Forbidden', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Solo el usuario administrador puede ejecutar la carga');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.OPEN_ARRAY('data');
    FOR i IN 1 .. l_jobs.COUNT LOOP
        l_ini := SYSTIMESTAMP;
        l_err := NULL;
        BEGIN
            DBMS_SCHEDULER.RUN_JOB(l_jobs(i), use_current_session => TRUE);
        EXCEPTION
            WHEN OTHERS THEN
                l_err    := SUBSTR(SQLERRM, 1, 1000);
                l_fallas := l_fallas + 1;
        END;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('job', l_jobs(i));
        APEX_JSON.WRITE('ok', l_err IS NULL);
        IF l_err IS NOT NULL THEN
            APEX_JSON.WRITE('error', l_err);
        END IF;
        APEX_JSON.WRITE('segundos',
            ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - l_ini))
                + EXTRACT(MINUTE FROM (SYSTIMESTAMP - l_ini)) * 60
                + EXTRACT(HOUR   FROM (SYSTIMESTAMP - l_ini)) * 3600, 1));
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.WRITE('success', l_fallas = 0);
    APEX_JSON.WRITE('message',
        CASE WHEN l_fallas = 0
             THEN 'Carga de articulos finalizada correctamente'
             ELSE 'La carga termino con ' || l_fallas || ' proceso(s) con error'
        END);
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM); APEX_JSON.CLOSE_OBJECT;
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'cargar-articulos', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
