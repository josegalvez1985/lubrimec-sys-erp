--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Ficha de Articulos (pagina APEX 56).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Reporte con busqueda facetada: el backend devuelve TODO el dataset de la
-- vista V_FICHA_EXISTENCIA y el filtrado (busqueda + facetas Desc Articulo/
-- Rubro/Activo/Fecha/Tipo) se hace 100% en el front (como pag 55/102).
--
--   GET /ords/josegalvez/lubrimec/ficha/existencia?cod_empresa=24
--       -> data: [{ cod_empresa, fec_comprobante, id_articulo, desc_articulo,
--                   cantidad, tipo, fecha, nro_comprobante, desc_rubro,
--                   codigo_oem, es_activo }]
--
-- Fuente: vista V_FICHA_EXISTENCIA, WHERE cod_empresa = :n (igual que el IR
-- de la pagina 56). La imagen del articulo se reusa del endpoint existente.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ficha/existencia', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'ficha/existencia',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'ficha/existencia',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);

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
    IF l_cod_empresa IS NULL THEN l_cod_empresa := '24'; END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT cod_empresa,
               TO_CHAR(fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               id_articulo, desc_articulo, cantidad, tipo, fecha,
               nro_comprobante, desc_rubro, codigo_oem, es_activo
          FROM v_ficha_existencia
         WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
         ORDER BY fec_comprobante DESC, id_articulo
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('desc_articulo', r.desc_articulo);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('tipo', r.tipo);
        APEX_JSON.WRITE('fecha', r.fecha);
        APEX_JSON.WRITE('nro_comprobante', r.nro_comprobante);
        APEX_JSON.WRITE('desc_rubro', r.desc_rubro);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('es_activo', r.es_activo);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ficha/existencia', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
