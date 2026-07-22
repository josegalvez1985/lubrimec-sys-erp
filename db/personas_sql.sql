--------------------------------------------------------------------------------
-- PERSONAS (pagina APEX 2) — paquete CRUD + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- PK cod_persona. Multiempresa (cod_empresa). ind_cliente_proveedor: C/P/A.
--
-- === 1) PAQUETE PKG_PERSONAS_LUBRIMEC ======================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_PERSONAS_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER);

  PROCEDURE INSERTAR(
      p_token           IN VARCHAR2,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER);

  PROCEDURE ACTUALIZAR(
      p_token           IN VARCHAR2,
      p_cod_persona     IN NUMBER,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER);

  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER);

END PKG_PERSONAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_PERSONAS_LUBRIMEC AS

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

  -- Texto 'YYYY-MM-DD' -> DATE (NULL si vacio o no parseable).
  FUNCTION f_fecha(p_txt IN VARCHAR2) RETURN DATE IS
  BEGIN
    IF p_txt IS NULL OR TRIM(p_txt) IS NULL THEN RETURN NULL; END IF;
    RETURN TO_DATE(p_txt, 'YYYY-MM-DD');
  EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
  END f_fecha;

  -- Escribe una fila de personas como objeto JSON (reusado en LISTAR/OBTENER).
  PROCEDURE w_persona(
      p_cod_persona     NUMBER,   p_tipo_persona VARCHAR2, p_nombre VARCHAR2,
      p_nombre_fantasia VARCHAR2, p_sexo VARCHAR2,         p_fec_nacimiento DATE,
      p_nro_telefono    VARCHAR2, p_direccion VARCHAR2,    p_nro_ci VARCHAR2,
      p_nro_ruc         VARCHAR2, p_ind_cli_prov VARCHAR2, p_cod_empresa NUMBER) IS
  BEGIN
    APEX_JSON.WRITE('cod_persona', p_cod_persona);
    APEX_JSON.WRITE('tipo_persona', p_tipo_persona);
    APEX_JSON.WRITE('nombre', p_nombre);
    APEX_JSON.WRITE('nombre_fantasia', p_nombre_fantasia);
    APEX_JSON.WRITE('sexo', p_sexo);
    APEX_JSON.WRITE('fec_nacimiento',
        CASE WHEN p_fec_nacimiento IS NULL THEN NULL
             ELSE TO_CHAR(p_fec_nacimiento, 'YYYY-MM-DD') END);
    APEX_JSON.WRITE('nro_telefono', p_nro_telefono);
    APEX_JSON.WRITE('direccion', p_direccion);
    APEX_JSON.WRITE('nro_ci', p_nro_ci);
    APEX_JSON.WRITE('nro_ruc', p_nro_ruc);
    APEX_JSON.WRITE('ind_cliente_proveedor', p_ind_cli_prov);
    APEX_JSON.WRITE('cod_empresa', p_cod_empresa);
  END w_persona;

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
        SELECT cod_persona, tipo_persona, nombre, nombre_fantasia, sexo,
               fec_nacimiento, nro_telefono, direccion, nro_ci, nro_ruc,
               ind_cliente_proveedor, cod_empresa
          FROM personas
         WHERE cod_empresa = p_cod_empresa
         ORDER BY nombre
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      w_persona(r.cod_persona, r.tipo_persona, r.nombre, r.nombre_fantasia, r.sexo,
                r.fec_nacimiento, r.nro_telefono, r.direccion, r.nro_ci, r.nro_ruc,
                r.ind_cliente_proveedor, r.cod_empresa);
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
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    r         personas%ROWTYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT * INTO r
        FROM personas
       WHERE cod_persona = p_cod_persona
         AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Persona no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    w_persona(r.cod_persona, r.tipo_persona, r.nombre, r.nombre_fantasia, r.sexo,
              r.fec_nacimiento, r.nro_telefono, r.direccion, r.nro_ci, r.nro_ruc,
              r.ind_cliente_proveedor, r.cod_empresa);
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
      p_token           IN VARCHAR2,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER) IS
    l_usuario     VARCHAR2(255);
    l_cod_persona personas.cod_persona%TYPE;
    l_fecha       DATE;
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
    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    l_fecha := f_fecha(p_fec_nacimiento);

    INSERT INTO personas (
        tipo_persona, nombre, nombre_fantasia, sexo, fec_nacimiento,
        nro_telefono, direccion, nro_ci, nro_ruc, ind_cliente_proveedor, cod_empresa)
    VALUES (
        p_tipo_persona, p_nombre, p_nombre_fantasia, p_sexo, l_fecha,
        p_nro_telefono, p_direccion, p_nro_ci, p_nro_ruc, p_ind_cli_prov, p_cod_empresa)
    RETURNING cod_persona INTO l_cod_persona;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Persona creada');
    APEX_JSON.WRITE('cod_persona', l_cod_persona);
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
      p_token           IN VARCHAR2,
      p_cod_persona     IN NUMBER,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_fecha   DATE;
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

    l_fecha := f_fecha(p_fec_nacimiento);

    UPDATE personas
       SET tipo_persona          = p_tipo_persona,
           nombre                = p_nombre,
           nombre_fantasia       = p_nombre_fantasia,
           sexo                  = p_sexo,
           fec_nacimiento        = l_fecha,
           nro_telefono          = p_nro_telefono,
           direccion             = p_direccion,
           nro_ci                = p_nro_ci,
           nro_ruc               = p_nro_ruc,
           ind_cliente_proveedor = p_ind_cli_prov
     WHERE cod_persona = p_cod_persona
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Persona no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Persona actualizada');
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
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM personas
     WHERE cod_persona = p_cod_persona
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Persona no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Persona eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_PERSONAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/personas?cod_empresa=:n  -> listar
--   GET    /lubrimec/personas/:id             -> obtener
--   POST   /lubrimec/personas                 -> insertar
--   PUT    /lubrimec/personas/:id             -> actualizar
--   DELETE /lubrimec/personas/:id             -> eliminar
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'personas', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'personas', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'personas/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'personas/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'personas/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /personas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec', p_pattern => 'personas',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /personas?cod_empresa=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'personas', p_method => 'GET',
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

    PKG_PERSONAS_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'personas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- POST /personas  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'personas', p_method => 'POST',
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

    PKG_PERSONAS_LUBRIMEC.INSERTAR(
        p_token           => l_token,
        p_tipo_persona    => :tipo_persona,
        p_nombre          => :nombre,
        p_nombre_fantasia => :nombre_fantasia,
        p_sexo            => :sexo,
        p_fec_nacimiento  => :fec_nacimiento,
        p_nro_telefono    => :nro_telefono,
        p_direccion       => :direccion,
        p_nro_ci          => :nro_ci,
        p_nro_ruc         => :nro_ruc,
        p_ind_cli_prov    => :ind_cliente_proveedor,
        p_cod_empresa     => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'personas', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /personas/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec', p_pattern => 'personas/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /personas/:id  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'personas/:id', p_method => 'GET',
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

    PKG_PERSONAS_LUBRIMEC.OBTENER(
        p_token       => l_token,
        p_cod_persona => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'personas/:id', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- PUT /personas/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'personas/:id', p_method => 'PUT',
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

    PKG_PERSONAS_LUBRIMEC.ACTUALIZAR(
        p_token           => l_token,
        p_cod_persona     => TO_NUMBER(:id),
        p_tipo_persona    => :tipo_persona,
        p_nombre          => :nombre,
        p_nombre_fantasia => :nombre_fantasia,
        p_sexo            => :sexo,
        p_fec_nacimiento  => :fec_nacimiento,
        p_nro_telefono    => :nro_telefono,
        p_direccion       => :direccion,
        p_nro_ci          => :nro_ci,
        p_nro_ruc         => :nro_ruc,
        p_ind_cli_prov    => :ind_cliente_proveedor,
        p_cod_empresa     => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'personas/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /personas/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'personas/:id', p_method => 'DELETE',
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

    PKG_PERSONAS_LUBRIMEC.ELIMINAR(
        p_token       => l_token,
        p_cod_persona => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'personas/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
