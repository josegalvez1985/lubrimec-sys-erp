--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Comisiones al Banco (pag APEX 114).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Cobros de ventas con formas de pago con comision bancaria (id_forma 41, 42,
-- 21): comision_banco = total - monto_acreditado. Facetas Año/Mes/Fecha/Forma
-- de Pago y busqueda: 100% en el front.
--
--   GET /ords/josegalvez/lubrimec/comisiones-banco?cod_empresa=24
--       -> data: [{ id_cobro, fecha, forma_pago, total, monto_acreditado,
--                   comision_banco, porc_comision, nro_transaccion,
--                   observacion, anio, mes }]
--
-- porc_comision = comision_banco / total * 100 (NULLIF para evitar division
-- por cero cuando total = 0; en APEX el select original podia dar ORA-01476).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'comisiones-banco', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'comisiones-banco',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'comisiones-banco',
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
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado'); APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    IF l_cod_empresa IS NULL THEN l_cod_empresa := '24'; END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT vc.id_cobro,
               TO_CHAR(vc.fecha, 'YYYY-MM-DD') AS fecha,
               f.descripcion AS forma_pago,
               vc.total,
               vc.monto_acreditado,
               (vc.total - NVL(vc.monto_acreditado, 0)) AS comision_banco,
               ROUND((vc.total - NVL(vc.monto_acreditado, 0)) / NULLIF(vc.total, 0) * 100, 2) AS porc_comision,
               vc.nro_transaccion,
               vc.observacion,
               TO_CHAR(vc.fecha, 'YYYY') AS anio,
               TO_CHAR(vc.fecha, 'MM') AS mes
          FROM ventas_cobros vc
          JOIN forma_cobro_pago f ON vc.id_forma = f.id_forma
          JOIN ventas_cabecera a ON vc.id_factura = a.id_factura
         WHERE vc.id_forma IN (41, 42, 21)
           AND a.cod_empresa = TO_NUMBER(l_cod_empresa)
         ORDER BY vc.fecha DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_cobro', r.id_cobro);
        APEX_JSON.WRITE('fecha', r.fecha);
        APEX_JSON.WRITE('forma_pago', r.forma_pago);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('monto_acreditado', r.monto_acreditado);
        APEX_JSON.WRITE('comision_banco', r.comision_banco);
        APEX_JSON.WRITE('porc_comision', r.porc_comision);
        APEX_JSON.WRITE('nro_transaccion', r.nro_transaccion);
        APEX_JSON.WRITE('observacion', r.observacion);
        APEX_JSON.WRITE('anio', r.anio);
        APEX_JSON.WRITE('mes', r.mes);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM); APEX_JSON.CLOSE_OBJECT;
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'comisiones-banco', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
