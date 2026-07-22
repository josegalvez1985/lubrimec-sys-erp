--------------------------------------------------------------------------------
-- VENTAS_CABECERA (pagina APEX 60 grilla + 109 detalle articulos) — paquete +
-- endpoints ORDS. Ejecutar completo como JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- Formulario SOLO update y delete (las ventas se crean desde otro sistema).
-- PK id_factura. Multiempresa (cod_empresa).
--
-- IMPORTANTE (rutas): el base path es "ventas-cabecera", NO "ventas/:id",
-- porque ya existen plantillas fijas ventas/anios|meses|por-dia (dashboard) y
-- ventas/buscar (cobros) con prioridad 0: un ventas/:id las capturaria.
--
-- LISTAR: filtros opcionales fecha_desde/fecha_hasta (YYYY-MM-DD). Sin filtros
-- carga el ULTIMO DIA con ventas y lo informa en fecha_default (mismo patron
-- que ORDS_VENTAS_ARTICULOS). JOIN a PERSONAS (cliente) y VENDEDORES (nombre).
-- ACTUALIZAR: solo los campos editables de la pagina 60 (tip_comprobante,
-- nro_comprobante, fec_comprobante, cod_persona, cod_vendedor, nro_telefono).
-- ELIMINAR: los cobros caen en cascada (FK ON DELETE CASCADE); si el detalle
-- bloquea (-2292) responde 409.
-- DETALLE: lineas de VENTAS_DETALLE de la factura (pagina 109) con descripcion
-- del articulo y total = cantidad * precio.
-- GUARDAR_DETALLE (upsert): nro_linea NULL = insertar (nro_linea = MAX+1 de la
-- factura, cod_iva copiado de ARTICULOS); con nro_linea = actualizar la linea.
-- ELIMINAR_DETALLE: borra una linea por (id_factura, nro_linea).
--
-- === 1) PAQUETE PKG_VENTAS_LUBRIMEC ========================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_VENTAS_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_fecha_desde IN VARCHAR2, p_fecha_hasta IN VARCHAR2);
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_nro_comprobante IN NUMBER,
      p_fec_comprobante IN VARCHAR2, p_cod_persona IN NUMBER,
      p_cod_vendedor IN NUMBER, p_nro_telefono IN VARCHAR2);
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER);
  PROCEDURE DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER);
  PROCEDURE GUARDAR_DETALLE(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER,
      p_id_articulo IN NUMBER, p_cantidad IN NUMBER, p_precio IN NUMBER,
      p_descuento IN NUMBER);
  PROCEDURE ELIMINAR_DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER);

