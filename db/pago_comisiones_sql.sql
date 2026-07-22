--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Pago de Comisiones (pag APEX 101).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Fuente: VENTAS_ARTICULOS (misma vista de la pag 54 "Ventas Por Articulos").
-- Como es una vista pesada, el backend exige anio (default: anio actual) y
-- acepta mes opcional; el resto de filtros (semana, rubro, vendedor, busqueda)
-- se resuelven 100% en el front sobre ese subconjunto (patron "reporte facetado").
--
--   GET /ords/josegalvez/lubrimec/comisiones?cod_empresa=24&anio=2026&mes=07
--       -> { success, anio, data: [{ descripcion, total, fec_comprobante,
--            fec_comprobante_filtro, mes_anio, cantidad, precio, anio, mes,
--            semana, vendedor, porc_comision, comision, rubro }] }
--
-- Regla de comision (igual que en APEX): 50% si id_marca = 93, 10% el resto.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'comisiones', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'comisiones',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'comisiones',
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

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('anio', l_anio);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT va.descripcion,
               va.total,
               TO_CHAR(va.fec_comprobante, 'DD/MM/YYYY HH24:MI') AS fec_comprobante,
               TO_CHAR(va.fec_comprobante, 'DD/MM/YYYY')         AS fec_comprobante_filtro,
               va.mes_anio,
               va.cantidad,
               va.precio,
               TO_CHAR(va.fec_comprobante, 'YYYY')               AS anio,
               INITCAP(TRIM(TO_CHAR(va.fec_comprobante, 'Month', 'NLS_DATE_LANGUAGE=SPANISH'))) AS mes,
               TO_CHAR(va.fec_comprobante, 'WW')                 AS semana,
               va.vendedor,
               DECODE(va.id_marca, 93, 50, 10)                   AS porc_comision,
               (DECODE(va.id_marca, 93, 50, 10) / 100) * NVL(va.cantidad, 0) * NVL(va.precio, 0) AS comision,
               va.rubro
          FROM ventas_articulos va
         WHERE va.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND TO_CHAR(va.fec_comprobante, 'YYYY') = l_anio
           AND (l_mes IS NULL OR TO_CHAR(va.fec_comprobante, 'MM') = l_mes)
         ORDER BY va.fec_comprobante DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('fec_comprobante_filtro', r.fec_comprobante_filtro);
        APEX_JSON.WRITE('mes_anio', r.mes_anio);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('precio', r.precio);
        APEX_JSON.WRITE('anio', r.anio);
        APEX_JSON.WRITE('mes', r.mes);
        APEX_JSON.WRITE('semana', r.semana);
        APEX_JSON.WRITE('vendedor', r.vendedor);
        APEX_JSON.WRITE('porc_comision', r.porc_comision);
        APEX_JSON.WRITE('comision', r.comision);
        APEX_JSON.WRITE('rubro', r.rubro);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'comisiones', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
