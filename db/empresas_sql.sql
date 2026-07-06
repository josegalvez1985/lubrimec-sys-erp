--------------------------------------------------------------------------------
-- EMPRESAS (pagina APEX 12) — paquete CRUD + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- PK cod_empresa (= :id en los endpoints /:id). LISTAR sin filtro de empresa.
--
-- === 1) PAQUETE PKG_EMPRESAS_LUBRIMEC ======================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_EMPRESAS_LUBRIMEC AS

  PROCEDURE LISTAR(p_token IN VARCHAR2);

  PROCEDURE OBTENER(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);

  PROCEDURE INSERTAR(
      p_token         IN VARCHAR2,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2);

  PROCEDURE ACTUALIZAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2);

  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);

END PKG_EMPRESAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_EMPRESAS_LUBRIMEC AS

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
  -- LISTAR
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(p_token IN VARCHAR2) IS
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
        SELECT cod_empresa, nombre, nro_documento, activo
          FROM empresas
         ORDER BY nombre
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
      APEX_JSON.WRITE('nombre', r.nombre);
      APEX_JSON.WRITE('nro_documento', r.nro_documento);
      APEX_JSON.WRITE('activo', r.activo);
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
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_nombre        empresas.nombre%TYPE;
    l_nro_documento empresas.nro_documento%TYPE;
    l_activo        empresas.activo%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT nombre, nro_documento, activo
        INTO l_nombre, l_nro_documento, l_activo
        FROM empresas
       WHERE cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Empresa no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('cod_empresa', p_cod_empresa);
    APEX_JSON.WRITE('nombre', l_nombre);
    APEX_JSON.WRITE('nro_documento', l_nro_documento);
    APEX_JSON.WRITE('activo', l_activo);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token         IN VARCHAR2,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2) IS
    l_usuario     VARCHAR2(255);
    l_cod_empresa empresas.cod_empresa%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_nombre IS NULL THEN
      p_error(400, 'Bad Request', 'El nombre es obligatorio');
      RETURN;
    END IF;

    INSERT INTO empresas (nombre, nro_documento, activo)
    VALUES (p_nombre, p_nro_documento, NVL(p_activo, 'S'))
    RETURNING cod_empresa INTO l_cod_empresa;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Empresa creada');
    APEX_JSON.WRITE('cod_empresa', l_cod_empresa);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe una empresa con ese numero de documento');
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_nombre IS NULL THEN
      p_error(400, 'Bad Request', 'El nombre es obligatorio');
      RETURN;
    END IF;

    UPDATE empresas
       SET nombre        = p_nombre,
           nro_documento = p_nro_documento,
           activo        = NVL(p_activo, 'S')
     WHERE cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Empresa no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Empresa actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe una empresa con ese numero de documento');
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM empresas WHERE cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Empresa no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Empresa eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      -- FK de otras tablas (personas.cod_empresa, etc.) apuntan a empresas.
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: la empresa tiene registros asociados');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

END PKG_EMPRESAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/empresas       -> listar (sin filtro)
--   GET    /lubrimec/empresas/:id   -> obtener (id = cod_empresa)
--   POST   /lubrimec/empresas       -> insertar
--   PUT    /lubrimec/empresas/:id   -> actualizar
--   DELETE /lubrimec/empresas/:id   -> eliminar
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'empresas', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'empresas', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'empresas/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'empresas/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'empresas/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /empresas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec', p_pattern => 'empresas',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /empresas  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'empresas', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_EMPRESAS_LUBRIMEC.LISTAR(p_token => l_token);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'empresas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- POST /empresas  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'empresas', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_EMPRESAS_LUBRIMEC.INSERTAR(
        p_token         => l_token,
        p_nombre        => :nombre,
        p_nro_documento => :nro_documento,
        p_activo        => :activo);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'empresas', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /empresas/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec', p_pattern => 'empresas/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /empresas/:id  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'empresas/:id', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_EMPRESAS_LUBRIMEC.OBTENER(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:id));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'empresas/:id', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- PUT /empresas/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'empresas/:id', p_method => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_EMPRESAS_LUBRIMEC.ACTUALIZAR(
        p_token         => l_token,
        p_cod_empresa   => TO_NUMBER(:id),
        p_nombre        => :nombre,
        p_nro_documento => :nro_documento,
        p_activo        => :activo);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'empresas/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /empresas/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'empresas/:id', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_EMPRESAS_LUBRIMEC.ELIMINAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:id));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'empresas/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
