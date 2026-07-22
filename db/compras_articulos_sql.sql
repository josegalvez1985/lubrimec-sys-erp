--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Compras por Articulos (pagina APEX 55).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Reporte con busqueda facetada: el backend devuelve TODO el dataset de la
-- vista COMPRAS_ARTICULOS y el filtrado (busqueda + facetas Proveedor/Fecha/
-- Referencia) se hace 100% en el front (como articulos-mas-vendidos / pag 102).
--
--   GET /ords/josegalvez/lubrimec/compras/articulos?cod_empresa=24
--       -> data: [{ id_articulo, descripcion, codigo_oem, id_cod_proveedor,
--                   proveedor, referencia, fec_comprobante, cantidad, precio,
--                   total, id_factura, nro_linea }]
--
-- Fuente: vista COMPRAS_ARTICULOS, WHERE cod_empresa = :n AND tip_comprobante
-- NOT IN ('AJS'), ORDER BY id_factura DESC (igual que el IR de la pagina 55).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras/articulos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras/articulos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'compras/articulos',
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
    -- Solo columnas de la vista COMPRAS_ARTICULOS (mismo SELECT del IR pag 55).
    FOR r IN (
        SELECT ca.id_articulo, ca.descripcion, ca.codigo_oem, ca.id_cod_proveedor,
               ca.proveedor, ca.referencia,
               TO_CHAR(ca.fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               ca.cantidad, ca.precio, ca.total, ca.id_factura, ca.nro_linea
          FROM compras_articulos ca
         WHERE ca.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND ca.tip_comprobante NOT IN ('AJS')
         ORDER BY ca.id_factura DESC, ca.nro_linea
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('id_cod_proveedor', r.id_cod_proveedor);
        APEX_JSON.WRITE('proveedor', r.proveedor);
        APEX_JSON.WRITE('referencia', r.referencia);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('precio', r.precio);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('id_factura', r.id_factura);
        APEX_JSON.WRITE('nro_linea', r.nro_linea);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras/articulos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
