--------------------------------------------------------------------------------
-- PLANILLA PARA INVENTARIOS (paginas APEX 112 grilla + 113 modal Crear Planilla
-- + 115 modal Cantidad de Inventario) — paquete + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC,
-- PKG_COMPRAS (fn_fecha_ultima_compra) y fn_parametro.
--
-- LISTAR: conteos ABIERTOS de INVENTARIO (NVL(cerrado,'N') <> 'S') con la fecha
-- de ultima compra; el filtrado es 100% en el front.
--
-- PENDIENTES (LOVs del modal 113): artículos con estado 'A' y sin inventario o
-- con fecha_ultimo_inventario < fecha de referencia; devuelve las ternas
-- rubro/marca/viscosidad y el front arma las 3 LOVs en cascada (rubro libre,
-- marca depende de rubro, viscosidad de rubro+marca — replica el APEX).
-- Si no se pasa fecha usa fn_parametro(cod_empresa,'FECHA_INVENTARIO'); la
-- respuesta incluye la fecha usada (dd/mm/yyyy, como se guarda el parametro).
--
-- CREAR (proceso CREAR_PLANILLA del APEX, tal cual): inserta en INVENTARIO un
-- conteo (cantidad_fisica=0, cantidad_sistema=0, fecha=SYSDATE) por cada
-- articulo con ES_ACTIVO='N' y ESTADO='A' que matchee rubro/marca/viscosidad
-- (opcionales). NO excluye ya inventariados (decision: replicar APEX).
--
-- ACT_CANTIDAD (modal 115): actualiza cantidad_fisica del conteo.
-- SUBIR_FOTO (modal 115, boton Tomar Foto): guarda el JPEG comprimido (el front
-- limita a 100KB) en INVENTARIO.FOTO via :body BLOB. Para MOSTRAR la foto se
-- reusa el GET publico /inventario/:id/foto (modulo ajustes).
--
-- Rutas:
--   GET  /lubrimec/planilla-inventarios?cod_empresa=:n            -> listar
--   GET  /lubrimec/planilla-inventarios/pendientes?cod_empresa=&fecha= -> LOVs
--   POST /lubrimec/planilla-inventarios/crear                     -> generar planilla
--   PUT  /lubrimec/planilla-inventarios/:id/cantidad              -> actualizar cantidad
--   PUT  /lubrimec/planilla-inventarios/:id/foto?cod_empresa=:n   -> subir foto (binario)
--
-- === 1) PAQUETE PKG_PLANILLA_INV_LUBRIMEC ==================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_PLANILLA_INV_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- p_fecha dd/mm/yyyy; NULL -> fn_parametro(cod_empresa,'FECHA_INVENTARIO').
  PROCEDURE PENDIENTES(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_fecha       IN VARCHAR2);

  PROCEDURE CREAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_id_rubro      IN NUMBER,
      p_id_marca      IN NUMBER,
      p_id_viscosidad IN NUMBER);

  PROCEDURE ACT_CANTIDAD(
      p_token           IN VARCHAR2,
      p_id_inventario   IN NUMBER,
      p_cod_empresa     IN NUMBER,
      p_cantidad_fisica IN NUMBER);

  PROCEDURE SUBIR_FOTO(
      p_token         IN VARCHAR2,
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER,
      p_foto          IN BLOB);

