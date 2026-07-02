--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Articulos Mas Vendidos (pagina APEX 102).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
--
--   GET /ords/josegalvez/lubrimec/articulos/mas-vendidos
--       ?cod_empresa=24          (opcional, default 24)
--       &search=<texto>          (opcional: descripcion/oem/proveedor/marca)
--       &descripcion=<texto>     (opcional: LIKE solo sobre la descripcion)
--       &proveedor=<nombre>      (opcional, igualdad)
--       &rubro=<nombre>          (opcional, igualdad)
--       &viscosidad=<nombre>     (opcional, igualdad)
--       &marca=<nombre>          (opcional, igualdad)
--       &unidad=<cod>            (opcional, igualdad cod_unidad_medida)
--
--   Orden fijo: cantidad_ventas DESC, descripcion ASC (los mas vendidos primero).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/mas-vendidos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'articulos/mas-vendidos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/mas-vendidos',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_search      VARCHAR2(200);
    l_descripcion VARCHAR2(200);
    l_proveedor   VARCHAR2(200);
    l_rubro       VARCHAR2(200);
    l_viscosidad  VARCHAR2(200);
    l_marca       VARCHAR2(200);
    l_unidad      VARCHAR2(50);

    FUNCTION get_qs(p_qs IN VARCHAR2, p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_p PLS_INTEGER;
        l_e PLS_INTEGER;
        l_v VARCHAR2(4000);
    BEGIN
        l_p := INSTR('&' || p_qs, '&' || p_key || '=');
        IF l_p = 0 THEN RETURN NULL; END IF;
        l_p := l_p + LENGTH(p_key) + 1;
        l_e := INSTR(p_qs || '&', '&', l_p);
        l_v := SUBSTR(p_qs, l_p, l_e - l_p);
        l_v := REPLACE(l_v, '+', ' '); -- '+' = espacio (form-encoding), antes de UNESCAPE
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(l_token);
    IF l_usuario IS NULL THEN
        OWA_UTIL.STATUS_LINE(401, 'Unauthorized', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := NVL(get_qs(l_query, 'cod_empresa'), '24');
    l_search      := get_qs(l_query, 'search');
    l_descripcion := get_qs(l_query, 'descripcion');
    l_proveedor   := get_qs(l_query, 'proveedor');
    l_rubro       := get_qs(l_query, 'rubro');
    l_viscosidad  := get_qs(l_query, 'viscosidad');
    l_marca       := get_qs(l_query, 'marca');
    l_unidad      := get_qs(l_query, 'unidad');

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');

    FOR r IN (
        SELECT a.cantidad_ventas,
               a.stock,
               a.descripcion_articulo                          descripcion,
               a.codigo_oem,
               a.costo_ultimo,
               TO_CHAR(a.fecha_ultimo_inventario, 'DD/MM/YYYY') fecha_ultimo_inventario,
               a.nombre_proveedor                              proveedor,
               a.descripcion_rubro                             rubro,
               a.id_articulo,
               a.id_viscosidad,
               a.cod_unidad_medida,
               a.descripcion_marca                             marca,
               a.descripcion_viscosidad                        viscosidad
          FROM articulos_mas_vendidos a
         WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND (l_proveedor   IS NULL OR a.nombre_proveedor = l_proveedor)
           AND (l_rubro       IS NULL OR a.descripcion_rubro = l_rubro)
           AND (l_viscosidad  IS NULL OR a.descripcion_viscosidad = l_viscosidad)
           AND (l_marca       IS NULL OR a.descripcion_marca = l_marca)
           AND (l_unidad      IS NULL OR a.cod_unidad_medida = l_unidad)
           AND (l_descripcion IS NULL OR
                UPPER(a.descripcion_articulo) LIKE '%' || UPPER(l_descripcion) || '%')
           AND (l_search      IS NULL OR
                UPPER(a.descripcion_articulo || ' ' || a.codigo_oem || ' ' ||
                      a.nombre_proveedor || ' ' || a.descripcion_marca)
                LIKE '%' || UPPER(l_search) || '%')
         ORDER BY a.cantidad_ventas DESC, a.descripcion_articulo ASC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('cantidad_ventas', r.cantidad_ventas);
        APEX_JSON.WRITE('stock', r.stock);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
        APEX_JSON.WRITE('fecha_ultimo_inventario', r.fecha_ultimo_inventario);
        APEX_JSON.WRITE('proveedor', r.proveedor);
        APEX_JSON.WRITE('rubro', r.rubro);
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('id_viscosidad', r.id_viscosidad);
        APEX_JSON.WRITE('cod_unidad_medida', r.cod_unidad_medida);
        APEX_JSON.WRITE('marca', r.marca);
        APEX_JSON.WRITE('viscosidad', r.viscosidad);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos/mas-vendidos',
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
