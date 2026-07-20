--------------------------------------------------------------------------------
-- COBROS CON TARJETA pendientes de acreditar (dashboard) — endpoints ORDS.
--
-- Panel del dashboard: lista los cobros con tarjeta/transferencia (id_forma
-- 41, 42, 21) que todavia NO fueron acreditados por el banco, y permite cargar
-- el monto acreditado (marca IND_ACREDITADO = 'S').
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md): cada handler ejecuta directamente
-- su logica, sin paquete (modelo: ORDS_VENTAS_DASHBOARD.sql). Bind del header
-- Authorization OBLIGATORIO. Responde el contrato uniforme { success, message?, data? }.
--
--   GET /ords/josegalvez/lubrimec/cobros-tarjeta?cod_empresa=24
--       -> pendientes de acreditar: data: [{ id_cobro, fecha_cobro, desc_forma, total }]
--   PUT /ords/josegalvez/lubrimec/cobros-tarjeta/:id
--       body { monto_acreditado } -> marca acreditado y guarda el monto
--
-- Objetos usados (ya existentes): vista V_COBROS_CLIENTES, tabla VENTAS_COBROS.
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente (permite re-ejecutar el script).
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'cobros-tarjeta',     'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'cobros-tarjeta/:id', 'PUT'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /cobros-tarjeta
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'cobros-tarjeta',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- GET /cobros-tarjeta -> cobros con tarjeta pendientes de acreditar
  ----------------------------------------------------------------------------
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'cobros-tarjeta',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);

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
    HTP.P('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
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
    l_cod_empresa := NVL(get_qs(l_query, 'cod_empresa'), '24');

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT id_cobro,
               TO_CHAR(fecha_cobro, 'YYYY-MM-DD') fecha_cobro,
               desc_forma,
               total
          FROM v_cobros_clientes
         WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
           AND id_forma IN (41, 42, 21)
           AND NVL(ind_acreditado, 'N') = 'N'
         ORDER BY fecha_cobro DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_cobro', r.id_cobro);
        APEX_JSON.WRITE('fecha_cobro', r.fecha_cobro);
        APEX_JSON.WRITE('desc_forma', r.desc_forma);
        APEX_JSON.WRITE('total', NVL(r.total, 0));
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
      p_pattern            => 'cobros-tarjeta',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /cobros-tarjeta/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'cobros-tarjeta/:id',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- PUT /cobros-tarjeta/:id -> acreditar: marca IND_ACREDITADO y guarda el monto
  ----------------------------------------------------------------------------
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'cobros-tarjeta/:id',
      p_method      => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token           VARCHAR2(256);
    l_usuario         VARCHAR2(255);
    l_pos             PLS_INTEGER;
    l_id_cobro        NUMBER;
    l_monto           NUMBER;
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

    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(l_token);
    IF l_usuario IS NULL THEN
        OWA_UTIL.STATUS_LINE(401, 'Unauthorized', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_id_cobro := TO_NUMBER(:id);
    l_monto    := TO_NUMBER(:monto_acreditado);

    IF l_monto IS NULL THEN
        OWA_UTIL.STATUS_LINE(400, 'Bad Request', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'El monto acreditado es obligatorio');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    UPDATE ventas_cobros
       SET ind_acreditado  = 'S',
           monto_acreditado = l_monto
     WHERE id_cobro = l_id_cobro;

    IF SQL%ROWCOUNT = 0 THEN
        ROLLBACK;
        OWA_UTIL.STATUS_LINE(404, 'Not Found', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Cobro no encontrado');
        APEX_JSON.CLOSE_OBJECT;
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
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'cobros-tarjeta/:id',
      p_method             => 'PUT',
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