END PKG_PLANILLA_INV_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_PLANILLA_INV_LUBRIMEC AS

  --------------------------------------------------------------------------
  -- Helpers privados
  --------------------------------------------------------------------------
  PROCEDURE p_error(p_status IN NUMBER, p_reason IN VARCHAR2, p_message IN VARCHAR2) IS
  BEGIN
    OWA_UTIL.STATUS_LINE(p_status, p_reason, FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', FALSE);
    APEX_JSON.WRITE('message', p_message);
    APEX_JSON.CLOSE_OBJECT;
  END p_error;

  FUNCTION f_usuario(p_token IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
  END f_usuario;

  --------------------------------------------------------------------------
  -- LISTAR (query de la pag 112: conteos abiertos)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT i.id_inventario,
               i.id_articulo,
               a.descripcion AS articulo,
               i.cantidad_fisica,
               TO_CHAR(i.fecha, 'YYYY-MM-DD') AS fecha,
               i.observacion,
               i.cod_barra,
               TO_CHAR(pkg_compras.fn_fecha_ultima_compra(i.id_articulo, i.cod_empresa),
                       'YYYY-MM-DD') AS fecha_ultima_compra,
               CASE WHEN DBMS_LOB.GETLENGTH(i.foto) > 0 THEN 1 ELSE 0 END AS tiene_foto
          FROM inventario i
          LEFT JOIN articulos a
                 ON a.cod_empresa = i.cod_empresa
                AND a.id_articulo = i.id_articulo
         WHERE i.cod_empresa = p_cod_empresa
           AND NVL(i.cerrado, 'N') <> 'S'
         ORDER BY i.cantidad_fisica, pkg_compras.fn_fecha_ultima_compra(i.id_articulo, i.cod_empresa) DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_inventario', r.id_inventario);
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('articulo', r.articulo);
      APEX_JSON.WRITE('cantidad_fisica', r.cantidad_fisica);
      APEX_JSON.WRITE('fecha', r.fecha);
      APEX_JSON.WRITE('observacion', r.observacion);
      APEX_JSON.WRITE('cod_barra', r.cod_barra);
      APEX_JSON.WRITE('fecha_ultima_compra', r.fecha_ultima_compra);
      APEX_JSON.WRITE('tiene_foto', r.tiene_foto);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- PENDIENTES (base de las LOVs en cascada del modal 113)
  --------------------------------------------------------------------------
  PROCEDURE PENDIENTES(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_fecha       IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_fecha_txt VARCHAR2(20);
    l_fecha     DATE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    l_fecha_txt := p_fecha;
    IF l_fecha_txt IS NULL THEN
      BEGIN
        l_fecha_txt := fn_parametro(p_cod_empresa, 'FECHA_INVENTARIO');
      EXCEPTION
        WHEN OTHERS THEN
          l_fecha_txt := NULL;
      END;
    END IF;

    BEGIN
      l_fecha := TO_DATE(l_fecha_txt, 'DD/MM/YYYY');
    EXCEPTION
      WHEN OTHERS THEN
        p_error(400, 'Bad Request', 'Fecha invalida (se espera dd/mm/yyyy): ' || l_fecha_txt);
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('fecha', l_fecha_txt);
    APEX_JSON.OPEN_ARRAY('data');
    -- Ternas rubro/marca/viscosidad de los articulos pendientes de inventariar
    -- (mismas condiciones que las LOVs del APEX: estado A + sin inventario o
    -- inventario anterior a la fecha). El front deriva las 3 LOVs en cascada.
    FOR r IN (
        SELECT DISTINCT
               a.id_rubro,
               ru.descripcion AS rubro,
               a.id_marca,
               ma.descripcion AS marca,
               a.id_viscosidad,
               vi.descripcion AS viscosidad
          FROM articulos a
          LEFT JOIN rubros ru
                 ON ru.cod_empresa = a.cod_empresa
                AND ru.id_rubro = a.id_rubro
          LEFT JOIN marcas ma
                 ON ma.cod_empresa = a.cod_empresa
                AND ma.id_marca = a.id_marca
          LEFT JOIN viscosidad_lubricantes vi
                 ON vi.id_viscosidad = a.id_viscosidad
         WHERE a.cod_empresa = p_cod_empresa
           AND NVL(a.estado, 'A') = 'A'
           AND (a.fecha_ultimo_inventario IS NULL
                OR TRUNC(a.fecha_ultimo_inventario) < l_fecha)
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_rubro', r.id_rubro);
      APEX_JSON.WRITE('rubro', r.rubro);
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.WRITE('marca', r.marca);
      APEX_JSON.WRITE('id_viscosidad', r.id_viscosidad);
      APEX_JSON.WRITE('viscosidad', r.viscosidad);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END PENDIENTES;

  --------------------------------------------------------------------------
  -- CREAR (proceso CREAR_PLANILLA del APEX, tal cual)
  --------------------------------------------------------------------------
  PROCEDURE CREAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_id_rubro      IN NUMBER,
      p_id_marca      IN NUMBER,
      p_id_viscosidad IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_n       PLS_INTEGER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    INSERT INTO inventario (cantidad_fisica, fecha, id_articulo, cod_empresa, cantidad_sistema)
    SELECT 0, SYSDATE, a.id_articulo, a.cod_empresa, 0
      FROM articulos a
     WHERE a.cod_empresa = p_cod_empresa
       AND NVL(a.es_activo, 'N') = 'N'
       AND NVL(a.estado, 'A') = 'A'
       AND (p_id_rubro      IS NULL OR a.id_rubro      = p_id_rubro)
       AND (p_id_marca      IS NULL OR a.id_marca      = p_id_marca)
       AND (p_id_viscosidad IS NULL OR a.id_viscosidad = p_id_viscosidad);

    l_n := SQL%ROWCOUNT;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Planilla generada (' || l_n || ' articulos)');
    APEX_JSON.WRITE('insertados', l_n);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END CREAR;

  --------------------------------------------------------------------------
  -- ACT_CANTIDAD (SAVE del modal 115)
  --------------------------------------------------------------------------
  PROCEDURE ACT_CANTIDAD(
      p_token           IN VARCHAR2,
      p_id_inventario   IN NUMBER,
      p_cod_empresa     IN NUMBER,
      p_cantidad_fisica IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cantidad_fisica IS NULL THEN
      p_error(400, 'Bad Request', 'cantidad_fisica es obligatoria');
      RETURN;
    END IF;

    UPDATE inventario
       SET cantidad_fisica = p_cantidad_fisica
     WHERE id_inventario = p_id_inventario
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Registro de inventario no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Cantidad actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACT_CANTIDAD;

  --------------------------------------------------------------------------
  -- SUBIR_FOTO (boton Tomar Foto del modal 115)
  --------------------------------------------------------------------------
  PROCEDURE SUBIR_FOTO(
      p_token         IN VARCHAR2,
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER,
      p_foto          IN BLOB) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_foto IS NULL OR DBMS_LOB.GETLENGTH(p_foto) = 0 THEN
      p_error(400, 'Bad Request', 'No se recibio la imagen');
      RETURN;
    END IF;

    UPDATE inventario
       SET foto = p_foto
     WHERE id_inventario = p_id_inventario
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Registro de inventario no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Foto guardada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END SUBIR_FOTO;

END PKG_PLANILLA_INV_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'planilla-inventarios', 'GET');                EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'planilla-inventarios/pendientes', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'planilla-inventarios/crear', 'POST');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'planilla-inventarios/:id/cantidad', 'PUT');   EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'planilla-inventarios/:id/foto', 'PUT');       EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- GET /planilla-inventarios?cod_empresa=:n  -> listar
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'planilla-inventarios',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PLANILLA_INV_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /planilla-inventarios/pendientes?cod_empresa=&fecha=  -> LOVs cascada
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/pendientes',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'planilla-inventarios/pendientes',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PLANILLA_INV_LUBRIMEC.PENDIENTES(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')),
        p_fecha       => get_qs(l_qs, 'fecha'));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/pendientes', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /planilla-inventarios/crear  -> generar planilla (modal 113)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/crear',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'planilla-inventarios/crear',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    PKG_PLANILLA_INV_LUBRIMEC.CREAR(
        p_token         => l_token,
        p_cod_empresa   => TO_NUMBER(:cod_empresa),
        p_id_rubro      => TO_NUMBER(:id_rubro),
        p_id_marca      => TO_NUMBER(:id_marca),
        p_id_viscosidad => TO_NUMBER(:id_viscosidad));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/crear', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- PUT /planilla-inventarios/:id/cantidad  -> actualizar cantidad (modal 115)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/:id/cantidad',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'planilla-inventarios/:id/cantidad',
      p_method      => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    PKG_PLANILLA_INV_LUBRIMEC.ACT_CANTIDAD(
        p_token           => l_token,
        p_id_inventario   => TO_NUMBER(:id),
        p_cod_empresa     => TO_NUMBER(:cod_empresa),
        p_cantidad_fisica => TO_NUMBER(:cantidad_fisica));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/:id/cantidad', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- PUT /planilla-inventarios/:id/foto?cod_empresa=:n  -> subir foto (binario)
  -- El body es la imagen cruda (image/jpeg); ORDS la expone como :body BLOB.
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/:id/foto',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'planilla-inventarios/:id/foto',
      p_method      => 'PUT',
      p_mimes_allowed => 'image/jpeg,image/png,application/octet-stream',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);
    l_foto  BLOB;
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
    -- :body solo puede referenciarse UNA vez (se lee en streaming).
    l_foto := :body;

    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PLANILLA_INV_LUBRIMEC.SUBIR_FOTO(
        p_token         => l_token,
        p_id_inventario => TO_NUMBER(:id),
        p_cod_empresa   => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')),
        p_foto          => l_foto);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'planilla-inventarios/:id/foto', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
