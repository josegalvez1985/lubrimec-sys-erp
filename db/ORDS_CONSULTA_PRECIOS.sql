--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Consulta de Precios (pagina APEX 61).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Busca un articulo por su CODIGO DE BARRA y devuelve su ficha (precio de venta,
-- existencia, marca, rubro, viscosidad). Pensado para pistola lectora en
-- mostrador: se manda el codigo de barra, se resuelve el id_articulo y se
-- arma la tarjeta.
--
--   GET /ords/josegalvez/lubrimec/consulta-precios?cod_empresa=24&cod_barra=XXXX
--       -> { success, data: { id_articulo, descripcion, marca, rubro,
--                             viscosidad, precio_venta, existencia, tiene_imagen } }
--          data = NULL si el codigo no existe o el articulo no esta activo.
--
-- Filtros del articulo (pagina 61): estado='A' y es_activo='N'.
-- Precio: PKG_VENTAS.fn_precio_venta. Existencia: pkg_stock.fn_existencia.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'consulta-precios', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'consulta-precios',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'consulta-precios',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_cod_barra   VARCHAR2(200);
    l_id_articulo NUMBER;
    l_encontrado  BOOLEAN := FALSE;

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
    l_cod_barra   := get_qs(l_query, 'cod_barra');
    IF l_cod_empresa IS NULL THEN l_cod_empresa := '24'; END IF;

    -- Resolver id_articulo desde el codigo de barra.
    IF l_cod_barra IS NOT NULL THEN
        BEGIN
            SELECT id_articulo INTO l_id_articulo
              FROM codigos_barras
             WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
               AND cod_barra = l_cod_barra
               AND ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN l_id_articulo := NULL; END;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);

    IF l_id_articulo IS NOT NULL THEN
        FOR r IN (
            SELECT a.id_articulo, a.descripcion,
                   m.descripcion AS marca,
                   ru.descripcion AS rubro,
                   v.descripcion AS viscosidad,
                   PKG_VENTAS.FN_PRECIO_VENTA(a.cod_empresa, a.id_articulo) AS precio_venta,
                   NVL(PKG_STOCK.FN_EXISTENCIA(a.id_articulo, a.cod_empresa), 0) AS existencia,
                   CASE WHEN a.archivo_imagen IS NOT NULL
                         AND DBMS_LOB.GETLENGTH(a.archivo_imagen) > 0 THEN 1 ELSE 0 END AS tiene_imagen
              FROM articulos a
              LEFT JOIN marcas m ON m.cod_empresa = a.cod_empresa AND m.id_marca = a.id_marca
              LEFT JOIN rubros ru ON ru.cod_empresa = a.cod_empresa AND ru.id_rubro = a.id_rubro
              LEFT JOIN viscosidad_lubricantes v ON v.id_viscosidad = a.id_viscosidad
             WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND a.id_articulo = l_id_articulo
               AND NVL(a.estado, 'I') = 'A'
               AND NVL(a.es_activo, 'N') = 'N'
        ) LOOP
            l_encontrado := TRUE;
            APEX_JSON.OPEN_OBJECT('data');
            APEX_JSON.WRITE('id_articulo', r.id_articulo);
            APEX_JSON.WRITE('descripcion', r.descripcion);
            APEX_JSON.WRITE('marca', r.marca);
            APEX_JSON.WRITE('rubro', r.rubro);
            APEX_JSON.WRITE('viscosidad', r.viscosidad);
            APEX_JSON.WRITE('precio_venta', r.precio_venta);
            APEX_JSON.WRITE('existencia', r.existencia);
            APEX_JSON.WRITE('tiene_imagen', r.tiene_imagen);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
    END IF;

    IF NOT l_encontrado THEN
        -- 'data' NULL: variable tipada (WRITE_NULL no existe en todas las versiones).
        DECLARE l_nulo VARCHAR2(1) := NULL;
        BEGIN APEX_JSON.WRITE('data', l_nulo); END;
    END IF;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM); APEX_JSON.CLOSE_OBJECT;
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'consulta-precios', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
