--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Compras Vs Ventas (pagina APEX 75).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Devuelve DOS datasets (compras y ventas) del anio pedido; el front filtra por
-- mes/activo (facetas) y calcula la ganancia = SUM(rentabilidad) - SUM(total
-- compras). Un solo request para ambas grillas.
--
--   GET /ords/josegalvez/lubrimec/compras-vs-ventas?cod_empresa=24&anio=2026
--       -> { success, anios:[...], compras:[...], ventas:[...] }
--
-- Compras: COMPRAS_ARTICULOS, tip_comprobante != 'FCR'. Ventas: VENTAS_ARTICULOS.
-- rentabilidad = decode(id_rubro,30,total,rentabilidad) (rubro 30 = gasto: la
-- rentabilidad es el total). anios = lista de anios con compras o ventas (para
-- la faceta Anio). Sin anio se usa el actual.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-vs-ventas', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-vs-ventas',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'compras-vs-ventas',
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
    l_anio        := get_qs(l_query, 'anio');
    IF l_cod_empresa IS NULL THEN l_cod_empresa := '24'; END IF;
    IF l_anio IS NULL THEN l_anio := TO_CHAR(SYSDATE, 'yyyy'); END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('anio', l_anio);

    -- Lista de anios con compras o ventas (para la faceta Anio).
    APEX_JSON.OPEN_ARRAY('anios');
    FOR r IN (
        SELECT anio FROM (
            SELECT DISTINCT TO_CHAR(fec_comprobante, 'yyyy') anio
              FROM compras_cabecera WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
            UNION
            SELECT DISTINCT TO_CHAR(fec_comprobante, 'yyyy')
              FROM ventas_cabecera WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
        ) WHERE anio IS NOT NULL
        ORDER BY anio DESC
    ) LOOP
        APEX_JSON.WRITE(r.anio);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Compras del anio (tip_comprobante != 'FCR').
    APEX_JSON.OPEN_ARRAY('compras');
    FOR r IN (
        SELECT id_articulo, referencia, proveedor,
               TO_CHAR(fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               descripcion, cantidad, precio, total, es_activo
          FROM compras_articulos
         WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
           AND TO_CHAR(fec_comprobante, 'yyyy') = l_anio
           AND tip_comprobante NOT IN ('FCR')
         ORDER BY fec_comprobante DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('referencia', r.referencia);
        APEX_JSON.WRITE('proveedor', r.proveedor);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('precio', r.precio);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('es_activo', r.es_activo);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Ventas del anio.
    APEX_JSON.OPEN_ARRAY('ventas');
    FOR r IN (
        SELECT id_articulo, descripcion,
               TO_CHAR(fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               costo_ultimo,
               DECODE(id_rubro, 30, total, rentabilidad) rentabilidad,
               cantidad, precio, total,
               NVL(costo_ultimo, 0) * NVL(cantidad, 0) total_costo
          FROM ventas_articulos
         WHERE cod_empresa = TO_NUMBER(l_cod_empresa)
           AND TO_CHAR(fec_comprobante, 'yyyy') = l_anio
         ORDER BY fec_comprobante DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
        APEX_JSON.WRITE('rentabilidad', r.rentabilidad);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('precio', r.precio);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('total_costo', r.total_costo);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-vs-ventas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
