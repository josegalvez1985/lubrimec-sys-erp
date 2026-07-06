--------------------------------------------------------------------------------
-- MARCAS (pagina APEX 6) — paquete CRUD + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- PK id_marca por trigger TRG_RENUMERAR_MARCAS. Multiempresa (cod_empresa).
--
-- === 1) PAQUETE PKG_MARCAS_LUBRIMEC ========================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_MARCAS_LUBRIMEC AS

  -- Lista todas las marcas de una empresa.
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- Devuelve una marca por su id (dentro de su empresa).
  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER);

  -- Inserta una marca (el id lo asigna el trigger TRG_RENUMERAR_MARCAS).
  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER);

  -- Actualiza una marca existente.
  PROCEDURE ACTUALIZAR(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER);

  -- Borra una marca por su id (dentro de su empresa).
  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER);

END PKG_MARCAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_MARCAS_LUBRIMEC AS

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

  -- Valida el token; devuelve el usuario o NULL si es invalido.
  FUNCTION f_usuario(p_token IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
  END f_usuario;

  --------------------------------------------------------------------------
  -- LISTAR
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
        SELECT id_marca, descripcion, cod_empresa, valoracion
          FROM marcas
         WHERE cod_empresa = p_cod_empresa
         ORDER BY descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
      APEX_JSON.WRITE('valoracion', r.valoracion);
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
  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_descripcion marcas.descripcion%TYPE;
    l_cod_empresa marcas.cod_empresa%TYPE;
    l_valoracion  marcas.valoracion%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT descripcion, cod_empresa, valoracion
        INTO l_descripcion, l_cod_empresa, l_valoracion
        FROM marcas
       WHERE id_marca = p_id_marca
         AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Marca no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_marca', p_id_marca);
    APEX_JSON.WRITE('descripcion', l_descripcion);
    APEX_JSON.WRITE('cod_empresa', l_cod_empresa);
    APEX_JSON.WRITE('valoracion', l_valoracion);
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
      p_token       IN VARCHAR2,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER) IS
    l_usuario  VARCHAR2(255);
    l_id_marca marcas.id_marca%TYPE;
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

    INSERT INTO marcas (descripcion, cod_empresa, valoracion)
    VALUES (p_descripcion, p_cod_empresa, p_valoracion)
    RETURNING id_marca INTO l_id_marca;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Marca creada');
    APEX_JSON.WRITE('id_marca', l_id_marca);
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
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    -- No se permite reasignar la marca a otra empresa: el filtro asegura
    -- que solo se actualiza si pertenece a la empresa indicada.
    UPDATE marcas
       SET descripcion = p_descripcion,
           valoracion  = p_valoracion
     WHERE id_marca = p_id_marca
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Marca no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Marca actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM marcas
     WHERE id_marca = p_id_marca
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Marca no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Marca eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_MARCAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/marcas?cod_empresa=:n   -> listar
--   GET    /lubrimec/marcas/:id              -> obtener
--   POST   /lubrimec/marcas                  -> insertar
--   PUT    /lubrimec/marcas/:id              -> actualizar
--   DELETE /lubrimec/marcas/:id              -> eliminar
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente: borra handlers previos si el script se re-ejecuta.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'marcas', 'GET');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'marcas', 'POST');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'marcas/:id', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'marcas/:id', 'PUT');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'marcas/:id', 'DELETE');  EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /marcas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'marcas',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /marcas?cod_empresa=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'marcas',
      p_method      => 'GET',
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    PKG_MARCAS_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  -- Mapea el header HTTP Authorization al bind :authorization.
  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'marcas',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- POST /marcas  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'marcas',
      p_method      => 'POST',
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    PKG_MARCAS_LUBRIMEC.INSERTAR(
        p_token       => l_token,
        p_descripcion => :descripcion,
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_valoracion  => TO_NUMBER(:valoracion));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'marcas',
      p_method             => 'POST',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /marcas/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'marcas/:id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /marcas/:id  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'marcas/:id',
      p_method      => 'GET',
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    PKG_MARCAS_LUBRIMEC.OBTENER(
        p_token       => l_token,
        p_id_marca    => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'marcas/:id',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- PUT /marcas/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'marcas/:id',
      p_method      => 'PUT',
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    PKG_MARCAS_LUBRIMEC.ACTUALIZAR(
        p_token       => l_token,
        p_id_marca    => TO_NUMBER(:id),
        p_descripcion => :descripcion,
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_valoracion  => TO_NUMBER(:valoracion));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'marcas/:id',
      p_method             => 'PUT',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- DELETE /marcas/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'marcas/:id',
      p_method      => 'DELETE',
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    PKG_MARCAS_LUBRIMEC.ELIMINAR(
        p_token       => l_token,
        p_id_marca    => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'marcas/:id',
      p_method             => 'DELETE',
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
