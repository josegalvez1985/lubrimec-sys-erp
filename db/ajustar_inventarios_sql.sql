--------------------------------------------------------------------------------
-- AJUSTAR INVENTARIOS (paginas APEX 87 grilla facetada + 88 modal Aplicar
-- Inventario al Stock) — paquete + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC y
-- PKG_COMPRAS (fn_costo_ultimo, fn_fecha_ultima_compra).
--
-- LISTAR: ultimo conteo de INVENTARIO por articulo (MAX(id_inventario)), con
-- costo ultimo y fecha de ultima compra; el filtrado (facetas + busqueda) es
-- 100% en el front. total_costo = costo_ultimo * diferencia se calcula en el front.
--
-- AJUSTAR (modal 88): replica el proceso APEX en UNA transaccion atomica:
--   1) siguiente nro_comprobante para AJS/E (algoritmo de huecos del APEX)
--   2) INSERT COMPRAS_CABECERA (valores fijos del APEX: persona 1982, moneda 1,
--      tip_cambio 1, nro_timbrado 1, id_condicion 1, id_comprador 81)
--   3) INSERT COMPRAS_DETALLE (articulo, cantidad=diferencia, precio=costo, iva)
--   4) UPDATE INVENTARIO.cerrado='S'  5) UPDATE ARTICULOS.fecha_ultimo_inventario
--
-- DIF_CERO: cierra (cerrado='S') todos los ultimos conteos con diferencia 0 y
-- actualiza fecha_ultimo_inventario (boton "Ajustar Diferencias 0").
--
-- FOTO: endpoint PUBLICO (el <img> no manda Authorization) que sirve el BLOB
-- INVENTARIO.FOTO; el MIME se detecta por los magic bytes del blob.
--
-- Rutas:
--   GET  /lubrimec/inventario-ajustes?cod_empresa=:n      -> listar
--   POST /lubrimec/inventario-ajustes/aplicar             -> ajustar un articulo
--   POST /lubrimec/inventario-ajustes/dif-cero            -> cerrar diferencias 0
--   GET  /lubrimec/inventario/:id/foto?cod_empresa=:n     -> foto (publico)
--------------------------------------------------------------------------------
-- === 1) PAQUETE PKG_AJUSTAR_INV_LUBRIMEC ===================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_AJUSTAR_INV_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  PROCEDURE AJUSTAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_id_inventario IN NUMBER,
      p_id_articulo   IN NUMBER,
      p_cantidad      IN NUMBER,
      p_precio        IN NUMBER,
      p_cod_iva       IN NUMBER);

  PROCEDURE DIF_CERO(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- Publico: emite el BLOB de INVENTARIO.FOTO con su MIME (magic bytes).
  PROCEDURE SERVIR_FOTO(
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER);

END PKG_AJUSTAR_INV_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_AJUSTAR_INV_LUBRIMEC AS

  --------------------------------------------------------------------------
  -- Helpers privados
  --------------------------------------------------------------------------
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
  -- LISTAR (query de la pag 87: ultimo conteo por articulo)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
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
        SELECT m.id_inventario,
               m.id_articulo,
               a.descripcion,
               NVL(a.codigo_oem, TO_CHAR(a.id_articulo)) AS codigo_oem,
               TO_CHAR(m.fecha, 'YYYY-MM-DD') AS fecha,
               NVL(m.cantidad_fisica, 0) AS cantidad_fisica,
               NVL(m.cantidad_sistema, 0) AS cantidad_sistema,
               NVL(m.cantidad_fisica, 0) - NVL(m.cantidad_sistema, 0) AS cant_diferencia,
               NVL(m.cerrado, 'N') AS cerrado,
               r2.descripcion AS rubro,
               ma.descripcion AS marca,
               a.es_activo,
               NVL(a.cod_iva, 1) AS cod_iva,
               pkg_compras.fn_costo_ultimo(a.id_articulo, a.cod_empresa) AS costo_ultimo,
               TO_CHAR(pkg_compras.fn_fecha_ultima_compra(a.id_articulo, a.cod_empresa),
                       'YYYY-MM-DD') AS fec_ultima_compra,
               CASE WHEN DBMS_LOB.GETLENGTH(m.foto) > 0 THEN 1 ELSE 0 END AS tiene_foto
          FROM inventario m
          JOIN articulos a
                ON a.cod_empresa = m.cod_empresa
               AND a.id_articulo = m.id_articulo
          LEFT JOIN rubros r2
                ON r2.cod_empresa = a.cod_empresa
               AND r2.id_rubro = a.id_rubro
          LEFT JOIN marcas ma
                ON ma.cod_empresa = a.cod_empresa
               AND ma.id_marca = a.id_marca
         WHERE m.cod_empresa = p_cod_empresa
           AND m.id_inventario = (SELECT MAX(b.id_inventario)
                                    FROM inventario b
                                   WHERE b.cod_empresa = m.cod_empresa
                                     AND b.id_articulo = m.id_articulo)
         ORDER BY m.id_inventario DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_inventario', r.id_inventario);
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.WRITE('fecha', r.fecha);
      APEX_JSON.WRITE('cantidad_fisica', r.cantidad_fisica);
      APEX_JSON.WRITE('cantidad_sistema', r.cantidad_sistema);
      APEX_JSON.WRITE('cant_diferencia', r.cant_diferencia);
      APEX_JSON.WRITE('cerrado', r.cerrado);
      APEX_JSON.WRITE('rubro', r.rubro);
      APEX_JSON.WRITE('marca', r.marca);
      APEX_JSON.WRITE('es_activo', r.es_activo);
      APEX_JSON.WRITE('cod_iva', r.cod_iva);
      APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
      APEX_JSON.WRITE('fec_ultima_compra', r.fec_ultima_compra);
      APEX_JSON.WRITE('tiene_foto', r.tiene_foto);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- AJUSTAR (proceso de la pag 88, atomico)
  --------------------------------------------------------------------------
  PROCEDURE AJUSTAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_id_inventario IN NUMBER,
      p_id_articulo   IN NUMBER,
      p_cantidad      IN NUMBER,
      p_precio        IN NUMBER,
      p_cod_iva       IN NUMBER) IS
    l_usuario    VARCHAR2(255);
    l_nro        NUMBER;
    l_id_factura NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cod_empresa IS NULL OR p_id_inventario IS NULL OR p_id_articulo IS NULL
       OR p_cantidad IS NULL OR p_precio IS NULL THEN
      p_error(400, 'Bad Request',
              'cod_empresa, id_inventario, id_articulo, cantidad y precio son obligatorios');
      RETURN;
    END IF;

    -- 1) Siguiente numero de comprobante AJS/E (algoritmo de huecos del APEX).
    BEGIN
      SELECT MIN(p.nro_comprobante)
        INTO l_nro
        FROM compras_cabecera p
       WHERE (NVL(p.nro_comprobante, 0) + 1) NOT IN
             (SELECT p1.nro_comprobante
                FROM compras_cabecera p1
               WHERE p1.cod_empresa = p.cod_empresa
                 AND p1.tip_comprobante = p.tip_comprobante
                 AND p1.ser_timbrado = p.ser_timbrado)
         AND p.cod_empresa = p_cod_empresa
         AND p.tip_comprobante = 'AJS'
         AND p.ser_timbrado = 'E';
      l_nro := NVL(l_nro, 0) + 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        l_nro := 1;
    END;

    -- 2) Cabecera del comprobante de ajuste (valores fijos del APEX).
    INSERT INTO compras_cabecera (tip_comprobante, ser_timbrado, nro_timbrado,
                                  nro_comprobante, fec_comprobante, cod_persona,
                                  cod_moneda, tip_cambio, cod_empresa, tipo_compra,
                                  id_condicion, fec_vencimiento, id_comprador)
    VALUES ('AJS', 'E', 1,
            l_nro, SYSDATE, 1982,
            1, 1, p_cod_empresa, NULL,
            1, SYSDATE, 81);

    -- 3) Recupera el id_factura generado y agrega el detalle.
    SELECT a.id_factura
      INTO l_id_factura
      FROM compras_cabecera a
     WHERE a.cod_empresa = p_cod_empresa
       AND a.tip_comprobante = 'AJS'
       AND a.ser_timbrado = 'E'
       AND a.nro_comprobante = l_nro;

    INSERT INTO compras_detalle (id_articulo, cantidad, id_factura, precio, cod_iva,
                                 id_cod_proveedor, cod_barra, cod_empresa, cod_persona)
    VALUES (p_id_articulo, p_cantidad, l_id_factura, p_precio, p_cod_iva,
            NULL, NULL, p_cod_empresa, 1982);

    -- 4) Cierra el conteo y 5) marca el articulo como inventariado.
    UPDATE inventario
       SET cerrado = 'S'
     WHERE cod_empresa = p_cod_empresa
       AND id_inventario = p_id_inventario;

    UPDATE articulos
       SET fecha_ultimo_inventario = SYSDATE
     WHERE cod_empresa = p_cod_empresa
       AND id_articulo = p_id_articulo;

    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Ajuste aplicado (comprobante AJS-E ' || l_nro || ')');
    APEX_JSON.WRITE('id_factura', l_id_factura);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END AJUSTAR;

  --------------------------------------------------------------------------
  -- DIF_CERO (boton "Ajustar Diferencias 0" de la pag 87)
  --------------------------------------------------------------------------
  PROCEDURE DIF_CERO(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_n       PLS_INTEGER := 0;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    FOR ar IN (
        SELECT m.id_inventario, m.id_articulo
          FROM inventario m
          JOIN articulos a
                ON a.cod_empresa = m.cod_empresa
               AND a.id_articulo = m.id_articulo
         WHERE m.cod_empresa = p_cod_empresa
           AND m.id_inventario = (SELECT MAX(b.id_inventario)
                                    FROM inventario b
                                   WHERE b.cod_empresa = m.cod_empresa
                                     AND b.id_articulo = m.id_articulo)
           AND NVL(m.cantidad_fisica, 0) - NVL(m.cantidad_sistema, 0) = 0
           AND NVL(m.cerrado, 'N') = 'N'
    ) LOOP
      UPDATE inventario
         SET cerrado = 'S'
       WHERE cod_empresa = p_cod_empresa
         AND id_inventario = ar.id_inventario;

      UPDATE articulos
         SET fecha_ultimo_inventario = SYSDATE
       WHERE cod_empresa = p_cod_empresa
         AND id_articulo = ar.id_articulo;

      l_n := l_n + 1;
    END LOOP;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Se cerraron ' || l_n || ' conteos con diferencia 0');
    APEX_JSON.WRITE('cerrados', l_n);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END DIF_CERO;

  --------------------------------------------------------------------------
  -- SERVIR_FOTO (publico; MIME por magic bytes del blob)
  --------------------------------------------------------------------------
  PROCEDURE SERVIR_FOTO(
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER) IS
    l_foto  BLOB;
    l_head  RAW(12);
    l_mime  VARCHAR2(50) := 'image/jpeg';
  BEGIN
    SELECT foto
      INTO l_foto
      FROM inventario
     WHERE id_inventario = p_id_inventario
       AND cod_empresa = p_cod_empresa;

    IF l_foto IS NULL OR DBMS_LOB.GETLENGTH(l_foto) = 0 THEN
      OWA_UTIL.STATUS_LINE(404, 'Not Found', TRUE);
      RETURN;
    END IF;

    l_head := DBMS_LOB.SUBSTR(l_foto, 12, 1);
    IF UTL_RAW.SUBSTR(l_head, 1, 3) = HEXTORAW('FFD8FF') THEN
      l_mime := 'image/jpeg';
    ELSIF UTL_RAW.SUBSTR(l_head, 1, 8) = HEXTORAW('89504E470D0A1A0A') THEN
      l_mime := 'image/png';
    ELSIF UTL_RAW.SUBSTR(l_head, 1, 4) = HEXTORAW('52494646') THEN
      l_mime := 'image/webp';
    ELSIF UTL_RAW.SUBSTR(l_head, 1, 3) = HEXTORAW('474946') THEN
      l_mime := 'image/gif';
    END IF;

    OWA_UTIL.MIME_HEADER(l_mime, FALSE);
    HTP.P('Content-Length: ' || DBMS_LOB.GETLENGTH(l_foto));
    OWA_UTIL.HTTP_HEADER_CLOSE;
    WPG_DOCLOAD.DOWNLOAD_FILE(l_foto);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      OWA_UTIL.STATUS_LINE(404, 'Not Found', TRUE);
    WHEN OTHERS THEN
      OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', TRUE);
  END SERVIR_FOTO;

END PKG_AJUSTAR_INV_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario-ajustes', 'GET');            EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario-ajustes/aplicar', 'POST');   EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario-ajustes/dif-cero', 'POST');  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/:id/foto', 'GET');           EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- GET /inventario-ajustes?cod_empresa=:n  -> listar
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario-ajustes',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario-ajustes',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);
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
    PKG_AJUSTAR_INV_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario-ajustes', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /inventario-ajustes/aplicar  -> ajustar un articulo (modal 88)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario-ajustes/aplicar',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario-ajustes/aplicar',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_AJUSTAR_INV_LUBRIMEC.AJUSTAR(
        p_token         => l_token,
        p_cod_empresa   => TO_NUMBER(:cod_empresa),
        p_id_inventario => TO_NUMBER(:id_inventario),
        p_id_articulo   => TO_NUMBER(:id_articulo),
        p_cantidad      => TO_NUMBER(:cantidad),
        p_precio        => TO_NUMBER(:precio),
        p_cod_iva       => TO_NUMBER(:cod_iva));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario-ajustes/aplicar', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /inventario-ajustes/dif-cero  -> cerrar todos los conteos con dif 0
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario-ajustes/dif-cero',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario-ajustes/dif-cero',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_AJUSTAR_INV_LUBRIMEC.DIF_CERO(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario-ajustes/dif-cero', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /inventario/:id/foto  -> BLOB de la foto (PUBLICO, para <img>)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario/:id/foto',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/:id/foto',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_qs VARCHAR2(4000);
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
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_AJUSTAR_INV_LUBRIMEC.SERVIR_FOTO(
        p_id_inventario => TO_NUMBER(:id),
        p_cod_empresa   => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  -- Sin DEFINE_PARAMETER de Authorization: el endpoint es publico a proposito
  -- (el <img> del navegador no manda el header).

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
