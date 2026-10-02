--------------------------------------------------------------------------------
-- SUBA DE PRECIOS (pagina APEX 100) — endpoint ORDS de solo lectura (sin paquete).
--
-- Ultimo precio (MAX id_precio) de cada articulo activo de la empresa, con margen,
-- precio anterior y stock. Modelo plano de solo lectura (ver ventas_articulos_sql).
--
--   GET /ords/josegalvez/lubrimec/suba-precios?cod_empresa=24
--       -> data: [{ id_precio, id_articulo, articulo, marca, rubro, fecha,
--                   precio_compra, precio_venta, precio_venta_anterior,
--                   porc_recargo, margen, stock }]
--   POST /ords/josegalvez/lubrimec/suba-precios
--       body: { id_articulo, precio_compra, porc_recargo, precio_venta, cod_empresa }
--       -> inserta un precio nuevo (queda como el ultimo precio del articulo).
--          fecha la asigna el trigger; id_precio es IDENTITY.
--
--   GET /ords/josegalvez/lubrimec/suba-precios/sugerir?cod_empresa=24&id_articulo=N
--       -> ultima compra + % de recargo del rubro (modal "Nueva suba").
--   GET /ords/josegalvez/lubrimec/suba-precios/ultimas-compras?cod_empresa=24
--       -> costo de la ultima compra de cada articulo (columna/marca de la grilla).
--   Los dos estan en un bloque aparte al final del archivo: se ejecuta solo, sin
--   tocar GET/POST.
--
-- cod_empresa obligatorio. Ejecutar como JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
-- fn_precio_venta_anterior / fn_existencia se envuelven para que un fallo puntual
-- no tumbe toda la query (devuelve NULL/0 para esa fila).
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'suba-precios', 'GET');  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'suba-precios', 'POST'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'suba-precios',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'suba-precios',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_ce          NUMBER;
    l_anterior    NUMBER;
    l_stock       NUMBER;

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
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    l_ce          := TO_NUMBER(l_cod_empresa);

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT b.id_precio, b.id_articulo, b.porc_recargo, b.fecha,
               b.precio_compra, b.precio_venta, b.cod_empresa,
               CASE WHEN b.precio_compra <> 0
                    THEN ((b.precio_venta - b.precio_compra) / b.precio_compra) * 100
               END AS margen,
               r.descripcion AS rubro,
               m.descripcion AS marca,
               a.descripcion AS articulo,
               a.codigo_oem  AS codigo_oem
          FROM precios_ventas b
          JOIN articulos a
                ON a.cod_empresa = b.cod_empresa
               AND a.id_articulo = b.id_articulo
          LEFT JOIN rubros r
                ON a.cod_empresa = r.cod_empresa
               AND a.id_rubro    = r.id_rubro
          LEFT JOIN marcas m
                ON a.cod_empresa = m.cod_empresa
               AND a.id_marca    = m.id_marca
         WHERE b.cod_empresa = l_ce
           AND NVL(a.estado, 'I') = 'A'
           AND b.id_precio = (SELECT MAX(c.id_precio)
                                FROM precios_ventas c
                               WHERE c.cod_empresa = b.cod_empresa
                                 AND c.id_articulo = b.id_articulo)
         ORDER BY margen ASC NULLS FIRST
    ) LOOP
        BEGIN
            l_anterior := PKG_VENTAS.FN_PRECIO_VENTA_ANTERIOR(r.cod_empresa, r.id_articulo);
        EXCEPTION WHEN OTHERS THEN l_anterior := NULL; END;
        BEGIN
            l_stock := NVL(PKG_STOCK.FN_EXISTENCIA(r.id_articulo, r.cod_empresa), 0);
        EXCEPTION WHEN OTHERS THEN l_stock := 0; END;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_precio', r.id_precio);
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('articulo', r.articulo);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('marca', r.marca);
        APEX_JSON.WRITE('rubro', r.rubro);
        APEX_JSON.WRITE('fecha', TO_CHAR(r.fecha, 'YYYY-MM-DD'));
        APEX_JSON.WRITE('precio_compra', r.precio_compra);
        APEX_JSON.WRITE('precio_venta', r.precio_venta);
        APEX_JSON.WRITE('precio_venta_anterior', l_anterior);
        APEX_JSON.WRITE('porc_recargo', r.porc_recargo);
        APEX_JSON.WRITE('margen', r.margen);
        APEX_JSON.WRITE('stock', l_stock);
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
      p_pattern            => 'suba-precios',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- POST /suba-precios  -> insertar un precio nuevo (ultimo precio del articulo)
  ----------------------------------------------------------------------------
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'suba-precios',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token   VARCHAR2(256); l_pos PLS_INTEGER; l_usuario VARCHAR2(255);
    l_id      NUMBER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, OPTIONS');
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

    IF :id_articulo IS NULL THEN
        OWA_UTIL.STATUS_LINE(400, 'Bad Request', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'El articulo es obligatorio'); APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;
    IF :precio_venta IS NULL THEN
        OWA_UTIL.STATUS_LINE(400, 'Bad Request', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'El precio de venta es obligatorio'); APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    -- fecha la asigna el trigger TR_INSERT_FECHA; id_precio es IDENTITY.
    INSERT INTO precios_ventas (id_articulo, porc_recargo, precio_compra, precio_venta, cod_empresa)
    VALUES (TO_NUMBER(:id_articulo), TO_NUMBER(:porc_recargo), TO_NUMBER(:precio_compra),
            TO_NUMBER(:precio_venta), TO_NUMBER(:cod_empresa))
    RETURNING id_precio INTO l_id;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Precio actualizado');
    APEX_JSON.WRITE('id_precio', l_id);
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM); APEX_JSON.CLOSE_OBJECT;
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'suba-precios',
      p_method             => 'POST',
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

