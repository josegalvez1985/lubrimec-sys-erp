--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Pagos a Proveedores por Ventas (pag APEX 103).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Por cada articulo vendido en el mes, si ese articulo fue comprado a un
-- proveedor con una factura de compra (FCR) todavia con saldo pendiente
-- (pkg_compras.fn_saldo_proveedor = 'S'), suma cantidad_vendida * costo_ultimo.
-- Sirve para saber cuanto de lo vendido corresponde pagarle al proveedor.
--
-- La query original de APEX tenia el mes hardcodeado ('12/2024'); aca se recibe
-- como parametro (anio/mes), default: mes actual.
--
--   GET /ords/josegalvez/lubrimec/pagos-proveedores-ventas?cod_empresa=24&anio=2026&mes=07
--       -> { success, anio, mes, data: [{ id_articulo, descripcion, nombre, total }] }
--
-- fn_saldo_proveedor se evalua una vez por factura de compra (CTE), no una vez
-- por fila del detalle de ventas.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'pagos-proveedores-ventas', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'pagos-proveedores-ventas',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'pagos-proveedores-ventas',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_anio        VARCHAR2(4);
    l_mes         VARCHAR2(2);
    l_mes_anio    VARCHAR2(7);

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
    l_anio := get_qs(l_query, 'anio');
    IF l_anio IS NULL THEN l_anio := TO_CHAR(SYSDATE, 'YYYY'); END IF;
    l_mes  := get_qs(l_query, 'mes');
    IF l_mes IS NULL THEN l_mes := TO_CHAR(SYSDATE, 'MM'); END IF;
    l_mes_anio := l_mes || '/' || l_anio;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('anio', l_anio);
    APEX_JSON.WRITE('mes', l_mes);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        WITH compras_con_saldo AS (
            SELECT cc.id_factura, cc.cod_persona
              FROM compras_cabecera cc
             WHERE cc.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND cc.tip_comprobante = 'FCR'
               AND PKG_COMPRAS.FN_SALDO_PROVEEDOR(cc.cod_empresa, cc.id_factura) = 'S'
        ),
        articulos_con_saldo AS (
            SELECT DISTINCT d.id_articulo, cs.cod_persona
              FROM compras_detalle d
              JOIN compras_con_saldo cs ON cs.id_factura = d.id_factura
             WHERE d.cod_empresa = TO_NUMBER(l_cod_empresa)
        )
        SELECT vd.id_articulo,
               a.descripcion,
               p.nombre,
               SUM(NVL(vd.cantidad, 0) * NVL(PKG_COMPRAS.FN_COSTO_ULTIMO(vd.id_articulo, vc.cod_empresa), 0)) AS total
          FROM ventas_cabecera vc
          JOIN ventas_detalle vd ON vd.id_factura = vc.id_factura
          JOIN articulos a ON a.cod_empresa = vc.cod_empresa AND a.id_articulo = vd.id_articulo
          JOIN articulos_con_saldo acs ON acs.id_articulo = vd.id_articulo
          JOIN personas p ON p.cod_empresa = vc.cod_empresa AND p.cod_persona = acs.cod_persona
         WHERE vc.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND TO_CHAR(vc.fec_comprobante, 'mm/yyyy') = l_mes_anio
         GROUP BY vd.id_articulo, a.descripcion, p.nombre
         ORDER BY a.descripcion
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('nombre', r.nombre);
        APEX_JSON.WRITE('total', r.total);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'pagos-proveedores-ventas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
