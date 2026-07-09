--------------------------------------------------------------------------------
-- BUSQUEDA GLOBAL (buscador del header del front; sin pagina APEX equivalente).
-- Paquete + endpoints ORDS en un archivo. Ejecutar completo como JOSEGALVEZ.
-- Requiere PKG_AUTH_LUBRIMEC.
--
-- Dos LOVs COMPLETAS propias del buscador global (regla: lista completa +
-- filtro flexible 100% en el front, y LOV propia por modulo — no se comparten
-- los */buscar de otras paginas):
--   articulos: id, descripcion, OEM         -> al elegir navega a Articulos (pag 4)
--   personas:  cod, nombre, RUC, CI         -> al elegir navega a Personas (pag 2)
--
-- Rutas:
--   GET /lubrimec/busqueda/articulos?cod_empresa=:n
--   GET /lubrimec/busqueda/personas?cod_empresa=:n
--
-- === 1) PAQUETE PKG_BUSQUEDA_LUBRIMEC ======================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_BUSQUEDA_LUBRIMEC AS

  PROCEDURE ARTICULOS(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  PROCEDURE PERSONAS(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

END PKG_BUSQUEDA_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_BUSQUEDA_LUBRIMEC AS

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
  -- ARTICULOS (catalogo completo; filtra el front)
  --------------------------------------------------------------------------
  PROCEDURE ARTICULOS(
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
        SELECT a.id_articulo, a.descripcion, a.codigo_oem
          FROM articulos a
         WHERE a.cod_empresa = p_cod_empresa
         ORDER BY a.descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ARTICULOS;

  --------------------------------------------------------------------------
  -- PERSONAS (catalogo completo; filtra el front)
  --------------------------------------------------------------------------
  PROCEDURE PERSONAS(
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
        SELECT p.cod_persona, p.nombre, p.nro_ruc, p.nro_ci
          FROM personas p
         WHERE p.cod_empresa = p_cod_empresa
         ORDER BY p.nombre
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('cod_persona', r.cod_persona);
      APEX_JSON.WRITE('nombre', r.nombre);
      APEX_JSON.WRITE('nro_ruc', r.nro_ruc);
      APEX_JSON.WRITE('nro_ci', r.nro_ci);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END PERSONAS;

END PKG_BUSQUEDA_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'busqueda/articulos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'busqueda/personas', 'GET');  EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- GET /busqueda/articulos?cod_empresa=:n
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'busqueda/articulos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'busqueda/articulos',
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
    HTP.P('Access-Control-Allow-Methods: GET, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_BUSQUEDA_LUBRIMEC.ARTICULOS(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'busqueda/articulos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /busqueda/personas?cod_empresa=:n
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'busqueda/personas',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'busqueda/personas',
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
    HTP.P('Access-Control-Allow-Methods: GET, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;

    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_BUSQUEDA_LUBRIMEC.PERSONAS(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'busqueda/personas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
