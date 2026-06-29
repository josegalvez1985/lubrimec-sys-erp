--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint menu/paginas (Accesos rapidos) del modulo lubrimec.
--
-- Estructura PLANA: el handler GET ejecuta directamente la logica de negocio.
-- (Reemplaza el patron anidado "GET que se redefine a si mismo", que dejaba
--  instalado el bloque de setup en lugar de la query real y provocaba HTTP 500.)
--
--   GET /ords/josegalvez/lubrimec/menu/paginas?app_id=:n&app_user=:u  -> paginas del usuario
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente: borra handlers previos (GET y OPTIONS) si existen.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'menu/paginas', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'menu/paginas', 'OPTIONS'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'menu/paginas',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /menu/paginas  -> lista las paginas accesibles del usuario
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'menu/paginas',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token    VARCHAR2(256);
    l_usuario  VARCHAR2(255);
    l_pos      PLS_INTEGER;
    l_query    VARCHAR2(4000);
    l_app_id   VARCHAR2(50);
    l_app_user VARCHAR2(100);

    -- Extrae el valor de un parametro del query string (?clave=valor&...).
    FUNCTION get_qs(p_qs IN VARCHAR2, p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_p PLS_INTEGER;
        l_e PLS_INTEGER;
        l_v VARCHAR2(4000);
    BEGIN
        l_p := INSTR('&' || p_qs, '&' || p_key || '=');
        IF l_p = 0 THEN RETURN NULL; END IF;
        l_p := l_p + LENGTH(p_key) + 1;  -- salta "&clave="; el '&' virtual compensa el +1
        l_e := INSTR(p_qs || '&', '&', l_p);
        l_v := SUBSTR(p_qs, l_p, l_e - l_p);
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    -- Lee los parametros desde el query string crudo (ORDS no los bindea solo).
    l_query    := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_app_id   := get_qs(l_query, 'app_id');
    l_app_user := get_qs(l_query, 'app_user');

    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(l_token);

    IF l_usuario IS NULL THEN
        OWA_UTIL.STATUS_LINE(401, 'Unauthorized', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    -- Contexto de workspace APEX: sin esto las vistas APEX_APPLICATION_* devuelven
    -- 0 filas cuando la query corre desde ORDS (no hay sesion APEX), y data sale [].
    wwv_flow_api.set_security_group_id(p_security_group_id => 36593577189528884915);

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('usuario', l_usuario);
    APEX_JSON.OPEN_ARRAY('data');

    -- c   = entrada de lista de la pagina (nivel 3)
    -- cat = entrada padre = categoria (nivel 2), via LIST_ENTRY_PARENT_ID
    FOR r IN (
        SELECT b.page_title,
               b.application_id,
               b.page_id,
               NVL(a.estadistica_user, 0)     estadistica_user,
               cat.entry_text                 categoria_text,
               NVL(cat.display_sequence, 0)   categoria_seq,
               NVL(c.display_sequence, 0)     pagina_seq
          FROM roles_paginas a,
               APEX_APPLICATION_PAGES b,
               APEX_APPLICATION_LIST_ENTRIES c,
               APEX_APPLICATION_LIST_ENTRIES cat
         WHERE a.app_id = b.application_id
           AND a.app_page_id = b.page_id
           AND a.app_id = TO_NUMBER(l_app_id)
           AND a.app_user_id = l_app_user
           AND c.application_id = b.application_id
           AND (TO_NUMBER(SUBSTR(c.current_for_pages_expression, 1, INSTR(c.current_for_pages_expression, ',') - 1)) = b.page_id
                OR c.current_for_pages_expression = b.page_id)
           AND cat.list_entry_id (+) = c.list_entry_parent_id
           AND NVL(a.puede_consultar, 'N') = 'S'
         ORDER BY NVL(cat.display_sequence, 0), cat.entry_text, NVL(c.display_sequence, 0), b.page_title
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('page_title', r.page_title);
        APEX_JSON.WRITE('application_id', r.application_id);
        APEX_JSON.WRITE('page_id', r.page_id);
        APEX_JSON.WRITE('estadistica_user', r.estadistica_user);
        APEX_JSON.WRITE('categoria_text', r.categoria_text);
        APEX_JSON.WRITE('categoria_seq', r.categoria_seq);
        APEX_JSON.WRITE('pagina_seq', r.pagina_seq);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
~');

  -- Mapea el header HTTP Authorization al bind :authorization.
  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'menu/paginas',
      p_method             => 'GET',
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
