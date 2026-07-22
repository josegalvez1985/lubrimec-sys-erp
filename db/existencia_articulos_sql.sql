--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Existencia de Articulos (pagina APEX 70).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Reporte de existencia agrupada por articulo (SUM de cantidad sobre
-- V_FICHA_EXISTENCIA) + costo. El filtrado (busqueda + facetas Articulo/OEM/
-- Activo) es 100% en el front (como pag 55/56/57).
--
--   GET /ords/josegalvez/lubrimec/existencia?cod_empresa=24&app_user=JOSEG
--       -> data: [{ id_articulo, desc_articulo, cantidad, codigo_oem,
--                   es_activo, costo_ultimo, total_costo }]
--
-- PERMISO POR USUARIO (como conteo-efectivo): costo_ultimo y total_costo solo
-- se devuelven si app_user = 'JOSEG'; para el resto van NULL (el front no los
-- muestra). Replica el fn_verifica_campo del APEX. app_user llega en MAYUSCULAS.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'existencia', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'existencia',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'existencia',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_app_user    VARCHAR2(255);
    l_ve_costo    BOOLEAN;

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
    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(l_token);
    IF l_usuario IS NULL THEN
        OWA_UTIL.STATUS_LINE(401, 'Unauthorized', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado'); APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    l_app_user    := get_qs(l_query, 'app_user');
    IF l_cod_empresa IS NULL THEN l_cod_empresa := '24'; END IF;
    l_ve_costo := (UPPER(NVL(l_app_user, '-')) = 'JOSEG');

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('ve_costo', CASE WHEN l_ve_costo THEN 'S' ELSE 'N' END);
    APEX_JSON.OPEN_ARRAY('data');
    -- Agrupacion en subconsulta y total_costo afuera: evita mezclar la funcion
    -- de grupo (SUM) con la multiplicacion por costo_ultimo (daba ORA-00937).
    FOR r IN (
        SELECT id_articulo, desc_articulo, cantidad, codigo_oem, es_activo,
               costo_ultimo,
               NVL(costo_ultimo, 0) * NVL(cantidad, 0) AS total_costo
          FROM (
            SELECT id_articulo, desc_articulo, codigo_oem, es_activo, costo_ultimo,
                   SUM(cantidad) AS cantidad
              FROM v_ficha_existencia
             WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
             GROUP BY id_articulo, desc_articulo, codigo_oem, es_activo, costo_ultimo
          )
         ORDER BY cantidad ASC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('desc_articulo', r.desc_articulo);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('es_activo', r.es_activo);
        IF l_ve_costo THEN
            APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
            APEX_JSON.WRITE('total_costo', r.total_costo);
        END IF;
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM); APEX_JSON.CLOSE_OBJECT;
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'existencia', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
