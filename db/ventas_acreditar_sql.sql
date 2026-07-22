--------------------------------------------------------------------------------
-- ACREDITACION DE COBROS (pagina APEX 111) — paquete + endpoints ORDS.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- Lista los cobros de formas bancarias (cheques/transferencias: id_forma
-- 41, 42, 21) todavia NO acreditados (NVL(IND_ACREDITADO,'N') = 'N') desde
-- V_COBROS_CLIENTES, y permite marcarlos como acreditados:
--   UPDATE ventas_cobros SET ind_acreditado='S', monto_acreditado=:monto
--    WHERE id_cobro=:id
--
-- === 1) PAQUETE PKG_VENTAS_ACREDITAR_LUBRIMEC ==============================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_VENTAS_ACREDITAR_LUBRIMEC AS

  PROCEDURE LISTAR_PENDIENTES(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE ACREDITAR(
      p_token IN VARCHAR2, p_id_cobro IN NUMBER, p_monto_acreditado IN NUMBER);

END PKG_VENTAS_ACREDITAR_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_VENTAS_ACREDITAR_LUBRIMEC AS

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
  -- LISTAR_PENDIENTES (cobros bancarios sin acreditar, pagina 111)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR_PENDIENTES(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
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
        SELECT fecha_cobro, desc_forma, total, id_cobro
          FROM v_cobros_clientes
         WHERE cod_empresa = p_cod_empresa
           AND id_forma IN (41, 42, 21)
           AND NVL(ind_acreditado, 'N') = 'N'
         ORDER BY fecha_cobro DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_cobro', r.id_cobro);
      APEX_JSON.WRITE('fecha_cobro', r.fecha_cobro);
      APEX_JSON.WRITE('desc_forma', r.desc_forma);
      APEX_JSON.WRITE('total', r.total);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR_PENDIENTES;

  --------------------------------------------------------------------------
  -- ACREDITAR (marca el cobro como acreditado con su monto)
  --------------------------------------------------------------------------
  PROCEDURE ACREDITAR(
      p_token IN VARCHAR2, p_id_cobro IN NUMBER, p_monto_acreditado IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_id_cobro IS NULL THEN
      p_error(400, 'Bad Request', 'El cobro es obligatorio'); RETURN;
    END IF;
    IF p_monto_acreditado IS NULL THEN
      p_error(400, 'Bad Request', 'El monto acreditado es obligatorio'); RETURN;
    END IF;

    UPDATE ventas_cobros
       SET ind_acreditado  = 'S',
           monto_acreditado = p_monto_acreditado
     WHERE id_cobro = p_id_cobro;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Cobro no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Cobro acreditado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACREDITAR;

END PKG_VENTAS_ACREDITAR_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET /lubrimec/cobros-acreditar?cod_empresa=:n        -> pendientes
--   PUT /lubrimec/cobros-acreditar/:id                   -> acreditar
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'cobros-acreditar', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'cobros-acreditar/:id', 'PUT'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- /cobros-acreditar  (GET pendientes)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'cobros-acreditar',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'cobros-acreditar', p_method => 'GET',
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
    HTP.P('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    PKG_VENTAS_ACREDITAR_LUBRIMEC.LISTAR_PENDIENTES(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'cobros-acreditar', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /cobros-acreditar/:id  (PUT acreditar)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'cobros-acreditar/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'cobros-acreditar/:id', p_method => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_VENTAS_ACREDITAR_LUBRIMEC.ACREDITAR(
        p_token => l_token, p_id_cobro => TO_NUMBER(:id),
        p_monto_acreditado => TO_NUMBER(:monto_acreditado));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'cobros-acreditar/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
