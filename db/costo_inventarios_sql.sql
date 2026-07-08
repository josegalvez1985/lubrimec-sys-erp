--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Costo de Inventarios (pag APEX 92).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Registros de INVENTARIO en un rango de fechas, con costo ultimo por articulo
-- (PKG_COMPRAS.fn_costo_ultimo) y total = costo * diferencia. Facetas Cerrado /
-- Con Diferencia y busqueda: 100% en el front.
--
--   GET /ords/josegalvez/lubrimec/inventarios/costos?cod_empresa=24&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
--       -> { success, fecha_inicio_inventario, fecha_desde, fecha_hasta,
--            data: [{ id_inventario, id_articulo, descripcion, codigo_oem, fecha,
--                     cantidad_fisica, cantidad_sistema, diferencia, con_diferencia,
--                     cerrado, costo_ultimo, total }] }
--
-- desde/hasta opcionales: default desde = parametro FECHA_INVENTARIO (inicio del
-- inventario en curso), default hasta = hoy. En APEX los binds NULL no traian
-- filas; aca el default carga el inventario en curso directamente.
-- fn_costo_ultimo se evalua una vez por fila (subquery anidada para reusar el alias).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventarios/costos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventarios/costos',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventarios/costos',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_desde_txt   VARCHAR2(20);
    l_hasta_txt   VARCHAR2(20);
    l_inicio_txt  VARCHAR2(20);
    l_desde       DATE;
    l_hasta       DATE;

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
    l_desde_txt := get_qs(l_query, 'desde');
    l_hasta_txt := get_qs(l_query, 'hasta');

    -- Inicio del inventario en curso (parametro, texto dd/mm/yyyy).
    l_inicio_txt := PKG_STOCK.FN_PARAMETRO(TO_NUMBER(l_cod_empresa), 'FECHA_INVENTARIO');

    IF l_desde_txt IS NOT NULL THEN
        l_desde := TO_DATE(l_desde_txt, 'YYYY-MM-DD');
    ELSE
        l_desde := TO_DATE(l_inicio_txt, 'dd/mm/yyyy');
    END IF;
    IF l_hasta_txt IS NOT NULL THEN
        l_hasta := TO_DATE(l_hasta_txt, 'YYYY-MM-DD');
    ELSE
        l_hasta := TRUNC(SYSDATE);
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('fecha_inicio_inventario', l_inicio_txt);
    APEX_JSON.WRITE('fecha_desde', TO_CHAR(l_desde, 'YYYY-MM-DD'));
    APEX_JSON.WRITE('fecha_hasta', TO_CHAR(l_hasta, 'YYYY-MM-DD'));
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT x.*,
               x.costo_ultimo * x.diferencia AS total
          FROM (
            SELECT i.id_inventario,
                   i.id_articulo,
                   a.descripcion,
                   NVL(a.codigo_oem, TO_CHAR(a.id_articulo)) AS codigo_oem,
                   TO_CHAR(i.fecha, 'YYYY-MM-DD') AS fecha,
                   NVL(i.cantidad_fisica, 0) AS cantidad_fisica,
                   NVL(i.cantidad_sistema, 0) AS cantidad_sistema,
                   NVL(i.cantidad_fisica, 0) - NVL(i.cantidad_sistema, 0) AS diferencia,
                   DECODE(NVL(i.cantidad_fisica, 0) - NVL(i.cantidad_sistema, 0), 0, 'No', 'Si') AS con_diferencia,
                   NVL(i.cerrado, 'N') AS cerrado,
                   PKG_COMPRAS.FN_COSTO_ULTIMO(i.id_articulo, i.cod_empresa) AS costo_ultimo
              FROM inventario i
              LEFT JOIN articulos a ON a.cod_empresa = i.cod_empresa
                                    AND a.id_articulo = i.id_articulo
             WHERE i.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND TRUNC(i.fecha) BETWEEN l_desde AND l_hasta
          ) x
         ORDER BY x.id_inventario DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('id_inventario', r.id_inventario);
        APEX_JSON.WRITE('id_articulo', r.id_articulo);
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('fecha', r.fecha);
        APEX_JSON.WRITE('cantidad_fisica', r.cantidad_fisica);
        APEX_JSON.WRITE('cantidad_sistema', r.cantidad_sistema);
        APEX_JSON.WRITE('diferencia', r.diferencia);
        APEX_JSON.WRITE('con_diferencia', r.con_diferencia);
        APEX_JSON.WRITE('cerrado', r.cerrado);
        APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventarios/costos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
