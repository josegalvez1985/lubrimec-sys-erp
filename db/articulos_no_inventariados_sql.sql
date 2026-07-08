--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Articulos no Inventariados (pag APEX 81).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Reporte con busqueda facetada (Codigo OEM, Marca, Rubro, ?Activos?): el backend
-- devuelve todo el dataset y el filtrado es 100% en el front (como pag 55/56/57).
--
--   GET /ords/josegalvez/lubrimec/articulos/no-inventariados?cod_empresa=24
--       -> data: [{ descripcion, codigo_oem, es_activo, marca, rubro }]
--
-- Query de la pagina 81: articulos activos (estado='A'), excluyendo rubros 30 y 39
-- (servicios / suministros), que NO fueron inventariados desde FECHA_INVENTARIO:
-- su fecha_ultimo_inventario es anterior a ese parametro, o no tienen registro en
-- INVENTARIO posterior a el. JOIN a marcas y rubros para los nombres.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/no-inventariados', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'articulos/no-inventariados',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/no-inventariados',
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
        SELECT a.descripcion,
               NVL(a.codigo_oem, TO_CHAR(a.id_articulo)) AS codigo_oem,
               a.es_activo,
               m.descripcion AS marca,
               ru.descripcion AS rubro
          FROM articulos a,
               marcas m,
               rubros ru
         WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND m.cod_empresa = a.cod_empresa
           AND m.id_marca = a.id_marca
           AND ru.cod_empresa = a.cod_empresa
           AND ru.id_rubro = a.id_rubro
           AND a.id_rubro NOT IN (30, 39)
           AND NVL(a.estado, 'A') = 'A'
           AND (NVL(a.fecha_ultimo_inventario, TO_DATE('01/01/2024', 'dd/mm/yyyy'))
                  < TO_DATE(PKG_STOCK.FN_PARAMETRO(a.cod_empresa, 'FECHA_INVENTARIO'), 'dd/mm/yyyy')
                OR a.id_articulo NOT IN (SELECT i.id_articulo
                                           FROM inventario i
                                          WHERE i.cod_empresa = a.cod_empresa
                                            AND i.id_articulo = a.id_articulo
                                            AND i.fecha >= TO_DATE(PKG_STOCK.FN_PARAMETRO(a.cod_empresa, 'FECHA_INVENTARIO'), 'dd/mm/yyyy')))
         ORDER BY a.descripcion
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('es_activo', r.es_activo);
        APEX_JSON.WRITE('marca', r.marca);
        APEX_JSON.WRITE('rubro', r.rubro);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'articulos/no-inventariados', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
