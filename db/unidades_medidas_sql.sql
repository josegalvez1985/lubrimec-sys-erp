--------------------------------------------------------------------------------
-- UNIDADES_MEDIDAS (pagina APEX 21) — paquete CRUD + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ (corre primero el paquete, luego el
-- bloque ORDS). Requiere PKG_AUTH_LUBRIMEC. Responde { success, message, data }.
--
-- IMPORTANTE: la PK COD_UNIDAD_MEDIDA la INGRESA el usuario (no hay secuencia). El
-- trigger TRG_UNIDADES_MEDIDAS la pasa a mayusculas. No lleva cod_empresa.
--
-- === 1) PAQUETE PKG_UNIDADES_MEDIDAS_LUBRIMEC ===============================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_UNIDADES_MEDIDAS_LUBRIMEC AS

  PROCEDURE LISTAR(p_token IN VARCHAR2);

  PROCEDURE OBTENER(p_token IN VARCHAR2, p_cod IN VARCHAR2);

  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_cod         IN VARCHAR2,
      p_descripcion IN VARCHAR2);

  -- La PK no se cambia; solo se actualiza la descripcion.
  PROCEDURE ACTUALIZAR(
      p_token       IN VARCHAR2,
      p_cod         IN VARCHAR2,
      p_descripcion IN VARCHAR2);

  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod IN VARCHAR2);

END PKG_UNIDADES_MEDIDAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_UNIDADES_MEDIDAS_LUBRIMEC AS

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
        SELECT cod_unidad_medida, descripcion
          FROM unidades_medidas
         ORDER BY cod_unidad_medida
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('cod_unidad_medida', r.cod_unidad_medida);
      APEX_JSON.WRITE('descripcion', r.descripcion);
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
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_cod IN VARCHAR2) IS
    l_usuario     VARCHAR2(255);
    l_descripcion unidades_medidas.descripcion%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT descripcion INTO l_descripcion
        FROM unidades_medidas
       WHERE cod_unidad_medida = UPPER(p_cod);
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Unidad de medida no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('cod_unidad_medida', UPPER(p_cod));
    APEX_JSON.WRITE('descripcion', l_descripcion);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR  (la PK la provee el usuario)
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_cod         IN VARCHAR2,
      p_descripcion IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cod IS NULL THEN
      p_error(400, 'Bad Request', 'El codigo es obligatorio');
      RETURN;
    END IF;

    -- El trigger pasa cod a mayusculas; se envia tal cual.
    INSERT INTO unidades_medidas (cod_unidad_medida, descripcion)
    VALUES (p_cod, p_descripcion);
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Unidad de medida creada');
    APEX_JSON.WRITE('cod_unidad_medida', UPPER(p_cod));
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe una unidad con ese codigo');
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR  (solo descripcion; la PK no cambia)
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token       IN VARCHAR2,
      p_cod         IN VARCHAR2,
      p_descripcion IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    UPDATE unidades_medidas
       SET descripcion = p_descripcion
     WHERE cod_unidad_medida = UPPER(p_cod);

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Unidad de medida no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Unidad de medida actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM unidades_medidas WHERE cod_unidad_medida = UPPER(p_cod);

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Unidad de medida no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Unidad de medida eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: la unidad tiene registros asociados');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

END PKG_UNIDADES_MEDIDAS_LUBRIMEC;
/


--------------------------------------------------------------------------------
-- Definicion ORDS de los endpoints de UNIDADES_MEDIDAS (pagina APEX 21).
--
-- Estructura PLANA. La PK cod_unidad_medida es VARCHAR2(5) (la ingresa el usuario);
-- el :id de la ruta NO se convierte a numero.
--
--   GET    /ords/josegalvez/lubrimec/unidades-medidas       -> listar
--   GET    /ords/josegalvez/lubrimec/unidades-medidas/:id   -> obtener
--   POST   /ords/josegalvez/lubrimec/unidades-medidas       -> insertar
--   PUT    /ords/josegalvez/lubrimec/unidades-medidas/:id   -> actualizar
--   DELETE /ords/josegalvez/lubrimec/unidades-medidas/:id   -> eliminar
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_UNIDADES_MEDIDAS_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'unidades-medidas', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'unidades-medidas', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'unidades-medidas/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'unidades-medidas/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'unidades-medidas/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /unidades-medidas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec', p_pattern => 'unidades-medidas',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /unidades-medidas  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas', p_method => 'GET',
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

    PKG_UNIDADES_MEDIDAS_LUBRIMEC.LISTAR(p_token => l_token);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- POST /unidades-medidas  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas', p_method => 'POST',
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

    PKG_UNIDADES_MEDIDAS_LUBRIMEC.INSERTAR(
        p_token       => l_token,
        p_cod         => :cod_unidad_medida,
        p_descripcion => :descripcion);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /unidades-medidas/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /unidades-medidas/:id  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id', p_method => 'GET',
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

    PKG_UNIDADES_MEDIDAS_LUBRIMEC.OBTENER(
        p_token => l_token,
        p_cod   => :id);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- PUT /unidades-medidas/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id', p_method => 'PUT',
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

    PKG_UNIDADES_MEDIDAS_LUBRIMEC.ACTUALIZAR(
        p_token       => l_token,
        p_cod         => :id,
        p_descripcion => :descripcion);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /unidades-medidas/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id', p_method => 'DELETE',
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

    PKG_UNIDADES_MEDIDAS_LUBRIMEC.ELIMINAR(
        p_token => l_token,
        p_cod   => :id);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'unidades-medidas/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