END PKG_VENTAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_VENTAS_LUBRIMEC AS

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
  -- LISTAR
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_fecha_desde IN VARCHAR2, p_fecha_hasta IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_desde   DATE := NULL;
    l_hasta   DATE := NULL;
    l_default VARCHAR2(10) := NULL;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_fecha_desde IS NOT NULL THEN
      l_desde := TO_DATE(p_fecha_desde, 'YYYY-MM-DD');
    END IF;
    IF p_fecha_hasta IS NOT NULL THEN
      l_hasta := TO_DATE(p_fecha_hasta, 'YYYY-MM-DD');
    END IF;

    -- Default: sin filtros de fecha se carga el ultimo dia con ventas
    IF l_desde IS NULL AND l_hasta IS NULL THEN
      BEGIN
        SELECT MAX(TRUNC(fec_comprobante))
          INTO l_desde
          FROM ventas_cabecera
         WHERE cod_empresa = p_cod_empresa;
      EXCEPTION WHEN OTHERS THEN l_desde := NULL; END;
      l_hasta   := l_desde;
      l_default := TO_CHAR(l_desde, 'YYYY-MM-DD');
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    IF l_default IS NOT NULL THEN
      APEX_JSON.WRITE('fecha_default', l_default);
    END IF;
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT b.id_factura, b.tip_comprobante, b.ser_timbrado, b.nro_timbrado,
               b.nro_comprobante,
               TO_CHAR(b.fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               b.cod_persona,
               NVL(pe.nombre_fantasia, pe.nombre) AS nombre_cliente,
               b.cod_moneda, b.tip_cambio, b.estado, b.id_talonario,
               b.cod_vendedor, ve.nombre AS nombre_vendedor, b.nro_telefono
          FROM ventas_cabecera b
          LEFT JOIN personas pe ON pe.cod_persona = b.cod_persona
                                AND pe.cod_empresa = b.cod_empresa
          LEFT JOIN vendedores ve ON ve.cod_vendedor = b.cod_vendedor
         WHERE b.cod_empresa = p_cod_empresa
           AND (l_desde IS NULL OR TRUNC(b.fec_comprobante) >= l_desde)
           AND (l_hasta IS NULL OR TRUNC(b.fec_comprobante) <= l_hasta)
         ORDER BY b.id_factura DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_factura', r.id_factura);
      APEX_JSON.WRITE('tip_comprobante', r.tip_comprobante);
      APEX_JSON.WRITE('ser_timbrado', r.ser_timbrado);
      APEX_JSON.WRITE('nro_timbrado', r.nro_timbrado);
      APEX_JSON.WRITE('nro_comprobante', r.nro_comprobante);
      APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
      APEX_JSON.WRITE('cod_persona', r.cod_persona);
      APEX_JSON.WRITE('nombre_cliente', r.nombre_cliente);
      APEX_JSON.WRITE('cod_moneda', r.cod_moneda);
      APEX_JSON.WRITE('tip_cambio', r.tip_cambio);
      APEX_JSON.WRITE('estado', r.estado);
      APEX_JSON.WRITE('id_talonario', r.id_talonario);
      APEX_JSON.WRITE('cod_vendedor', r.cod_vendedor);
      APEX_JSON.WRITE('nombre_vendedor', r.nombre_vendedor);
      APEX_JSON.WRITE('nro_telefono', r.nro_telefono);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR (solo campos editables de la pagina 60)
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_nro_comprobante IN NUMBER,
      p_fec_comprobante IN VARCHAR2, p_cod_persona IN NUMBER,
      p_cod_vendedor IN NUMBER, p_nro_telefono IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_fecha   DATE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_tip_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'El tipo de comprobante es obligatorio'); RETURN;
    END IF;
    IF p_nro_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'El nro de comprobante es obligatorio'); RETURN;
    END IF;
    IF p_fec_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'La fecha es obligatoria'); RETURN;
    END IF;
    IF p_cod_persona IS NULL THEN
      p_error(400, 'Bad Request', 'El cliente es obligatorio'); RETURN;
    END IF;
    IF p_cod_vendedor IS NULL THEN
      p_error(400, 'Bad Request', 'El vendedor es obligatorio'); RETURN;
    END IF;
    l_fecha := TO_DATE(p_fec_comprobante, 'YYYY-MM-DD');

    UPDATE ventas_cabecera
       SET tip_comprobante = p_tip_comprobante,
           nro_comprobante = p_nro_comprobante,
           fec_comprobante = l_fecha,
           cod_persona     = p_cod_persona,
           cod_vendedor    = p_cod_vendedor,
           nro_telefono    = p_nro_telefono
     WHERE id_factura = p_id_factura
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Venta no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Venta actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Cliente o vendedor inexistente');
      ELSIF SQLCODE = -1 THEN
        p_error(409, 'Conflict', 'Ya existe una venta con esa serie/nro/fecha');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR (los cobros caen por FK ON DELETE CASCADE)
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM ventas_cabecera
     WHERE id_factura = p_id_factura
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Venta no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Venta eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: la venta tiene detalle asociado');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- DETALLE (articulos de la factura, pagina 109 — solo lectura)
  --------------------------------------------------------------------------
  PROCEDURE DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER) IS
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
        SELECT d.nro_linea, d.id_articulo,
               ar.descripcion AS descripcion_articulo,
               d.cantidad, d.precio, d.cod_iva, d.descuento,
               NVL(d.cantidad, 0) * NVL(d.precio, 0) AS total
          FROM ventas_detalle d
          LEFT JOIN articulos ar ON ar.id_articulo = d.id_articulo
         WHERE d.id_factura = p_id_factura
         ORDER BY d.nro_linea
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('nro_linea', r.nro_linea);
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion_articulo', r.descripcion_articulo);
      APEX_JSON.WRITE('cantidad', r.cantidad);
      APEX_JSON.WRITE('precio', r.precio);
      APEX_JSON.WRITE('cod_iva', r.cod_iva);
      APEX_JSON.WRITE('descuento', r.descuento);
      APEX_JSON.WRITE('total', r.total);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END DETALLE;

  --------------------------------------------------------------------------
  -- GUARDAR_DETALLE (upsert de linea). nro_linea NULL = insertar con
  -- MAX(nro_linea)+1 de la factura y cod_iva copiado del articulo.
  --------------------------------------------------------------------------
  PROCEDURE GUARDAR_DETALLE(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER,
      p_id_articulo IN NUMBER, p_cantidad IN NUMBER, p_precio IN NUMBER,
      p_descuento IN NUMBER) IS
    l_usuario   VARCHAR2(255);
    l_nro_linea ventas_detalle.nro_linea%TYPE := p_nro_linea;
    l_cod_iva   articulos.cod_iva%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_id_factura IS NULL THEN
      p_error(400, 'Bad Request', 'La factura es obligatoria'); RETURN;
    END IF;
    IF p_id_articulo IS NULL THEN
      p_error(400, 'Bad Request', 'El articulo es obligatorio'); RETURN;
    END IF;
    IF p_cantidad IS NULL THEN
      p_error(400, 'Bad Request', 'La cantidad es obligatoria'); RETURN;
    END IF;
    IF p_precio IS NULL THEN
      p_error(400, 'Bad Request', 'El precio es obligatorio'); RETURN;
    END IF;

    IF l_nro_linea IS NULL THEN
      -- Insertar: nro_linea = max+1 de la factura, cod_iva del articulo
      BEGIN
        SELECT cod_iva INTO l_cod_iva FROM articulos WHERE id_articulo = p_id_articulo;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        p_error(400, 'Bad Request', 'El articulo no existe');
        RETURN;
      END;

      SELECT NVL(MAX(nro_linea), 0) + 1
        INTO l_nro_linea
        FROM ventas_detalle
       WHERE id_factura = p_id_factura;

      INSERT INTO ventas_detalle (
          id_factura, nro_linea, id_articulo, cantidad, precio, cod_iva, descuento)
      VALUES (
          p_id_factura, l_nro_linea, p_id_articulo, p_cantidad, p_precio,
          l_cod_iva, p_descuento);
    ELSE
      -- Actualizar la linea existente (cod_iva se re-copia si cambio el articulo)
      BEGIN
        SELECT cod_iva INTO l_cod_iva FROM articulos WHERE id_articulo = p_id_articulo;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        p_error(400, 'Bad Request', 'El articulo no existe');
        RETURN;
      END;

      UPDATE ventas_detalle
         SET id_articulo = p_id_articulo,
             cantidad    = p_cantidad,
             precio      = p_precio,
             cod_iva     = l_cod_iva,
             descuento   = p_descuento
       WHERE id_factura = p_id_factura
         AND nro_linea  = p_nro_linea;

      IF SQL%ROWCOUNT = 0 THEN
        ROLLBACK;
        p_error(404, 'Not Found', 'Linea no encontrada');
        RETURN;
      END IF;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Linea guardada');
    APEX_JSON.WRITE('nro_linea', l_nro_linea);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Factura o articulo inexistente');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END GUARDAR_DETALLE;

  --------------------------------------------------------------------------
  -- ELIMINAR_DETALLE
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR_DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM ventas_detalle
     WHERE id_factura = p_id_factura
       AND nro_linea  = p_nro_linea;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Linea no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Linea eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR_DETALLE;

