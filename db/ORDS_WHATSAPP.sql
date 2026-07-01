--------------------------------------------------------------------------------
-- Endpoints ORDS de la pagina 117 (Mensajes a WhatsApp) en el modulo lubrimec.
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md).
--
--   GET  /ords/josegalvez/lubrimec/whatsapp/numeros            -> listar numeros
--   POST /ords/josegalvez/lubrimec/whatsapp/enviar             -> lanzar envio (job)
--   GET  /ords/josegalvez/lubrimec/whatsapp/logs?desde=:ts     -> progreso (LOG_WHATSAPP)
--
-- Ejecutar como JOSEGALVEZ. Requiere PKG_WHATSAPP_LUBRIMEC compilado.
--------------------------------------------------------------------------------
BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'whatsapp/numeros',        'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'whatsapp/numeros',        'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'whatsapp/numeros/cargar', 'POST');   EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'whatsapp/enviar',     'POST'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'whatsapp/logs',       'GET');  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'whatsapp/imagen',     'POST'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- GET /whatsapp/numeros
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_WHATSAPP_LUBRIMEC.LISTAR_NUMEROS(p_token => l_token, p_solo_pendientes => 'S');
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /whatsapp/numeros  -> borra todos
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_WHATSAPP_LUBRIMEC.BORRAR_NUMEROS(p_token => l_token);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /whatsapp/numeros/cargar  -> carga masiva
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros/cargar',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros/cargar', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_WHATSAPP_LUBRIMEC.CARGAR_NUMEROS(p_token => l_token, p_numeros => :numeros);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/numeros/cargar', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /whatsapp/enviar
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'whatsapp/enviar',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/enviar', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_WHATSAPP_LUBRIMEC.ENVIAR(
        p_token          => l_token,
        p_mensaje        => :mensaje,
        p_imagen_url     => :imagen_url,
        p_numeros_manual => :numeros_manual);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/enviar', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /whatsapp/logs
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'whatsapp/logs',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/logs', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);
    l_desde VARCHAR2(60);
    l_p     PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;

    -- Query params no se auto-bindean fiable: leer 'desde' del query string crudo.
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_p  := INSTR(l_qs, 'desde=');
    IF l_p > 0 THEN
        l_desde := SUBSTR(l_qs, l_p + 6);
        l_p := INSTR(l_desde, '&');
        IF l_p > 0 THEN l_desde := SUBSTR(l_desde, 1, l_p - 1); END IF;
        l_desde := UTL_URL.UNESCAPE(l_desde);
    END IF;

    PKG_WHATSAPP_LUBRIMEC.LOGS(p_token => l_token, p_desde => l_desde);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/logs', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /whatsapp/imagen  (sube base64, devuelve {id, url})
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'whatsapp/imagen',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/imagen', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_WHATSAPP_LUBRIMEC.SUBIR_IMAGEN(
        p_token  => l_token,
        p_base64 => :base64,
        p_mime   => :mime,
        p_nombre => :nombre);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name => 'lubrimec', p_pattern => 'whatsapp/imagen', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/
