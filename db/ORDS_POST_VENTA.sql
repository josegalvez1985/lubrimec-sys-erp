--------------------------------------------------------------------------------
-- POST VENTA (pagina APEX 105) — endpoint ORDS de solo lectura (sin paquete).
--
-- Lista telefonos unicos de ventas_cabecera (con nro_telefono cargado), con la
-- fecha del comprobante. Normaliza el telefono a '+5959' || ultimos 8 digitos.
-- Modelo plano de solo lectura (ver db/ORDS_VENTAS_DASHBOARD.sql).
--
--   GET /ords/josegalvez/lubrimec/post-venta?cod_empresa=24&q=texto
--       -> data: [{ nro_telefono, fecha }]  (fecha en YYYY-MM-DD)
--
-- cod_empresa obligatorio. q opcional (filtra por telefono, "contiene").
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'post-venta', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'post-venta',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'post-venta',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_q           VARCHAR2(4000);
    l_like        VARCHAR2(400);

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
    l_q           := get_qs(l_query, 'q');
    l_like        := '%' || UPPER(TRIM(l_q)) || '%';

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    -- Una fila por telefono + fecha (igual al reporte APEX: GROUP BY telefono, fecha).
    FOR r IN (
        SELECT '+5959' || SUBSTR(a.nro_telefono, -8)      AS nro_telefono,
               MAX(a.fec_comprobante)                     AS fecha
          FROM ventas_cabecera a
         WHERE a.nro_telefono IS NOT NULL
           AND a.cod_empresa = TO_NUMBER(l_cod_empresa)
         GROUP BY '+5959' || SUBSTR(a.nro_telefono, -8),
                  TO_CHAR(a.fec_comprobante, 'YYYY-MM-DD')
        HAVING (
                 TRIM(l_q) IS NULL
                 OR UPPER('+5959' || SUBSTR(MAX(a.nro_telefono), -8)) LIKE l_like
               )
         ORDER BY fecha DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('nro_telefono', r.nro_telefono);
        APEX_JSON.WRITE('fecha', TO_CHAR(r.fecha, 'YYYY-MM-DD'));
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
      p_pattern            => 'post-venta',
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
