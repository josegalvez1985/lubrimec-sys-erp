--------------------------------------------------------------------------------
-- Definicion ORDS de los endpoints de EMPRESAS dentro del modulo lubrimec (pag 12).
--
-- Estructura PLANA: cada DEFINE_HANDLER instala directamente la logica de negocio.
--
--   GET    /ords/josegalvez/lubrimec/empresas       -> listar (sin filtro)
--   GET    /ords/josegalvez/lubrimec/empresas/:id   -> obtener (id = cod_empresa)
--   POST   /ords/josegalvez/lubrimec/empresas       -> insertar
--   PUT    /ords/josegalvez/lubrimec/empresas/:id   -> actualizar
--   DELETE /ords/josegalvez/lubrimec/empresas/:id   -> eliminar
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_EMPRESAS_LUBRIMEC compilado.
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
