--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Consulta de Inventarios (pagina APEX 80).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
-- Ultimo inventario por articulo (MAX id_inventario) con cantidad fisica vs
-- sistema y diferencia. Filtrado (busqueda + facetas Fecha/Cerrado/Diferencia/
-- Activo/Rubro/Marca) 100% en el front. Imagen por articulo.
--
--   GET /ords/josegalvez/lubrimec/inventarios?cod_empresa=24
--       -> data: [{ id_inventario, id_articulo, descripcion, codigo_oem,
--                   fecha, cantidad_fisica, cantidad_sistema, diferencia,
--                   con_diferencia, cerrado, es_activo, rubro, marca }]
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventarios', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventarios',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventarios',
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
        SELECT m.id_inventario, m.id_articulo,
               a.descripcion,
               NVL(a.codigo_oem, TO_CHAR(a.id_articulo)) codigo_oem,
               TO_CHAR(m.fecha, 'YYYY-MM-DD') fecha,
               NVL(m.cantidad_fisica, 0) cantidad_fisica,
               NVL(m.cantidad_sistema, 0) cantidad_sistema,
               NVL(m.cantidad_fisica, 0) - NVL(m.cantidad_sistema, 0) diferencia,
               DECODE(NVL(m.cantidad_fisica, 0) - NVL(m.cantidad_sistema, 0), 0, 'No', 'Si') con_diferencia,
               NVL(m.cerrado, 'N') cerrado,
               a.es_activo,
               r.descripcion rubro,
               ma.descripcion marca
          FROM inventario m, articulos a, rubros r, marcas ma
         WHERE m.cod_empresa = TO_NUMBER(l_cod_empresa)
           AND a.cod_empresa = m.cod_empresa
           AND a.id_articulo = m.id_articulo
           AND m.id_inventario = (SELECT MAX(b.id_inventario)
                                    FROM inventario b
                                   WHERE b.cod_empresa = m.cod_empresa
                                     AND b.id_articulo = m.id_articulo)
           AND r.cod_empresa = a.cod_empresa
           AND r.id_rubro = a.id_rubro
           AND ma.cod_empresa = a.cod_empresa
           AND ma.id_marca = a.id_marca
         ORDER BY m.id_inventario DESC
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
        APEX_JSON.WRITE('es_activo', r.es_activo);
        APEX_JSON.WRITE('rubro', r.rubro);
        APEX_JSON.WRITE('marca', r.marca);
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
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventarios', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
