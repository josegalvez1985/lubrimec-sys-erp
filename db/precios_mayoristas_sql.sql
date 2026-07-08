--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Precios Mayoristas (pag APEX 82).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Reporte con busqueda facetada (Marca, Categoria/Rubro, Viscosidad): el backend
-- devuelve todo el dataset y el filtrado + el % de descuento son 100% en el front
-- (en APEX el descuento refrescaba el reporte; aca se calcula en vivo).
--
--   GET /ords/josegalvez/lubrimec/articulos/precios-mayoristas?cod_empresa=24
--       -> data: [{ id_articulo, articulo, marca, rubro, viscosidad,
--                   precio_venta, stock, cantidad_venta }]
--
-- Query de la pagina 82: articulos activos (estado='A'), es_activo='N', con
-- existencia > 0, ordenados por cantidad vendida desc. precio_venta es el precio
-- base SIN descuento (fn_precio_venta); el front aplica precio*(1-desc/100).
-- Funciones costosas (fn_existencia, fn_precio_venta, fn_cantidad_venta_articulo)
-- se evaluan una vez por articulo sobre las filas ya filtradas (CTE).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/precios-mayoristas', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'articulos/precios-mayoristas',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/precios-mayoristas',
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
        WITH base AS (
            SELECT a.cod_empresa, a.id_articulo, a.descripcion,
                   a.id_marca, a.id_rubro, a.id_viscosidad,
                   PKG_STOCK.FN_EXISTENCIA(a.id_articulo, a.cod_empresa) AS stock
              FROM articulos a
             WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND NVL(a.estado, 'I') = 'A'
               AND NVL(a.es_activo, 'N') = 'N'
        )
        SELECT b.id_articulo,
               b.descripcion AS articulo,
               m.descripcion AS marca,
               ru.descripcion AS rubro,
               v.descripcion AS viscosidad,
               PKG_VENTAS.FN_PRECIO_VENTA(b.cod_empresa, b.id_articulo) AS precio_venta,
               b.stock,
               PKG_VENTAS.FN_CANTIDAD_VENTA_ARTICULO(b.cod_empresa, b.id_articulo) AS cantidad_venta
          FROM base b
          LEFT JOIN marcas m ON m.cod_empresa = b.cod_empresa
                             AND m.id_marca = b.id_marca
          LEFT JOIN rubros ru ON ru.cod_empresa = b.cod_empresa
                              AND ru.id_rubro = b.id_rubro
          LEFT JOIN viscosidad_lubricantes v ON v.id_viscosidad = b.id_viscosidad
         WHERE b.stock > 0
         ORDER BY cantidad_venta DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('articulo', r.articulo);
        APEX_JSON.WRITE('marca', r.marca);
        APEX_JSON.WRITE('rubro', r.rubro);
        APEX_JSON.WRITE('viscosidad', r.viscosidad);
        APEX_JSON.WRITE('precio_venta', r.precio_venta);
        APEX_JSON.WRITE('stock', r.stock);
        APEX_JSON.WRITE('cantidad_venta', r.cantidad_venta);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'articulos/precios-mayoristas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
