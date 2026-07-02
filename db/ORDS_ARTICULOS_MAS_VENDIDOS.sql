--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Articulos Mas Vendidos (pagina APEX 102).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
--
-- NOTA: la vista actual (src/components/articulos-mas-vendidos-view.tsx) trae TODO
-- el dataset (sin params de filtro) y filtra/facetea 100% en el front. Los params
-- de abajo siguen soportados por si se quiere volver a filtrar server-side, pero
-- hoy el front no los usa.
--
--   GET /ords/josegalvez/lubrimec/articulos/mas-vendidos
--       ?cod_empresa=24          (opcional, default 24)
--       &search=<texto>          (opcional: descripcion/oem/proveedor/marca)
--       &descripcion=<texto>     (opcional: LIKE solo sobre la descripcion)
--       &proveedor=a,b,c         (opcional: lista separada por coma)
--       &rubro=a,b,c             (opcional: lista separada por coma)
--       &viscosidad=a,b,c        (opcional: lista separada por coma)
--       &marca=a,b,c             (opcional: lista separada por coma)
--       &unidad=a,b,c            (opcional: lista de cod_unidad_medida)
--
--   Busqueda facetada con OR GLOBAL: si se eligen valores en varias facetas, se
--   devuelven los articulos que cumplan CUALQUIERA de esos valores (union). El
--   texto de busqueda (search/descripcion) SIEMPRE acota (AND) sobre ese resultado.
--   Los valores de cada faceta se pasan como CSV; internamente se separan.
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
    l_proveedor   VARCHAR2(4000);
    l_rubro       VARCHAR2(4000);
    l_viscosidad  VARCHAR2(4000);
    l_marca       VARCHAR2(4000);
    l_unidad      VARCHAR2(4000);

    -- Listas de valores por faceta (CSV -> tabla). NULL/empty = faceta sin filtrar.
    t_proveedor   APEX_T_VARCHAR2;
    t_rubro       APEX_T_VARCHAR2;
    t_viscosidad  APEX_T_VARCHAR2;
    t_marca       APEX_T_VARCHAR2;
    t_unidad      APEX_T_VARCHAR2;
    l_hay_faceta  NUMBER;  -- 1 si hay al menos una faceta activa (flag SQL-friendly)

    -- CSV -> APEX_T_VARCHAR2 (trim, descarta vacios). Vacio si no hay valores.
    FUNCTION split_csv(p_csv IN VARCHAR2) RETURN APEX_T_VARCHAR2 IS
        l_out APEX_T_VARCHAR2 := APEX_T_VARCHAR2();
    BEGIN
        IF p_csv IS NULL THEN RETURN l_out; END IF;
        FOR r IN (
            SELECT TRIM(COLUMN_VALUE) v
              FROM TABLE(APEX_STRING.SPLIT(p_csv, ','))
             WHERE TRIM(COLUMN_VALUE) IS NOT NULL
        ) LOOP
            l_out.EXTEND; l_out(l_out.COUNT) := r.v;
        END LOOP;
        RETURN l_out;
    END;

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

    t_proveedor  := split_csv(l_proveedor);
    t_rubro      := split_csv(l_rubro);
    t_viscosidad := split_csv(l_viscosidad);
    t_marca      := split_csv(l_marca);
    t_unidad     := split_csv(l_unidad);
    -- Hay al menos una faceta activa? (si no, no se filtra por facetas)
    l_hay_faceta := CASE WHEN t_proveedor.COUNT > 0 OR t_rubro.COUNT > 0
                           OR t_viscosidad.COUNT > 0 OR t_marca.COUNT > 0
                           OR t_unidad.COUNT > 0
                         THEN 1 ELSE 0 END;

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
           -- OR GLOBAL entre facetas: si no hay ninguna faceta activa pasan todos;
           -- si hay, basta con coincidir en CUALQUIERA de las facetas elegidas.
           AND (l_hay_faceta = 0
                OR a.nombre_proveedor      IN (SELECT COLUMN_VALUE FROM TABLE(t_proveedor))
                OR a.descripcion_rubro     IN (SELECT COLUMN_VALUE FROM TABLE(t_rubro))
                OR a.descripcion_viscosidad IN (SELECT COLUMN_VALUE FROM TABLE(t_viscosidad))
                OR a.descripcion_marca     IN (SELECT COLUMN_VALUE FROM TABLE(t_marca))
                OR a.cod_unidad_medida     IN (SELECT COLUMN_VALUE FROM TABLE(t_unidad)))
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
