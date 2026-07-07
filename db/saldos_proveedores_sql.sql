--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Saldos de Proveedores (pagina APEX 79).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Reporte con busqueda facetada: el backend devuelve todo el dataset (UNION de
-- facturas de compra FCR con su total y sus pagos) y el filtrado (busqueda +
-- facetas Cliente/Factura/Saldo) es 100% en el front (como pag 55/56/57).
--
--   GET /ords/josegalvez/lubrimec/saldos-proveedores?cod_empresa=24
--       -> data: [{ nro_factura, fec_comprobante, nombre, total_factura,
--                   fec_pago, fec_proximo_pago, forma_pago, total_pago,
--                   id_factura, saldo }]
--
-- saldo = pkg_compras.fn_saldo_proveedor (S/N). fec_proximo_pago =
-- pkg_compras.fn_fecha_pago. El resumen (saldo total pendiente = SUM(total_
-- factura) - SUM(total_pago)) lo calcula el front.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'saldos-proveedores', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'saldos-proveedores',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'saldos-proveedores',
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
        SELECT nro_factura,
               TO_CHAR(fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               nombre, total_factura,
               TO_CHAR(fec_pago, 'YYYY-MM-DD') fec_pago,
               TO_CHAR(PKG_COMPRAS.FN_FECHA_PAGO(TO_NUMBER(l_cod_empresa), id_factura),
                       'YYYY-MM-DD') fec_proximo_pago,
               forma_pago, total_pago, id_factura,
               PKG_COMPRAS.FN_SALDO_PROVEEDOR(TO_NUMBER(l_cod_empresa), id_factura) saldo
          FROM (
            SELECT a.ser_timbrado || '-' || a.nro_comprobante nro_factura,
                   a.fec_comprobante, b.nombre,
                   SUM(NVL(c.cantidad, 0) * NVL(c.precio, 0)) total_factura,
                   CAST(NULL AS DATE) fec_pago, CAST(NULL AS VARCHAR2(100)) forma_pago,
                   0 total_pago, a.id_factura
              FROM compras_cabecera a, personas b, compras_detalle c
             WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND a.tip_comprobante = 'FCR'
               AND a.cod_persona = b.cod_persona
               AND c.id_factura = a.id_factura
             GROUP BY a.ser_timbrado, a.nro_comprobante, a.fec_comprobante, b.nombre, a.id_factura
            UNION ALL
            SELECT a.ser_timbrado || '-' || a.nro_comprobante,
                   a.fec_comprobante, b.nombre, 0 total_factura,
                   d.fecha, e.descripcion, NVL(d.monto, 0) total_pago, a.id_factura
              FROM compras_cabecera a, personas b, compras_pagos d, forma_cobro_pago e
             WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND a.tip_comprobante = 'FCR'
               AND a.cod_empresa = b.cod_empresa
               AND a.cod_persona = b.cod_persona
               AND d.cod_empresa = a.cod_empresa
               AND d.id_factura = a.id_factura
               AND e.id_forma = d.id_forma
            ORDER BY 2 ASC
          )
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('nro_factura', r.nro_factura);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('nombre', r.nombre);
        APEX_JSON.WRITE('total_factura', r.total_factura);
        APEX_JSON.WRITE('fec_pago', r.fec_pago);
        APEX_JSON.WRITE('fec_proximo_pago', r.fec_proximo_pago);
        APEX_JSON.WRITE('forma_pago', r.forma_pago);
        APEX_JSON.WRITE('total_pago', r.total_pago);
        APEX_JSON.WRITE('id_factura', r.id_factura);
        APEX_JSON.WRITE('saldo', r.saldo);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'saldos-proveedores', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