END PKG_VENTAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/ventas-cabecera?cod_empresa=:n[&fecha_desde&fecha_hasta]
--   PUT    /lubrimec/ventas-cabecera/:id            -> actualizar
--   DELETE /lubrimec/ventas-cabecera/:id?cod_empresa=:n -> eliminar
--   GET    /lubrimec/ventas-cabecera/:id/detalle    -> articulos de la factura
--   POST   /lubrimec/ventas-cabecera/:id/detalle    -> guardar linea (upsert:
--            nro_linea NULL en el body = insertar; con valor = actualizar)
--   DELETE /lubrimec/ventas-cabecera/:id/detalle/:nro -> eliminar linea
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas-cabecera', 'GET');             EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas-cabecera/:id', 'PUT');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas-cabecera/:id', 'DELETE');      EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas-cabecera/:id/detalle', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas-cabecera/:id/detalle', 'POST');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas-cabecera/:id/detalle/:nro', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- /ventas-cabecera  (GET listar)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
    l_desde VARCHAR2(20); l_hasta VARCHAR2(20);
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
    HTP.P('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_desde       := get_qs(l_qs, 'fecha_desde');
    l_hasta       := get_qs(l_qs, 'fecha_hasta');
    PKG_VENTAS_LUBRIMEC.LISTAR(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa),
        p_fecha_desde => l_desde, p_fecha_hasta => l_hasta);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /ventas-cabecera/:id  (PUT actualizar, DELETE eliminar)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id', p_method => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_VENTAS_LUBRIMEC.ACTUALIZAR(
        p_token => l_token, p_id_factura => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_tip_comprobante => :tip_comprobante,
        p_nro_comprobante => TO_NUMBER(:nro_comprobante),
        p_fec_comprobante => :fec_comprobante,
        p_cod_persona => TO_NUMBER(:cod_persona),
        p_cod_vendedor => TO_NUMBER(:cod_vendedor),
        p_nro_telefono => :nro_telefono);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id', p_method => 'DELETE',
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
    HTP.P('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    PKG_VENTAS_LUBRIMEC.ELIMINAR(
        p_token => l_token, p_id_factura => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /ventas-cabecera/:id/detalle  (GET articulos de la factura)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_VENTAS_LUBRIMEC.DETALLE(p_token => l_token, p_id_factura => TO_NUMBER(:id));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_VENTAS_LUBRIMEC.GUARDAR_DETALLE(
        p_token => l_token, p_id_factura => TO_NUMBER(:id),
        p_nro_linea => TO_NUMBER(:nro_linea),
        p_id_articulo => TO_NUMBER(:id_articulo),
        p_cantidad => TO_NUMBER(:cantidad),
        p_precio => TO_NUMBER(:precio),
        p_descuento => TO_NUMBER(:descuento));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /ventas-cabecera/:id/detalle/:nro  (DELETE eliminar linea)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle/:nro',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle/:nro', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_VENTAS_LUBRIMEC.ELIMINAR_DETALLE(
        p_token => l_token, p_id_factura => TO_NUMBER(:id), p_nro_linea => TO_NUMBER(:nro));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'ventas-cabecera/:id/detalle/:nro', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
