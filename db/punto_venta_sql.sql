--------------------------------------------------------------------------------
-- PUNTO DE VENTA (paginas APEX 39/40/45/47) — paquete + endpoints ORDS.
-- Ejecutar completo como JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC, PKG_VENTAS.
--
-- Reemplaza el flujo de apex_collections (CARRITO/CABECERA/FORMAPAGO) por un
-- registro atomico: el front arma el carrito + cabecera + cobros en React y
-- manda todo junto a REGISTRAR, que hace los 3 INSERT (VENTAS_CABECERA,
-- VENTAS_DETALLE, VENTAS_COBROS) en una transaccion, igual que el proceso
-- 'apex_collections' de la pagina 47.
--
-- LISTAR_ARTICULOS: query "Punto de Venta v2" de la pagina 39 (precio_venta y
--   costo de la tabla articulos, existencia = compras - ventas, descuento por
--   PKG_VENTAS.fn_porc_descuento). Filtro por rubro / cod_barra opcional.
-- SIGUIENTE_NRO: nro de comprobante = MAX(nro_comprobante)+1 por serie (pag 45).
-- REGISTRAR: id_factura = PKG_VENTAS.fn_id_factura(); cod_iva = 1 fijo (pag 47).
--
-- === 1) PAQUETE PKG_PUNTO_VENTA_LUBRIMEC ===================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_PUNTO_VENTA_LUBRIMEC AS

  PROCEDURE LISTAR_ARTICULOS(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_id_rubro IN NUMBER, p_descuento IN NUMBER, p_q IN VARCHAR2);
  PROCEDURE BUSCAR_POR_BARRA(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_cod_barra IN VARCHAR2);
  PROCEDURE SIGUIENTE_NRO(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_ser_timbrado IN VARCHAR2);
  PROCEDURE REGISTRAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_body IN CLOB);

