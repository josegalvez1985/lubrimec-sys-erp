--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Aguinaldos (pag APEX 104).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Compras de los articulos 317 y 342 (aguinaldo), agrupadas por persona +
-- comprobante + articulo. total_aguinaldo = total / 12 (provision mensual).
-- Facetas Año/Nombre/Concepto y busqueda: 100% en el front.
--
--   GET /ords/josegalvez/lubrimec/aguinaldos?cod_empresa=24
--       -> data: [{ nombre, fec_comprobante, total, descripcion, anio, total_aguinaldo }]
--
-- La query original de APEX no filtraba por cod_empresa (bug heredado: sumaba
-- de todas las empresas). Aca se agrega el filtro por cod_empresa, coherente
-- con el resto del sistema (multiempresa).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'aguinaldos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'aguinaldos',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'aguinaldos',
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
        SELECT c.nombre,
               TO_CHAR(a.fec_comprobante, 'DD/MM/YYYY') AS fec_comprobante,
               SUM(NVL(b.cantidad, 0) * NVL(b.precio, 0)) AS total,
               d.descripcion,
               TO_CHAR(a.fec_comprobante, 'YYYY') AS anio,
               SUM(NVL(b.cantidad, 0) * NVL(b.precio, 0)) / 12 AS total_aguinaldo
          FROM compras_cabecera a, compras_detalle b, personas c, articulos d
         WHERE a.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND b.cod_empresa = a.cod_empresa
           AND a.id_factura = b.id_factura
           AND c.cod_empresa = a.cod_empresa
           AND c.cod_persona = a.cod_persona
           AND d.cod_empresa = a.cod_empresa
           AND d.id_articulo = b.id_articulo
           AND d.id_articulo IN (317, 342)
         GROUP BY c.nombre, a.fec_comprobante, d.descripcion
         ORDER BY a.fec_comprobante DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('nombre', r.nombre);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('anio', r.anio);
        APEX_JSON.WRITE('total_aguinaldo', r.total_aguinaldo);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'aguinaldos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