--------------------------------------------------------------------------------
-- ENDPOINTS NUEVOS DE SUBA DE PRECIOS (modal "Nueva suba" y columna de la grilla)
--
-- Bloque INDEPENDIENTE: se puede ejecutar solo; no toca los handlers GET/POST de
-- arriba ni PKG_PRECIOS_VENTAS_LUBRIMEC. Mientras no se ejecute, el front sigue
-- funcionando (avisa en el modal y no muestra la columna de ultima compra).
--
-- "Ultima compra" (mismo criterio en los dos): la linea con precio <> 0 de la
-- factura mas reciente (fec_comprobante DESC NULLS LAST, id_factura DESC,
-- nro_linea DESC), sin ajustes AJS. No se reusa precios-ventas/sugerir porque sin
-- factura toma ROWNUM = 1 sin ORDER BY: una linea cualquiera, no la ultima.
--
-- GET /suba-precios/sugerir?cod_empresa=24&id_articulo=N
--   -> data: { rubro, porc_recargo, precio_compra, costo_delivery, id_factura,
--              nro_linea, fec_compra, comprobante, proveedor }
--   - porc_recargo: el del rubro del articulo (RUBROS.porc_recargo).
--   - costo_delivery: el delivery de esa factura prorrateado por unidad (mismo
--     calculo que SUGERIR de precios_ventas_sql.sql).
--   - Sin compras: solo rubro/porc_recargo (APEX_JSON omite las claves NULL).
--
-- GET /suba-precios/ultimas-compras?cod_empresa=24
--   -> data: [{ id_articulo, precio_compra, fec_compra }]  (una fila por articulo
--      con compras; ROW_NUMBER = 1 por articulo, sin fan-out)
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'suba-precios/sugerir', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'suba-precios/sugerir',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'suba-precios/sugerir',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token        VARCHAR2(256);
    l_usuario      VARCHAR2(255);
    l_pos          PLS_INTEGER;
    l_query        VARCHAR2(4000);
    l_ce           NUMBER;
    l_id_articulo  NUMBER;
    l_rubro        VARCHAR2(4000);
    l_porc_recargo NUMBER;
    l_precio       NUMBER;
    l_id_factura   NUMBER;
    l_nro_linea    NUMBER;
    l_fecha        DATE;
    l_comprobante  VARCHAR2(4000);
    l_proveedor    VARCHAR2(4000);
    l_delivery     NUMBER := 0;
    l_cant         NUMBER := 0;
    l_delivery_u   NUMBER := 0;

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
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_ce          := TO_NUMBER(get_qs(l_query, 'cod_empresa'));
    l_id_articulo := TO_NUMBER(get_qs(l_query, 'id_articulo'));
    IF l_ce IS NULL OR l_id_articulo IS NULL THEN
        OWA_UTIL.STATUS_LINE(400, 'Bad Request', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'cod_empresa e id_articulo son obligatorios');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    -- % de recargo del rubro del articulo
    BEGIN
        SELECT ru.descripcion, ru.porc_recargo
          INTO l_rubro, l_porc_recargo
          FROM articulos ar
          JOIN rubros ru
            ON ru.cod_empresa = ar.cod_empresa
           AND ru.id_rubro    = ar.id_rubro
         WHERE ar.cod_empresa = l_ce
           AND ar.id_articulo = l_id_articulo;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;

    -- Ultima compra real del articulo (sin ajustes AJS)
    BEGIN
        SELECT precio, id_factura, nro_linea, fec_comprobante, comprobante, proveedor,
               costo_delivery
          INTO l_precio, l_id_factura, l_nro_linea, l_fecha, l_comprobante, l_proveedor,
               l_delivery
          FROM (
            SELECT d.precio, d.id_factura, d.nro_linea, c.fec_comprobante,
                   TRIM(c.tip_comprobante || ' ' ||
                        CASE WHEN c.ser_timbrado IS NOT NULL THEN c.ser_timbrado || '-' END ||
                        c.nro_comprobante) AS comprobante,
                   NVL(pe.nombre_fantasia, pe.nombre) AS proveedor,
                   NVL(c.costo_delivery, 0) AS costo_delivery
              FROM compras_detalle d
              JOIN compras_cabecera c
                ON c.cod_empresa = d.cod_empresa
               AND c.id_factura  = d.id_factura
              LEFT JOIN personas pe
                ON pe.cod_empresa = c.cod_empresa
               AND pe.cod_persona = c.cod_persona
             WHERE d.cod_empresa = l_ce
               AND d.id_articulo = l_id_articulo
               AND NVL(d.precio, 0) <> 0
               AND NVL(c.tip_comprobante, 'X') <> 'AJS'
             ORDER BY c.fec_comprobante DESC NULLS LAST, d.id_factura DESC, d.nro_linea DESC
          )
         WHERE ROWNUM = 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN l_precio := NULL; END;

    -- Delivery de esa factura prorrateado por unidad (igual que SUGERIR)
    IF l_precio IS NOT NULL AND l_delivery > 0 THEN
        SELECT NVL(SUM(NVL(cantidad, 0)), 0) INTO l_cant
          FROM compras_detalle
         WHERE cod_empresa = l_ce
           AND id_factura  = l_id_factura;
        IF l_cant > 0 THEN
            l_delivery_u := ROUND(l_delivery / l_cant, 2);
        END IF;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('rubro', l_rubro);
    APEX_JSON.WRITE('porc_recargo', l_porc_recargo);
    IF l_precio IS NOT NULL THEN
        APEX_JSON.WRITE('precio_compra', l_precio);
        APEX_JSON.WRITE('costo_delivery', l_delivery_u);
        APEX_JSON.WRITE('id_factura', l_id_factura);
        APEX_JSON.WRITE('nro_linea', l_nro_linea);
        APEX_JSON.WRITE('fec_compra', TO_CHAR(l_fecha, 'YYYY-MM-DD'));
        APEX_JSON.WRITE('comprobante', l_comprobante);
        APEX_JSON.WRITE('proveedor', l_proveedor);
    END IF;
    APEX_JSON.CLOSE_OBJECT;
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
      p_pattern            => 'suba-precios/sugerir',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- GET /suba-precios/ultimas-compras  -> costo de la ultima compra por articulo
  ----------------------------------------------------------------------------
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'suba-precios/ultimas-compras', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'suba-precios/ultimas-compras',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'suba-precios/ultimas-compras',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token   VARCHAR2(256);
    l_usuario VARCHAR2(255);
    l_pos     PLS_INTEGER;
    l_query   VARCHAR2(4000);
    l_ce      NUMBER;

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
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_ce    := TO_NUMBER(get_qs(l_query, 'cod_empresa'));
    IF l_ce IS NULL THEN
        OWA_UTIL.STATUS_LINE(400, 'Bad Request', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'cod_empresa es obligatorio');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT id_articulo, precio, fec_comprobante
          FROM (
            SELECT d.id_articulo, d.precio, c.fec_comprobante,
                   ROW_NUMBER() OVER (
                       PARTITION BY d.id_articulo
                       ORDER BY c.fec_comprobante DESC NULLS LAST,
                                d.id_factura DESC, d.nro_linea DESC) AS rn
              FROM compras_detalle d
              JOIN compras_cabecera c
                ON c.cod_empresa = d.cod_empresa
               AND c.id_factura  = d.id_factura
             WHERE d.cod_empresa = l_ce
               AND NVL(d.precio, 0) <> 0
               AND NVL(c.tip_comprobante, 'X') <> 'AJS'
          )
         WHERE rn = 1
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('precio_compra', r.precio);
        APEX_JSON.WRITE('fec_compra', TO_CHAR(r.fec_comprobante, 'YYYY-MM-DD'));
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
      p_pattern            => 'suba-precios/ultimas-compras',
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
