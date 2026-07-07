--------------------------------------------------------------------------------
-- CODIGOS DE BARRAS (pagina APEX 24) — paquete CRUD + endpoints ORDS.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- PK id_barra por trigger. Multiempresa (cod_empresa). UK (cod_barra, cod_empresa).
-- FK id_articulo -> articulos. LISTAR/OBTENER hacen JOIN a articulos para traer
-- descripcion_articulo + codigo_oem (solo lectura). BUSCAR_ARTICULOS alimenta el
-- selector del formulario (endpoint articulos/buscar).
--
-- === 1) PAQUETE PKG_CODIGOS_BARRAS_LUBRIMEC ================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_CODIGOS_BARRAS_LUBRIMEC AS

  PROCEDURE LISTAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_id_barra IN NUMBER, p_cod_empresa IN NUMBER);
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_id_articulo IN NUMBER,
      p_cod_barra IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_barra IN NUMBER, p_id_articulo IN NUMBER,
      p_cod_barra IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_barra IN NUMBER, p_cod_empresa IN NUMBER);
  PROCEDURE BUSCAR_ARTICULOS(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_q IN VARCHAR2);

END PKG_CODIGOS_BARRAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_CODIGOS_BARRAS_LUBRIMEC AS

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
  -- LISTAR (JOIN a articulos para traer la descripcion del articulo)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
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
        SELECT cb.id_barra, cb.id_articulo, cb.cod_barra, cb.cod_empresa,
               a.descripcion AS descripcion_articulo, a.codigo_oem
          FROM codigos_barras cb
          LEFT JOIN articulos a
                 ON a.id_articulo = cb.id_articulo
                AND a.cod_empresa = cb.cod_empresa
         WHERE cb.cod_empresa = p_cod_empresa
         ORDER BY cb.id_barra DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_barra', r.id_barra);
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('cod_barra', r.cod_barra);
      APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
      APEX_JSON.WRITE('descripcion_articulo', r.descripcion_articulo);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- OBTENER
  --------------------------------------------------------------------------
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_id_barra IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario     VARCHAR2(255);
    l_id_articulo codigos_barras.id_articulo%TYPE;
    l_cod_barra   codigos_barras.cod_barra%TYPE;
    l_desc        articulos.descripcion%TYPE;
    l_oem         articulos.codigo_oem%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT cb.id_articulo, cb.cod_barra, a.descripcion, a.codigo_oem
        INTO l_id_articulo, l_cod_barra, l_desc, l_oem
        FROM codigos_barras cb
        LEFT JOIN articulos a
               ON a.id_articulo = cb.id_articulo
              AND a.cod_empresa = cb.cod_empresa
       WHERE cb.id_barra = p_id_barra AND cb.cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Codigo de barras no encontrado');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_barra', p_id_barra);
    APEX_JSON.WRITE('id_articulo', l_id_articulo);
    APEX_JSON.WRITE('cod_barra', l_cod_barra);
    APEX_JSON.WRITE('cod_empresa', p_cod_empresa);
    APEX_JSON.WRITE('descripcion_articulo', l_desc);
    APEX_JSON.WRITE('codigo_oem', l_oem);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR (PK por trigger; UK y FK controladas)
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_id_articulo IN NUMBER,
      p_cod_barra IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario  VARCHAR2(255);
    l_id_barra codigos_barras.id_barra%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_id_articulo IS NULL THEN
      p_error(400, 'Bad Request', 'El articulo es obligatorio');
      RETURN;
    END IF;
    IF p_cod_barra IS NULL THEN
      p_error(400, 'Bad Request', 'El codigo de barras es obligatorio');
      RETURN;
    END IF;
    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    INSERT INTO codigos_barras (id_articulo, cod_barra, cod_empresa)
    VALUES (p_id_articulo, p_cod_barra, p_cod_empresa)
    RETURNING id_barra INTO l_id_barra;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Codigo de barras creado');
    APEX_JSON.WRITE('id_barra', l_id_barra);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe ese codigo de barras en la empresa');
    WHEN OTHERS THEN
      ROLLBACK;
      -- -2291: FK padre no existe (id_articulo inexistente en la empresa)
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'El articulo indicado no existe');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_barra IN NUMBER, p_id_articulo IN NUMBER,
      p_cod_barra IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_id_articulo IS NULL THEN
      p_error(400, 'Bad Request', 'El articulo es obligatorio');
      RETURN;
    END IF;
    IF p_cod_barra IS NULL THEN
      p_error(400, 'Bad Request', 'El codigo de barras es obligatorio');
      RETURN;
    END IF;

    UPDATE codigos_barras
       SET id_articulo = p_id_articulo,
           cod_barra   = p_cod_barra
     WHERE id_barra = p_id_barra AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Codigo de barras no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Codigo de barras actualizado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe ese codigo de barras en la empresa');
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'El articulo indicado no existe');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_barra IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM codigos_barras
     WHERE id_barra = p_id_barra AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Codigo de barras no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Codigo de barras eliminado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- BUSCAR_ARTICULOS (para el selector del formulario). Devuelve hasta 30
  -- articulos activos de la empresa que matcheen por descripcion / codigo_oem
  -- / id_articulo. Con q vacio, los primeros por descripcion.
  --------------------------------------------------------------------------
  PROCEDURE BUSCAR_ARTICULOS(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_q IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_q       VARCHAR2(400) := '%' || UPPER(TRIM(p_q)) || '%';
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
        SELECT id_articulo, descripcion, codigo_oem, precio_venta, costo_ultima_compra
          FROM articulos
         WHERE cod_empresa = p_cod_empresa
           AND NVL(es_activo, 'S') = 'S'
           AND (
                 TRIM(p_q) IS NULL
                 OR UPPER(descripcion) LIKE l_q
                 OR UPPER(codigo_oem) LIKE l_q
                 OR TO_CHAR(id_articulo) LIKE l_q
               )
         ORDER BY descripcion
         FETCH FIRST 30 ROWS ONLY
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.WRITE('precio_venta', r.precio_venta);
      APEX_JSON.WRITE('costo_ultima_compra', r.costo_ultima_compra);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END BUSCAR_ARTICULOS;

END PKG_CODIGOS_BARRAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/codigos-barras?cod_empresa=:n   -> listar
--   GET    /lubrimec/codigos-barras/:id              -> obtener
--   POST   /lubrimec/codigos-barras                  -> insertar
--   PUT    /lubrimec/codigos-barras/:id              -> actualizar
--   DELETE /lubrimec/codigos-barras/:id              -> eliminar
--   GET    /lubrimec/articulos/buscar?cod_empresa=:n&q=:q -> selector de articulos
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'codigos-barras', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'codigos-barras', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'codigos-barras/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'codigos-barras/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'codigos-barras/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/buscar', 'GET');      EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /codigos-barras
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'codigos-barras',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /codigos-barras?cod_empresa=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'codigos-barras',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_CODIGOS_BARRAS_LUBRIMEC.LISTAR(p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'codigos-barras',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- POST /codigos-barras  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'codigos-barras',
      p_method      => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_CODIGOS_BARRAS_LUBRIMEC.INSERTAR(
        p_token => l_token, p_id_articulo => TO_NUMBER(:id_articulo),
        p_cod_barra => :cod_barra, p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'codigos-barras',
      p_method             => 'POST',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /codigos-barras/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'codigos-barras/:id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /codigos-barras/:id  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'codigos-barras/:id',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_CODIGOS_BARRAS_LUBRIMEC.OBTENER(
        p_token => l_token, p_id_barra => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'codigos-barras/:id',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- PUT /codigos-barras/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'codigos-barras/:id',
      p_method      => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_CODIGOS_BARRAS_LUBRIMEC.ACTUALIZAR(
        p_token => l_token, p_id_barra => TO_NUMBER(:id),
        p_id_articulo => TO_NUMBER(:id_articulo),
        p_cod_barra => :cod_barra, p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'codigos-barras/:id',
      p_method             => 'PUT',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- DELETE /codigos-barras/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'codigos-barras/:id',
      p_method      => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_CODIGOS_BARRAS_LUBRIMEC.ELIMINAR(
        p_token => l_token, p_id_barra => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'codigos-barras/:id',
      p_method             => 'DELETE',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- /articulos/buscar  -> selector de articulos del formulario
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'articulos/buscar',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/buscar',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20); l_q VARCHAR2(4000);
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
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    l_q           := get_qs(l_query, 'q');
    PKG_CODIGOS_BARRAS_LUBRIMEC.BUSCAR_ARTICULOS(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa), p_q => l_q);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos/buscar',
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