END PKG_PUNTO_VENTA_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_PUNTO_VENTA_LUBRIMEC AS

  PROCEDURE p_error(p_status IN NUMBER, p_reason IN VARCHAR2, p_message IN VARCHAR2) IS
  BEGIN
    OWA_UTIL.STATUS_LINE(p_status, p_reason, FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', FALSE);
    APEX_JSON.WRITE('message', p_message);
    APEX_JSON.CLOSE_OBJECT;
  END p_error;

  FUNCTION f_usuario(p_token IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
  END f_usuario;

  --------------------------------------------------------------------------
  -- LISTAR_ARTICULOS (query POS v2 de la pagina 39)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR_ARTICULOS(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_id_rubro IN NUMBER, p_descuento IN NUMBER, p_q IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_q       VARCHAR2(400) := '%' || UPPER(TRIM(p_q)) || '%';
    l_desc    NUMBER := NVL(p_descuento, 0);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        WITH articulos_base AS (
            SELECT a.id_articulo, a.descripcion, a.id_rubro, a.id_marca, a.cod_empresa,
                   a.cod_unidad_medida, a.precio_venta, a.codigo_oem
              FROM articulos a
             WHERE a.cod_empresa = p_cod_empresa
               AND NVL(a.estado, 'I') = 'A'
               AND NVL(a.es_activo, 'N') = 'N'
        ),
        existencias AS (
            SELECT b.id_articulo, a.cod_empresa, SUM(NVL(b.cantidad, 0)) cant
              FROM compras_cabecera a
              JOIN compras_detalle b ON b.id_factura = a.id_factura
              JOIN articulos_base c ON c.id_articulo = b.id_articulo AND c.cod_empresa = a.cod_empresa
             WHERE a.cod_empresa = p_cod_empresa
             GROUP BY b.id_articulo, a.cod_empresa
            UNION ALL
            SELECT b.id_articulo, a.cod_empresa, SUM(NVL(b.cantidad, 0)) * -1
              FROM ventas_cabecera a
              JOIN ventas_detalle b ON b.id_factura = a.id_factura
              JOIN articulos_base c ON c.id_articulo = b.id_articulo AND c.cod_empresa = a.cod_empresa
             WHERE a.cod_empresa = p_cod_empresa
             GROUP BY b.id_articulo, a.cod_empresa
        ),
        existencias_totales AS (
            SELECT id_articulo, cod_empresa, SUM(cant) existencia
              FROM existencias GROUP BY id_articulo, cod_empresa
        ),
        articulos_con_stock AS (
            SELECT ab.*
              FROM articulos_base ab
              LEFT JOIN existencias_totales ex ON ex.id_articulo = ab.id_articulo
                                              AND ex.cod_empresa = ab.cod_empresa
             WHERE NVL(ex.existencia, 0) > 0 OR ab.id_rubro = 30
        )
        SELECT ac.id_articulo, ac.descripcion, ac.id_rubro, ac.id_marca, ac.codigo_oem,
               ru.descripcion AS rubro, ma.descripcion AS marca,
               ac.precio_venta,
               CASE
                 WHEN l_desc > 0 THEN ac.precio_venta * (1 - (l_desc / 100))
                 WHEN l_desc = 0 AND ac.id_rubro IN (1, 13)
                      AND UPPER(TRIM(ac.cod_unidad_medida)) = 'LT'
                   THEN ac.precio_venta * PKG_VENTAS.FN_PORC_DESCUENTO(ac.precio_venta * 4)
                 ELSE ac.precio_venta * PKG_VENTAS.FN_PORC_DESCUENTO(ac.precio_venta)
               END AS precio_con_descuento
          FROM articulos_con_stock ac
          LEFT JOIN rubros ru ON ru.cod_empresa = ac.cod_empresa AND ru.id_rubro = ac.id_rubro
          LEFT JOIN marcas ma ON ma.cod_empresa = ac.cod_empresa AND ma.id_marca = ac.id_marca
         WHERE (p_id_rubro IS NULL OR ac.id_rubro = p_id_rubro)
           AND (TRIM(p_q) IS NULL
                OR UPPER(ac.descripcion) LIKE l_q
                OR UPPER(ac.codigo_oem) LIKE l_q
                OR TO_CHAR(ac.id_articulo) LIKE l_q)
         ORDER BY ac.descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('id_rubro', r.id_rubro);
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.WRITE('rubro', r.rubro);
      APEX_JSON.WRITE('marca', r.marca);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.WRITE('precio_venta', r.precio_venta);
      APEX_JSON.WRITE('precio_con_descuento', ROUND(r.precio_con_descuento));
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR_ARTICULOS;

  --------------------------------------------------------------------------
  -- BUSCAR_POR_BARRA (lector: cod_barra -> articulo con su precio)
  --------------------------------------------------------------------------
  PROCEDURE BUSCAR_POR_BARRA(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_cod_barra IN VARCHAR2) IS
    l_usuario     VARCHAR2(255);
    l_id_articulo NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT id_articulo INTO l_id_articulo
        FROM codigos_barras
       WHERE cod_empresa = p_cod_empresa AND cod_barra = p_cod_barra AND ROWNUM = 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN l_id_articulo := NULL; END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    IF l_id_articulo IS NOT NULL THEN
      APEX_JSON.OPEN_OBJECT('data');
      FOR r IN (
        SELECT id_articulo, descripcion, precio_venta
          FROM articulos
         WHERE cod_empresa = p_cod_empresa AND id_articulo = l_id_articulo
      ) LOOP
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('precio_venta', r.precio_venta);
      END LOOP;
      APEX_JSON.CLOSE_OBJECT;
    ELSE
      DECLARE l_nulo VARCHAR2(1) := NULL; BEGIN APEX_JSON.WRITE('data', l_nulo); END;
    END IF;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END BUSCAR_POR_BARRA;

  --------------------------------------------------------------------------
  -- SIGUIENTE_NRO (nro comprobante = max+1 por serie, pagina 45)
  --------------------------------------------------------------------------
  PROCEDURE SIGUIENTE_NRO(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_ser_timbrado IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_nro     NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    SELECT NVL(MAX(nro_comprobante), 0) + 1 INTO l_nro
      FROM ventas_cabecera
     WHERE ser_timbrado = p_ser_timbrado
       AND cod_empresa = p_cod_empresa;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('nro_comprobante', l_nro);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END SIGUIENTE_NRO;

  --------------------------------------------------------------------------
  -- REGISTRAR (los 3 INSERT en una transaccion, como el proceso pag 47)
  -- Body JSON:
  -- { cabecera: { tip_comprobante, ser_timbrado, nro_timbrado, nro_comprobante,
  --               cod_persona, cod_moneda, tip_cambio, id_talonario, cod_vendedor,
  --               nro_voucher, nro_telefono, observacion, modelo_vehiculo },
  --   detalle: [ { id_articulo, cantidad, precio, descuento, precio_lista } ],
  --   cobros:  [ { id_forma, id_banco, nro_transaccion, observacion, total,
  --               cod_moneda, efectivo_recibido, efectivo_vuelto } ] }
  --------------------------------------------------------------------------
  PROCEDURE REGISTRAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_body IN CLOB) IS
    l_usuario     VARCHAR2(255);
    l_id_factura  NUMBER;
    l_n           PLS_INTEGER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    APEX_JSON.PARSE(p_body);

    -- id_factura desde la funcion del sistema
    l_id_factura := PKG_VENTAS.FN_ID_FACTURA();

    -- Cabecera
    INSERT INTO ventas_cabecera (
        tip_comprobante, ser_timbrado, nro_timbrado, nro_comprobante,
        fec_comprobante, cod_persona, cod_moneda, tip_cambio, id_factura,
        cod_empresa, estado, id_talonario, cod_vendedor, nro_voucher,
        nro_telefono, observacion, modelo_vehiculo)
    VALUES (
        APEX_JSON.GET_VARCHAR2('cabecera.tip_comprobante'),
        APEX_JSON.GET_VARCHAR2('cabecera.ser_timbrado'),
        APEX_JSON.GET_NUMBER('cabecera.nro_timbrado'),
        APEX_JSON.GET_NUMBER('cabecera.nro_comprobante'),
        SYSDATE,
        APEX_JSON.GET_NUMBER('cabecera.cod_persona'),
        NVL(APEX_JSON.GET_NUMBER('cabecera.cod_moneda'), 1),
        NVL(APEX_JSON.GET_NUMBER('cabecera.tip_cambio'), 1),
        l_id_factura, p_cod_empresa, 'A',
        APEX_JSON.GET_NUMBER('cabecera.id_talonario'),
        APEX_JSON.GET_NUMBER('cabecera.cod_vendedor'),
        APEX_JSON.GET_NUMBER('cabecera.nro_voucher'),
        APEX_JSON.GET_VARCHAR2('cabecera.nro_telefono'),
        APEX_JSON.GET_VARCHAR2('cabecera.observacion'),
        APEX_JSON.GET_VARCHAR2('cabecera.modelo_vehiculo'));

    -- Detalle (cod_iva = 1 fijo, como el APEX)
    l_n := APEX_JSON.GET_COUNT('detalle');
    IF l_n IS NOT NULL THEN
      FOR i IN 1 .. l_n LOOP
        INSERT INTO ventas_detalle (
            id_articulo, cantidad, precio, cod_iva, id_factura, descuento, precio_lista)
        VALUES (
            APEX_JSON.GET_NUMBER('detalle[%d].id_articulo', i),
            APEX_JSON.GET_NUMBER('detalle[%d].cantidad', i),
            APEX_JSON.GET_NUMBER('detalle[%d].precio', i),
            1,
            l_id_factura,
            APEX_JSON.GET_NUMBER('detalle[%d].descuento', i),
            APEX_JSON.GET_NUMBER('detalle[%d].precio_lista', i));
      END LOOP;
    END IF;

    -- Cobros
    l_n := APEX_JSON.GET_COUNT('cobros');
    IF l_n IS NOT NULL THEN
      FOR i IN 1 .. l_n LOOP
        INSERT INTO ventas_cobros (
            fecha, id_factura, id_forma, id_banco, nro_transaccion, observacion,
            total, cod_moneda, efectivo_recibido, efectivo_vuelto)
        VALUES (
            SYSDATE, l_id_factura,
            APEX_JSON.GET_NUMBER('cobros[%d].id_forma', i),
            APEX_JSON.GET_NUMBER('cobros[%d].id_banco', i),
            APEX_JSON.GET_VARCHAR2('cobros[%d].nro_transaccion', i),
            APEX_JSON.GET_VARCHAR2('cobros[%d].observacion', i),
            APEX_JSON.GET_NUMBER('cobros[%d].total', i),
            NVL(APEX_JSON.GET_NUMBER('cobros[%d].cod_moneda', i), 1),
            APEX_JSON.GET_NUMBER('cobros[%d].efectivo_recibido', i),
            APEX_JSON.GET_NUMBER('cobros[%d].efectivo_vuelto', i));
      END LOOP;
    END IF;

    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Venta registrada');
    APEX_JSON.WRITE('id_factura', l_id_factura);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END REGISTRAR;

END PKG_PUNTO_VENTA_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET  /lubrimec/pos/articulos?cod_empresa&id_rubro&descuento&q -> listar
--   GET  /lubrimec/pos/barra?cod_empresa&cod_barra                -> por barra
--   GET  /lubrimec/pos/siguiente-nro?cod_empresa&ser_timbrado     -> nro comp.
--   POST /lubrimec/pos/registrar?cod_empresa                      -> registrar
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'pos/articulos', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'pos/barra', 'GET');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'pos/siguiente-nro', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'pos/registrar', 'POST');    EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- GET /pos/articulos
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'pos/articulos',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'pos/articulos', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20); l_id_rubro VARCHAR2(20);
    l_descuento VARCHAR2(20); l_q VARCHAR2(400);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_id_rubro    := get_qs(l_qs, 'id_rubro');
    l_descuento   := get_qs(l_qs, 'descuento');
    l_q           := get_qs(l_qs, 'q');
    PKG_PUNTO_VENTA_LUBRIMEC.LISTAR_ARTICULOS(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa),
        p_id_rubro => TO_NUMBER(l_id_rubro), p_descuento => TO_NUMBER(l_descuento),
        p_q => l_q);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'pos/articulos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /pos/barra
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'pos/barra',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'pos/barra', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20); l_cod_barra VARCHAR2(200);
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
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_cod_barra   := get_qs(l_qs, 'cod_barra');
    PKG_PUNTO_VENTA_LUBRIMEC.BUSCAR_POR_BARRA(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa), p_cod_barra => l_cod_barra);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'pos/barra', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /pos/siguiente-nro
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'pos/siguiente-nro',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'pos/siguiente-nro', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20); l_ser VARCHAR2(20);
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
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_ser         := get_qs(l_qs, 'ser_timbrado');
    PKG_PUNTO_VENTA_LUBRIMEC.SIGUIENTE_NRO(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa), p_ser_timbrado => l_ser);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'pos/siguiente-nro', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /pos/registrar
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'pos/registrar',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'pos/registrar', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    PKG_PUNTO_VENTA_LUBRIMEC.REGISTRAR(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa), p_body => :body_text);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'pos/registrar', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');
  -- El body NO se declara como parametro: ORDS expone el cuerpo del POST como el
  -- bind implicito :body_text (CLOB). Declararlo con source_type 'BODY' viola
  -- REST_PARAMS_SOURCE_TYPE_CK en esta version de ORDS.

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
