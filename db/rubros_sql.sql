--------------------------------------------------------------------------------
-- RUBROS (pagina APEX 20) — paquete CRUD + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- PK id_rubro por trigger TRG_RENUMERAR_RUBROS. Multiempresa (cod_empresa).
-- porc_recargo es NOT NULL.
--
-- === 1) PAQUETE PKG_RUBROS_LUBRIMEC ========================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_RUBROS_LUBRIMEC AS

  PROCEDURE LISTAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_id_rubro IN NUMBER, p_cod_empresa IN NUMBER);
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER, p_porc_recargo IN NUMBER);
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_rubro IN NUMBER, p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER, p_porc_recargo IN NUMBER);
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_rubro IN NUMBER, p_cod_empresa IN NUMBER);

END PKG_RUBROS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_RUBROS_LUBRIMEC AS

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
        SELECT id_rubro, descripcion, cod_empresa, porc_recargo
          FROM rubros
         WHERE cod_empresa = p_cod_empresa
         ORDER BY descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_rubro', r.id_rubro);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
      APEX_JSON.WRITE('porc_recargo', r.porc_recargo);
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
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_id_rubro IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario      VARCHAR2(255);
    l_descripcion  rubros.descripcion%TYPE;
    l_cod_empresa  rubros.cod_empresa%TYPE;
    l_porc_recargo rubros.porc_recargo%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT descripcion, cod_empresa, porc_recargo
        INTO l_descripcion, l_cod_empresa, l_porc_recargo
        FROM rubros
       WHERE id_rubro = p_id_rubro AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Rubro no encontrado');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_rubro', p_id_rubro);
    APEX_JSON.WRITE('descripcion', l_descripcion);
    APEX_JSON.WRITE('cod_empresa', l_cod_empresa);
    APEX_JSON.WRITE('porc_recargo', l_porc_recargo);
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
      p_token IN VARCHAR2, p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER, p_porc_recargo IN NUMBER) IS
    l_usuario  VARCHAR2(255);
    l_id_rubro rubros.id_rubro%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_descripcion IS NULL THEN
      p_error(400, 'Bad Request', 'La descripcion es obligatoria');
      RETURN;
    END IF;
    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    INSERT INTO rubros (descripcion, cod_empresa, porc_recargo)
    VALUES (p_descripcion, p_cod_empresa, NVL(p_porc_recargo, 0))
    RETURNING id_rubro INTO l_id_rubro;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Rubro creado');
    APEX_JSON.WRITE('id_rubro', l_id_rubro);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_rubro IN NUMBER, p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER, p_porc_recargo IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_descripcion IS NULL THEN
      p_error(400, 'Bad Request', 'La descripcion es obligatoria');
      RETURN;
    END IF;

    UPDATE rubros
       SET descripcion  = p_descripcion,
           porc_recargo = NVL(p_porc_recargo, 0)
     WHERE id_rubro = p_id_rubro AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Rubro no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Rubro actualizado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_rubro IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM rubros
     WHERE id_rubro = p_id_rubro AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Rubro no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Rubro eliminado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: el rubro tiene articulos asociados');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

END PKG_RUBROS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/rubros?cod_empresa=:n   -> listar
--   GET    /lubrimec/rubros/:id              -> obtener
--   POST   /lubrimec/rubros                  -> insertar
--   PUT    /lubrimec/rubros/:id              -> actualizar
--   DELETE /lubrimec/rubros/:id              -> eliminar
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'rubros', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'rubros', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'rubros/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'rubros/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'rubros/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- /rubros
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'rubros',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'rubros', p_method => 'GET',
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
    PKG_RUBROS_LUBRIMEC.LISTAR(p_token => l_token, p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'rubros', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'rubros', p_method => 'POST',
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
    PKG_RUBROS_LUBRIMEC.INSERTAR(
        p_token => l_token, p_descripcion => :descripcion,
        p_cod_empresa => TO_NUMBER(:cod_empresa), p_porc_recargo => TO_NUMBER(:porc_recargo));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'rubros', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /rubros/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'rubros/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'rubros/:id', p_method => 'GET',
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
    PKG_RUBROS_LUBRIMEC.OBTENER(
        p_token => l_token, p_id_rubro => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'rubros/:id', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'rubros/:id', p_method => 'PUT',
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
    PKG_RUBROS_LUBRIMEC.ACTUALIZAR(
        p_token => l_token, p_id_rubro => TO_NUMBER(:id), p_descripcion => :descripcion,
        p_cod_empresa => TO_NUMBER(:cod_empresa), p_porc_recargo => TO_NUMBER(:porc_recargo));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'rubros/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'rubros/:id', p_method => 'DELETE',
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
    PKG_RUBROS_LUBRIMEC.ELIMINAR(
        p_token => l_token, p_id_rubro => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'rubros/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
