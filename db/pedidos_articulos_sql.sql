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
-- Query base provista por el negocio: agrupa movimientos (compras normales, ajustes)
-- por articulo+proveedor, calcula existencia y ventas por codigo_oem, y el costo
-- ultimo via PKG_COMPRAS.fn_costo_ultimo (una sola vez por combinacion).
--
-- COLUMNA VENTAS — se corrige aca respecto del APEX (pagina 63), que la tiene rota:
-- la rama VENTAS del UNION original unia articulos_proveedores con
-- "d.cod_persona = a.cod_persona", pero en VENTAS_CABECERA cod_persona es el
-- CLIENTE y en ARTICULOS_PROVEEDORES es el PROVEEDOR, asi que no matcheaba casi
-- nunca; y el "JOIN personas ... ON e.cod_persona = d.cod_persona" que venia
-- despues, al ser INNER sobre las columnas del LEFT JOIN, descartaba las filas
-- sobrantes. Resultado: SUM(ventas) = 0 para todo (y rotacion = 0).
-- Ademas la rama tomaba a.cod_persona (el cliente) como id_cod_proveedor, con lo
-- que ni siquiera habria agrupado junto a las compras del mismo articulo.
--
-- Arreglo: una venta NO tiene proveedor, asi que no se la atribuye a ninguno. Se
-- calculan las ventas por CODIGO_OEM en su propio CTE (ventas_oem), igual que ya
-- se hacia con existencias, y se suman al final. Cada fila (articulo+proveedor)
-- muestra el total vendido de ese OEM, al lado del stock de ese mismo OEM.
-- Los ajustes AJS ya NO se cuentan: el APEX tenia una rama que los sumaba a
-- "ventas" (tip_comprobante = 'AJS' con ABS(cantidad)), pero un ajuste de stock o
-- de inventario no es una venta ni una compra, asi que se saco. Con eso
-- base_movimientos queda con una sola rama (las compras reales) y "ventas" sale
-- entera del CTE ventas_oem.
-- El CTE existencias SI sigue incluyendo los AJS: ahi el criterio es distinto,
-- un ajuste no es una compra pero si mueve el stock, y sacarlo daria mal el saldo.
--
-- Se devuelven ademas "ventas_articulo" y "existencia_articulo": las ventas y la
-- existencia por ID_ARTICULO. Son el mismo calculo que ventas_oem y
-- existencias_totales pero con la clave un nivel mas abajo, asi que SUMADAS sobre
-- todos los articulos de un OEM dan exactamente el total del OEM. Eso es lo que
-- le permite al front acotarlas cuando se filtra por proveedor (se suman solo los
-- articulos de ese proveedor) sin contradecir el total sin filtrar.
-- Las compras ya son por proveedor; las ventas y la existencia NO se pueden abrir
-- por proveedor (una venta no tiene proveedor, y el stock es un pool por OEM):
-- el articulo es el grano mas fino real de las dos.
--
-- "cod_proveedor" es el/los codigo(s) con que ESE proveedor identifica el
-- articulo en su catalogo (ARTICULOS_PROVEEDORES.id_cod_proveedor). Va en el
-- texto del pedido: es lo que el proveedor entiende. Se calcula en el CTE
-- codigos_prov, que colapsa la tabla a UNA fila por (empresa, articulo,
-- proveedor) ANTES de unirla. Joinearla directo contra las compras es
-- exactamente lo que duplicaba los totales (ver la nota en base_movimientos).
--
-- Solo se listan compras hechas a PROVEEDORES: personas con
-- ind_cliente_proveedor en (P, A). Una compra cargada a una persona marcada solo
-- como Cliente, o sin el indicador, queda fuera del reporte entero (tambien de
-- sus totales de Compras). Es el mismo criterio de las LOVs de proveedores.
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
                a.cod_persona                              AS id_cod_proveedor,
                e.nombre                                   AS nombre,
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo))  AS codigo_oem,
                r.descripcion                              AS rubro,
                c.id_rubro                                 AS id_rubro,
                c.es_activo                                AS es_activo
            FROM compras_cabecera           a
            JOIN compras_detalle            b ON b.id_factura  = a.id_factura
                                            AND b.cod_empresa  = a.cod_empresa
            JOIN articulos                  c ON c.id_articulo = b.id_articulo
                                            AND c.cod_empresa  = a.cod_empresa
            -- OJO: aca el APEX tenia un "LEFT JOIN articulos_proveedores d". Se
            -- saco porque DUPLICABA las compras: ARTICULOS_PROVEEDORES tiene PK
            -- propia (id_articulo_proveedor), no una clave por articulo+proveedor,
            -- asi que un articulo cargado dos veces para el mismo proveedor hacia
            -- que cada linea de compra se contara dos veces (fan-out). Y lo unico
            -- que se sacaba de ese join (d.id_cod_proveedor) no lo usaba nadie
            -- aguas abajo. Sacar un LEFT JOIN nunca pierde filas: solo deja de
            -- multiplicarlas. No volver a agregarlo sin agrupar o sin DISTINCT.
            -- Solo proveedores: ind_cliente_proveedor P (Proveedor) o A (Ambos).
            -- Mismo criterio que las LOVs de proveedores ya existentes
            -- (compras_sql.sql BUSCAR_PROVEEDORES y articulos_proveedores_sql.sql),
            -- para que las tres pantallas no se contradigan. NVL a "-": una
            -- persona sin el indicador cargado NO se considera proveedor.
            JOIN personas                   e ON e.cod_empresa = a.cod_empresa
                                            AND e.cod_persona  = a.cod_persona
                                            AND NVL(e.ind_cliente_proveedor, '-') IN ('P', 'A')
            LEFT JOIN rubros                r ON r.cod_empresa = c.cod_empresa
                                            AND r.id_rubro     = c.id_rubro
            WHERE a.cod_empresa          = l_cod_empresa
              AND NVL(c.estado,   'I')   = 'A'
              AND NVL(c.es_activo,'S')  <> 'S'
              AND c.id_rubro            NOT IN (30, 39)
              AND a.tip_comprobante     NOT IN ('AJS')  -- ajustes de stock

            -- (el UNION original tenia dos ramas mas, AJUSTES y VENTAS: las dos
            --  se sacaron, ver la nota de la cabecera. Las ventas salen del CTE
            --  ventas_oem y los ajustes no se cuentan.)
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
                SUM(compras)                AS ag_compras
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
        ventas_oem AS (
            -- Ventas por codigo_oem (mismo criterio que la rama negativa de
            -- existencias, para que "vendi N" y "me queda X" hablen del mismo
            -- conjunto de articulos).
            SELECT
                NVL(c.codigo_oem, TO_CHAR(c.id_articulo)) AS vo_codigo_oem,
                a.cod_empresa                              AS vo_cod_empresa,
                SUM(NVL(b.cantidad, 0))                    AS vo_ventas
            FROM ventas_cabecera  a
            JOIN ventas_detalle   b ON b.id_factura  = a.id_factura
            JOIN articulos        c ON c.id_articulo = b.id_articulo
                                   AND c.cod_empresa = a.cod_empresa
            WHERE a.cod_empresa   = l_cod_empresa
              AND c.id_rubro     NOT IN (30, 39)
            GROUP BY NVL(c.codigo_oem, TO_CHAR(c.id_articulo)), a.cod_empresa
        ),
        ventas_art AS (
            -- Ventas por articulo (no por OEM): grano del modal de detalle.
            SELECT
                b.id_articulo           AS va_id_articulo,
                a.cod_empresa           AS va_cod_empresa,
                SUM(NVL(b.cantidad, 0)) AS va_ventas
            FROM ventas_cabecera  a
            JOIN ventas_detalle   b ON b.id_factura  = a.id_factura
            JOIN articulos        c ON c.id_articulo = b.id_articulo
                                   AND c.cod_empresa = a.cod_empresa
            WHERE a.cod_empresa   = l_cod_empresa
              AND c.id_rubro     NOT IN (30, 39)
            GROUP BY b.id_articulo, a.cod_empresa
        ),
        existencia_art AS (
            -- Existencia por articulo = compras - ventas, mismo criterio que el
            -- CTE existencias (AJS incluidos: un ajuste no es compra pero si
            -- mueve el stock), con la clave un nivel mas abajo.
            SELECT
                id_articulo AS ea_id_articulo,
                cod_empresa AS ea_cod_empresa,
                SUM(cant)   AS ea_existencia
            FROM (
                SELECT b.id_articulo, a.cod_empresa, NVL(b.cantidad, 0) AS cant
                  FROM compras_cabecera a
                  JOIN compras_detalle  b ON b.id_factura  = a.id_factura
                  JOIN articulos        c ON c.id_articulo = b.id_articulo
                                         AND c.cod_empresa = a.cod_empresa
                 WHERE a.cod_empresa = l_cod_empresa
                   AND c.id_rubro   NOT IN (30, 39)
                UNION ALL
                SELECT b.id_articulo, a.cod_empresa, NVL(b.cantidad, 0) * -1
                  FROM ventas_cabecera  a
                  JOIN ventas_detalle   b ON b.id_factura  = a.id_factura
                  JOIN articulos        c ON c.id_articulo = b.id_articulo
                                         AND c.cod_empresa = a.cod_empresa
                 WHERE a.cod_empresa = l_cod_empresa
                   AND c.id_rubro   NOT IN (30, 39)
            )
            GROUP BY id_articulo, cod_empresa
        ),
        codigos_prov AS (
            -- UNA fila por (empresa, articulo, proveedor): los codigos se juntan
            -- en un solo texto. Asi el LEFT JOIN de abajo es 1:1 y no puede
            -- multiplicar filas. Si un articulo tiene mas de un codigo cargado
            -- para el mismo proveedor, se muestran todos separados por " / ".
            SELECT
                cod_empresa AS cp_cod_empresa,
                id_articulo AS cp_id_articulo,
                cod_persona AS cp_cod_persona,
                LISTAGG(id_cod_proveedor, ' / ')
                    WITHIN GROUP (ORDER BY id_cod_proveedor) AS cp_codigos
            FROM (
                SELECT DISTINCT cod_empresa, id_articulo, cod_persona, id_cod_proveedor
                  FROM articulos_proveedores
                 WHERE cod_empresa = l_cod_empresa
                   AND id_cod_proveedor IS NOT NULL
            )
            GROUP BY cod_empresa, id_articulo, cod_persona
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
            -- Ventas del OEM: no se atribuyen a ningun proveedor (una venta no
            -- tiene proveedor) y los ajustes AJS ya no se cuentan como venta.
            NVL(vo.vo_ventas, 0)                                        AS ventas,
            ROUND(NVL(vo.vo_ventas, 0)
                  / NULLIF(SUM(ag.ag_compras), 0) * 100, 2)             AS rotacion,
            -- MAX y no SUM: el grupo es un articulo (se agrupa por descripcion,
            -- igual criterio que el MAX(ag_id_articulo) de arriba).
            MAX(NVL(va.va_ventas, 0))                                   AS ventas_articulo,
            MAX(NVL(ea.ea_existencia, 0))                               AS existencia_articulo,
            MAX(cp.cp_codigos)                                          AS cod_proveedor,
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
        LEFT JOIN ventas_oem          vo ON vo.vo_codigo_oem  = ag.ag_codigo_oem
                                        AND vo.vo_cod_empresa  = ag.ag_cod_empresa
        LEFT JOIN ventas_art          va ON va.va_id_articulo = ag.ag_id_articulo
                                        AND va.va_cod_empresa  = ag.ag_cod_empresa
        LEFT JOIN existencia_art      ea ON ea.ea_id_articulo = ag.ag_id_articulo
                                        AND ea.ea_cod_empresa  = ag.ag_cod_empresa
        LEFT JOIN codigos_prov        cp ON cp.cp_id_articulo = ag.ag_id_articulo
                                        AND cp.cp_cod_empresa = ag.ag_cod_empresa
                                        AND cp.cp_cod_persona = ag.ag_id_cod_proveedor
        LEFT JOIN costos              co ON co.co_id_articulo      = ag.ag_id_articulo
                                        AND co.co_cod_empresa      = ag.ag_cod_empresa
                                        AND co.co_id_cod_proveedor = ag.ag_id_cod_proveedor
        GROUP BY
            ag.ag_cod_empresa, ag.ag_codigo_oem, ag.ag_descripcion,
            ag.ag_rubro, ag.ag_nombre, ex.ex_existencia, co.co_costo_ultimo,
            vo.vo_ventas
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
        APEX_JSON.WRITE('ventas_articulo', r.ventas_articulo);
        APEX_JSON.WRITE('existencia_articulo', r.existencia_articulo);
        APEX_JSON.WRITE('cod_proveedor', r.cod_proveedor);
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
