--------------------------------------------------------------------------------
-- PARAMETROS (paginas APEX 89 grilla + 90 modal Crear Parametro) — paquete CRUD
-- + endpoints ORDS en un archivo. Ejecutar completo como el esquema JOSEGALVEZ.
-- Requiere PKG_AUTH_LUBRIMEC.
--
-- CRUD simple sobre PARAMETROS. PK id_parametro autogenerada. Multiempresa
-- (cod_empresa). parametro y valor se guardan en MAYUSCULAS (text_case UPPER de
-- la pag 90); observacion queda libre. Los tres campos son obligatorios.
--
-- Rutas:
--   GET    /lubrimec/parametros?cod_empresa=:n       -> listar
--   GET    /lubrimec/parametros/:id?cod_empresa=:n   -> obtener
--   POST   /lubrimec/parametros                      -> insertar
--   PUT    /lubrimec/parametros/:id                  -> actualizar
--   DELETE /lubrimec/parametros/:id?cod_empresa=:n   -> eliminar
--
-- === 1) PAQUETE PKG_PARAMETROS_LUBRIMEC ====================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_PARAMETROS_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  PROCEDURE OBTENER(
      p_token        IN VARCHAR2,
      p_id_parametro IN NUMBER,
      p_cod_empresa  IN NUMBER);

  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_parametro   IN VARCHAR2,
      p_valor       IN VARCHAR2,
      p_observacion IN VARCHAR2);

  PROCEDURE ACTUALIZAR(
      p_token        IN VARCHAR2,
      p_id_parametro IN NUMBER,
      p_cod_empresa  IN NUMBER,
      p_parametro    IN VARCHAR2,
      p_valor        IN VARCHAR2,
      p_observacion  IN VARCHAR2);

  PROCEDURE ELIMINAR(
      p_token        IN VARCHAR2,
      p_id_parametro IN NUMBER,
      p_cod_empresa  IN NUMBER);

END PKG_PARAMETROS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_PARAMETROS_LUBRIMEC AS

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
        SELECT id_parametro,
               parametro,
               valor,
               observacion
          FROM parametros
         WHERE cod_empresa = p_cod_empresa
         ORDER BY parametro
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_parametro', r.id_parametro);
      APEX_JSON.WRITE('parametro', r.parametro);
      APEX_JSON.WRITE('valor', r.valor);
      APEX_JSON.WRITE('observacion', r.observacion);
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
      p_token        IN VARCHAR2,
      p_id_parametro IN NUMBER,
      p_cod_empresa  IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_row     parametros%ROWTYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT * INTO l_row
        FROM parametros
       WHERE id_parametro = p_id_parametro
         AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Parametro no encontrado');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_parametro', l_row.id_parametro);
    APEX_JSON.WRITE('parametro', l_row.parametro);
    APEX_JSON.WRITE('valor', l_row.valor);
    APEX_JSON.WRITE('observacion', l_row.observacion);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR (parametro y valor en MAYUSCULAS, como la pag 90)
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_parametro   IN VARCHAR2,
      p_valor       IN VARCHAR2,
      p_observacion IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_id      parametros.id_parametro%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cod_empresa IS NULL OR p_parametro IS NULL
       OR p_valor IS NULL OR p_observacion IS NULL THEN
      p_error(400, 'Bad Request', 'parametro, valor y observacion son obligatorios');
      RETURN;
    END IF;

    INSERT INTO parametros (cod_empresa, parametro, valor, observacion)
    VALUES (p_cod_empresa, UPPER(p_parametro), UPPER(p_valor), p_observacion)
    RETURNING id_parametro INTO l_id;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Parametro creado');
    APEX_JSON.WRITE('id_parametro', l_id);
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
      p_token        IN VARCHAR2,
      p_id_parametro IN NUMBER,
      p_cod_empresa  IN NUMBER,
      p_parametro    IN VARCHAR2,
      p_valor        IN VARCHAR2,
      p_observacion  IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_parametro IS NULL OR p_valor IS NULL OR p_observacion IS NULL THEN
      p_error(400, 'Bad Request', 'parametro, valor y observacion son obligatorios');
      RETURN;
    END IF;

    UPDATE parametros
       SET parametro   = UPPER(p_parametro),
           valor       = UPPER(p_valor),
           observacion = p_observacion
     WHERE id_parametro = p_id_parametro
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Parametro no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Parametro actualizado');
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
      p_token        IN VARCHAR2,
      p_id_parametro IN NUMBER,
      p_cod_empresa  IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM parametros
     WHERE id_parametro = p_id_parametro
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Parametro no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Parametro eliminado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_PARAMETROS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'parametros', 'GET');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'parametros', 'POST');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'parametros/:id', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'parametros/:id', 'PUT');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'parametros/:id', 'DELETE');  EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /parametros
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'parametros',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /parametros?cod_empresa=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'parametros',
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PARAMETROS_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'parametros', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- POST /parametros  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'parametros',
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
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    PKG_PARAMETROS_LUBRIMEC.INSERTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_parametro   => :parametro,
        p_valor       => :valor,
        p_observacion => :observacion);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'parametros', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /parametros/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'parametros/:id',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /parametros/:id?cod_empresa=:n  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'parametros/:id',
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PARAMETROS_LUBRIMEC.OBTENER(
        p_token        => l_token,
        p_id_parametro => TO_NUMBER(:id),
        p_cod_empresa  => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'parametros/:id', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- PUT /parametros/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'parametros/:id',
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
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    PKG_PARAMETROS_LUBRIMEC.ACTUALIZAR(
        p_token        => l_token,
        p_id_parametro => TO_NUMBER(:id),
        p_cod_empresa  => TO_NUMBER(:cod_empresa),
        p_parametro    => :parametro,
        p_valor        => :valor,
        p_observacion  => :observacion);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'parametros/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /parametros/:id?cod_empresa=:n  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'parametros/:id',
      p_method      => 'DELETE',
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
    HTP.P('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PARAMETROS_LUBRIMEC.ELIMINAR(
        p_token        => l_token,
        p_id_parametro => TO_NUMBER(:id),
        p_cod_empresa  => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'parametros/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
