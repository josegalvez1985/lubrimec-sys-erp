--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint menu/paginas (Accesos rapidos) del modulo lubrimec.
--
-- Estructura PLANA: el handler GET ejecuta directamente la logica de negocio.
-- (Reemplaza el patron anidado "GET que se redefine a si mismo", que dejaba
--  instalado el bloque de setup en lugar de la query real y provocaba HTTP 500.)
--
--   GET /ords/josegalvez/lubrimec/menu/paginas?app_id=:n&app_user=:u  -> paginas del usuario
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC y la tabla
-- PAGINAS_FRONT (paginas_front_sql.sql, ejecutarlo ANTES: sin la tabla el menu
-- responde error). Menu hibrido: paginas del APEX + paginas de PAGINAS_FRONT.
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
    --
    -- Los nombres de los campos son CONTRATO con el front (type PaginaMenu en
    -- src/lib/api.ts): el sidebar agrupa por parent_entry_text, rotula con
    -- entry_text y oculta categorias por nombre. Una version vieja de este
    -- archivo escribia categoria_text/categoria_seq/pagina_seq; al re-ejecutarla
    -- el front no encontraba parent_entry_text y metia todo en "General".
    --
    -- MENU HIBRIDO: "apex" es la query de siempre (sin cambios). "front" suma las
    -- paginas de PAGINAS_FRONT (paginas que no existen en el APEX; ver
    -- paginas_front_sql.sql) con el mismo permiso de ROLES_PAGINAS. Si una pagina
    -- ya sale por "apex", la de PAGINAS_FRONT se ignora. "categorias" son las
    -- entradas padre de la lista del APEX: si la categoria de PAGINAS_FRONT
    -- coincide (sin mayusculas, espacios ni acentos) toma su nombre exacto y su orden, asi
    -- el sidebar la agrupa con las paginas del APEX; si no, va al final.
    FOR r IN (
      WITH apex AS (
        SELECT b.page_title,
               b.application_id,
               b.page_id,
               NVL(a.estadistica_user, 0)     estadistica_user,
               c.entry_text                   entry_text,
               cat.entry_text                 parent_entry_text,
               c.list_entry_id                list_entry_id,
               c.list_entry_parent_id         list_entry_parent_id,
               NVL(cat.display_sequence, 0)   seq_categoria,
               NVL(c.display_sequence, 0)     seq_pagina
          FROM roles_paginas a,
               APEX_APPLICATION_PAGES b,
               APEX_APPLICATION_LIST_ENTRIES c,
               APEX_APPLICATION_LIST_ENTRIES cat
         WHERE a.app_id = b.application_id
           AND a.app_page_id = b.page_id
           AND a.app_id = TO_NUMBER(l_app_id)
           AND a.app_user_id = l_app_user
           AND c.application_id = b.application_id
           -- Primera pagina de la expresion ('28,29' -> '28'; '6' -> '6') comparada
           -- como TEXTO. Antes: TO_NUMBER(...) = page_id OR expresion = page_id; la
           -- segunda parte convertia '28,29' a numero, lo que da ORA-01722 si la
           -- sesion de ORDS usa punto decimal (en SQL Commands, con coma decimal,
           -- no fallaba). Mismo resultado, sin conversion implicita.
           AND TRIM(CASE WHEN INSTR(c.current_for_pages_expression, ',') > 0
                         THEN SUBSTR(c.current_for_pages_expression, 1,
                                     INSTR(c.current_for_pages_expression, ',') - 1)
                         ELSE c.current_for_pages_expression
                    END) = TO_CHAR(b.page_id)
           AND cat.list_entry_id (+) = c.list_entry_parent_id
           AND NVL(a.puede_consultar, 'N') = 'S'
      ),
      categorias AS (
        SELECT TRANSLATE(UPPER(TRIM(k.entry_text)), 'ÁÉÍÓÚÜ', 'AEIOUU')   clave,
               MIN(k.entry_text)           nombre,
               MIN(k.display_sequence)     seq
          FROM APEX_APPLICATION_LIST_ENTRIES k
         WHERE k.application_id = TO_NUMBER(l_app_id)
           AND EXISTS (SELECT 1
                         FROM APEX_APPLICATION_LIST_ENTRIES h
                        WHERE h.application_id = k.application_id
                          AND h.list_entry_parent_id = k.list_entry_id)
         GROUP BY TRANSLATE(UPPER(TRIM(k.entry_text)), 'ÁÉÍÓÚÜ', 'AEIOUU')
      ),
      front AS (
        SELECT f.page_title,
               f.app_id                                  application_id,
               f.page_id,
               NVL(a.estadistica_user, 0)                estadistica_user,
               NVL(f.entry_text, f.page_title)           entry_text,
               NVL(k.nombre, f.categoria)                parent_entry_text,
               CAST(NULL AS NUMBER)                      list_entry_id,
               CAST(NULL AS NUMBER)                      list_entry_parent_id,
               COALESCE(k.seq, f.seq_categoria, 9999)    seq_categoria,
               NVL(f.seq_pagina, 0)                      seq_pagina
          FROM paginas_front f
          JOIN roles_paginas a
            ON a.app_id = f.app_id
           AND a.app_page_id = f.page_id
          LEFT JOIN categorias k
            ON k.clave = TRANSLATE(UPPER(TRIM(f.categoria)), 'ÁÉÍÓÚÜ', 'AEIOUU')
         WHERE f.app_id = TO_NUMBER(l_app_id)
           AND a.app_user_id = l_app_user
           AND NVL(a.puede_consultar, 'N') = 'S'
           AND f.activa = 'S'
           AND NOT EXISTS (SELECT 1 FROM apex x WHERE x.page_id = f.page_id)
      )
      SELECT * FROM (
        SELECT * FROM apex
        UNION ALL
        SELECT * FROM front
      )
      ORDER BY seq_categoria, parent_entry_text, seq_pagina, page_title
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('page_title', r.page_title);
        APEX_JSON.WRITE('application_id', r.application_id);
        APEX_JSON.WRITE('page_id', r.page_id);
        APEX_JSON.WRITE('estadistica_user', r.estadistica_user);
        APEX_JSON.WRITE('entry_text', r.entry_text);
        APEX_JSON.WRITE('parent_entry_text', r.parent_entry_text);
        APEX_JSON.WRITE('list_entry_id', r.list_entry_id);
        APEX_JSON.WRITE('list_entry_parent_id', r.list_entry_parent_id);
        APEX_JSON.WRITE('seq_categoria', r.seq_categoria);
        APEX_JSON.WRITE('seq_pagina', r.seq_pagina);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        -- Los headers ya se cerraron: STATUS_LINE aca solo imprimia el texto
        -- "Status: 500 ..." en el cuerpo, y el JSON de APEX_JSON quedaba a medio
        -- armar, asi que el error nunca se veia. Se escribe el mensaje directo.
        HTP.P('{"success":false,"message":"Error: '
              || REPLACE(REPLACE(SQLERRM, '\', '\\'), '"', '\"') || '"}');
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
