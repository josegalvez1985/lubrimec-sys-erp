--------------------------------------------------------------------------------
-- Definicion ORDS de los endpoints de PERSONAS dentro del modulo lubrimec (pag 2).
--
-- Estructura PLANA: cada DEFINE_HANDLER instala directamente la logica de negocio.
--
--   GET    /ords/josegalvez/lubrimec/personas?cod_empresa=:n  -> listar
--   GET    /ords/josegalvez/lubrimec/personas/:id             -> obtener
--   POST   /ords/josegalvez/lubrimec/personas                 -> insertar
--   PUT    /ords/josegalvez/lubrimec/personas/:id             -> actualizar
--   DELETE /ords/josegalvez/lubrimec/personas/:id             -> eliminar
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_PERSONAS_LUBRIMEC compilado.
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
