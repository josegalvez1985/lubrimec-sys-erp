--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Pedidos de Articulos (pagina APEX 63).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
--
--   GET /ords/josegalvez/lubrimec/pedidos/articulos
--       ?cod_empresa=24          (opcional, default 24)
--
-- Devuelve TODO el dataset (compras/ventas/existencia/costo por articulo+proveedor).
-- El filtrado (busqueda + facetas En Falta/Rubro/Proveedor) y el ordenamiento se
-- hacen 100% en el front (src/components/pedidos-articulos-view.tsx).
--
-- Query base provista por el negocio: agrupa movimientos (compras normales, ajustes,
-- ventas) por articulo+proveedor, calcula existencia por codigo_oem y costo ultimo
-- via PKG_COMPRAS.fn_costo_ultimo (una sola vez por combinacion).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC y PKG_COMPRAS.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'pedidos/articulos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'pedidos/articulos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'pedidos/articulos',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa NUMBER;

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
    l_cod_empresa := TO_NUMBER(NVL(get_qs(l_query, 'cod_empresa'), '24'));

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');

    FOR r IN (
        WITH
        base_movimientos AS (
            SELECT
                a.cod_empresa                              AS cod_empresa,
                b.id_articulo                              AS id_articulo,
                c.descripcion                              AS descripcion,
                b.cantidad                                 AS compras,
                0                                          AS ventas,
                a.cod_persona                              AS id_cod_proveedor,
                e.nombre                                   AS nombre,
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo))  AS codigo_oem,
                r.descripcion                              AS rubro,
                c.id_rubro                                 AS id_rubro,
                d.id_cod_proveedor                         AS art_id_cod_proveedor,
                c.es_activo                                AS es_activo
            FROM compras_cabecera           a
            JOIN compras_detalle            b ON b.id_factura  = a.id_factura
                                            AND b.cod_empresa  = a.cod_empresa
            JOIN articulos                  c ON c.id_articulo = b.id_articulo
                                            AND c.cod_empresa  = a.cod_empresa
            LEFT JOIN articulos_proveedores d ON d.cod_empresa = b.cod_empresa
                                            AND d.id_articulo  = b.id_articulo
                                            AND d.cod_persona  = a.cod_persona
            JOIN personas                   e ON e.cod_empresa = a.cod_empresa
                                            AND e.cod_persona  = a.cod_persona
            LEFT JOIN rubros                r ON r.cod_empresa = c.cod_empresa
                                            AND r.id_rubro     = c.id_rubro
            WHERE a.cod_empresa          = l_cod_empresa
              AND NVL(c.estado,   'I')   = 'A'
              AND NVL(c.es_activo,'S')  <> 'S'
              AND c.id_rubro            NOT IN (30, 39)
              AND a.tip_comprobante     <> 'AJS'

            UNION ALL

            SELECT
                a.cod_empresa,
                b.id_articulo,
                c.descripcion,
                0,
                ABS(b.cantidad),
                a.cod_persona,
                e.nombre,
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo)),
                r.descripcion,
                c.id_rubro,
                d.id_cod_proveedor,
                c.es_activo
            FROM compras_cabecera           a
            JOIN compras_detalle            b ON b.id_factura  = a.id_factura
                                            AND b.cod_empresa  = a.cod_empresa
            JOIN articulos                  c ON c.id_articulo = b.id_articulo
                                            AND c.cod_empresa  = a.cod_empresa
            LEFT JOIN articulos_proveedores d ON d.cod_empresa = b.cod_empresa
                                            AND d.id_articulo  = b.id_articulo
                                            AND d.cod_persona  = a.cod_persona
            JOIN personas                   e ON e.cod_empresa = d.cod_empresa
                                            AND e.cod_persona  = d.cod_persona
            LEFT JOIN rubros                r ON r.cod_empresa = c.cod_empresa
                                            AND r.id_rubro     = c.id_rubro
            WHERE a.cod_empresa          = l_cod_empresa
              AND NVL(c.estado,   'I')   = 'A'
              AND NVL(c.es_activo,'S')  <> 'S'
              AND c.id_rubro            NOT IN (30, 39)
              AND a.tip_comprobante      = 'AJS'

            UNION ALL

            SELECT
                a.cod_empresa,
                b.id_articulo,
                c.descripcion,
                0,
                b.cantidad,
                a.cod_persona,
                e.nombre,
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo)),
                r.descripcion,
                c.id_rubro,
                d.id_cod_proveedor,
                c.es_activo
            FROM ventas_cabecera            a
            JOIN ventas_detalle             b ON b.id_factura  = a.id_factura
            JOIN articulos                  c ON c.id_articulo = b.id_articulo
                                            AND c.cod_empresa  = a.cod_empresa
            LEFT JOIN articulos_proveedores d ON d.cod_empresa = a.cod_empresa
                                            AND d.id_articulo  = b.id_articulo
                                            AND d.cod_persona  = a.cod_persona
            JOIN personas                   e ON e.cod_empresa = d.cod_empresa
                                            AND e.cod_persona  = d.cod_persona
            LEFT JOIN rubros                r ON r.cod_empresa = c.cod_empresa
                                            AND r.id_rubro     = c.id_rubro
            WHERE a.cod_empresa          = l_cod_empresa
              AND NVL(c.estado,   'I')   = 'A'
              AND NVL(c.es_activo,'S')  <> 'S'
              AND c.id_rubro            NOT IN (30, 39)
        ),
        agrupado AS (
            SELECT
                cod_empresa                 AS ag_cod_empresa,
                id_articulo                 AS ag_id_articulo,
                codigo_oem                  AS ag_codigo_oem,
                descripcion                 AS ag_descripcion,
                rubro                       AS ag_rubro,
                nombre                      AS ag_nombre,
                id_cod_proveedor            AS ag_id_cod_proveedor,
                SUM(compras)                AS ag_compras,
                SUM(ventas)                 AS ag_ventas
            FROM base_movimientos
            GROUP BY
                cod_empresa, id_articulo, codigo_oem, descripcion,
                rubro, nombre, id_cod_proveedor
        ),
        existencias AS (
            SELECT
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo)) AS ex_codigo_oem,
                a.cod_empresa                              AS ex_cod_empresa,
                SUM(NVL(b.cantidad, 0))                    AS ex_cantidad
            FROM compras_cabecera a
            JOIN compras_detalle  b ON b.id_factura  = a.id_factura
            JOIN articulos        c ON c.id_articulo = b.id_articulo
                                   AND c.cod_empresa = a.cod_empresa
            WHERE a.cod_empresa   = l_cod_empresa
              AND c.id_rubro     NOT IN (30, 39)
            GROUP BY NVL(c.codigo_oem, TO_CHAR(c.id_articulo)), a.cod_empresa

            UNION ALL

            SELECT
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo)),
                a.cod_empresa,
                SUM(NVL(b.cantidad, 0)) * -1
            FROM ventas_cabecera  a
            JOIN ventas_detalle   b ON b.id_factura  = a.id_factura
            JOIN articulos        c ON c.id_articulo = b.id_articulo
                                   AND c.cod_empresa = a.cod_empresa
            WHERE a.cod_empresa   = l_cod_empresa
              AND c.id_rubro     NOT IN (30, 39)
            GROUP BY NVL(c.codigo_oem, TO_CHAR(c.id_articulo)), a.cod_empresa
        ),
        existencias_totales AS (
            SELECT ex_codigo_oem, ex_cod_empresa, SUM(ex_cantidad) AS ex_existencia
            FROM existencias
            GROUP BY ex_codigo_oem, ex_cod_empresa
        ),
        costos AS (
            SELECT DISTINCT
                ag_id_articulo      AS co_id_articulo,
                ag_cod_empresa      AS co_cod_empresa,
                ag_id_cod_proveedor AS co_id_cod_proveedor,
                PKG_COMPRAS.fn_costo_ultimo(
                    ag_id_articulo, ag_cod_empresa, ag_id_cod_proveedor
                )                   AS co_costo_ultimo
            FROM agrupado
        )
        SELECT
            ag.ag_cod_empresa                                           AS cod_empresa,
            MAX(ag.ag_id_articulo)                                      AS id_articulo,
            SUM(ag.ag_compras)                                          AS compras,
            SUM(ag.ag_ventas)                                           AS ventas,
            ROUND(SUM(ag.ag_ventas) / NULLIF(SUM(ag.ag_compras), 0) * 100, 2) AS rotacion,
            NVL(ex.ex_existencia, 0)                                    AS existencia,
            ag.ag_codigo_oem                                           AS codigo_oem,
            ag.ag_descripcion                                          AS articulo,
            ag.ag_rubro                                                AS rubro,
            CASE WHEN NVL(ex.ex_existencia, 0) = 0 THEN 'En Falta' ELSE 'Stock' END AS faltantes,
            ag.ag_nombre                                              AS nombre,
            co.co_costo_ultimo                                        AS costo_ultimo
        FROM agrupado                ag
        LEFT JOIN existencias_totales ex ON ex.ex_codigo_oem  = ag.ag_codigo_oem
                                        AND ex.ex_cod_empresa  = ag.ag_cod_empresa
        LEFT JOIN costos              co ON co.co_id_articulo      = ag.ag_id_articulo
                                        AND co.co_cod_empresa      = ag.ag_cod_empresa
                                        AND co.co_id_cod_proveedor = ag.ag_id_cod_proveedor
        GROUP BY
            ag.ag_cod_empresa, ag.ag_codigo_oem, ag.ag_descripcion,
            ag.ag_rubro, ag.ag_nombre, ex.ex_existencia, co.co_costo_ultimo
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('articulo', r.articulo);
        APEX_JSON.WRITE('existencia', r.existencia);
        APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
        APEX_JSON.WRITE('proveedor', r.nombre);
        APEX_JSON.WRITE('rubro', r.rubro);
        APEX_JSON.WRITE('ventas', r.ventas);
        APEX_JSON.WRITE('compras', r.compras);
        APEX_JSON.WRITE('rotacion', r.rotacion);
        APEX_JSON.WRITE('faltantes', r.faltantes);
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
      p_pattern            => 'pedidos/articulos',
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
