--------------------------------------------------------------------------------
-- PAGINAS DEL FRONT (menu hibrido) — tabla PAGINAS_FRONT, alta de las paginas
-- 121 y 122, y paquete + endpoints de "Paginas del Menu" (pag 122, la pantalla
-- para dar de alta paginas nuevas; modificar solo JOSEG).
-- Ejecutar completo como el esquema JOSEGALVEZ. Se puede re-ejecutar: crea la
-- tabla solo si no existe y las altas no pisan lo que ya este cargado.
--
-- Para que sirve: el menu (GET menu/paginas) arma las paginas desde el APEX
-- (APEX_APPLICATION_PAGES + lista de navegacion). Esas vistas son de solo
-- lectura, asi que una pagina que solo existe en el front (ej. Agenda de Citas,
-- 121) no se puede dar de alta ahi. PAGINAS_FRONT cumple ese papel:
--
--   APEX (como siempre)                    PAGINAS_FRONT (paginas nuevas)
--   page_id / page_title de la pagina      page_id / page_title
--   entry_text de la lista de navegacion   entry_text (NULL = page_title)
--   categoria = entrada padre de la lista  categoria (mismo nombre que la del APEX)
--   display_sequence de cada entrada       seq_pagina / seq_categoria
--
-- El permiso sigue en ROLES_PAGINAS, igual para las dos (puede_consultar = 'S').
--
-- HIBRIDO, sin romper lo que ya anda:
--   - Una pagina que el menu ya trae del APEX gana siempre: si el mismo page_id
--     esta en PAGINAS_FRONT, esa fila se ignora (no sale duplicada).
--   - categoria se compara sin mayusculas, espacios ni acentos con las categorias del
--     APEX: si coincide, la pagina cae en ese grupo y con su orden. Si no
--     existe, sale como grupo propio al final (o en seq_categoria si se carga).
--   - activa = 'N' la saca del menu y de la LOV de Roles sin borrar nada.
--
-- Orden de ejecucion la primera vez: 1) este archivo, 2) ORDS_MENU_PAGINAS.sql,
-- 3) roles_paginas_sql.sql (los dos ultimos leen esta tabla; si no existe, el
-- menu responde error).
--
-- === 1) TABLA ===============================================================
--------------------------------------------------------------------------------

DECLARE
  l_existe PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO l_existe FROM user_tables WHERE table_name = 'PAGINAS_FRONT';
  IF l_existe = 0 THEN
    EXECUTE IMMEDIATE q'~
      CREATE TABLE PAGINAS_FRONT (
        APP_ID        NUMBER         NOT NULL,
        PAGE_ID       NUMBER         NOT NULL,
        PAGE_TITLE    VARCHAR2(255)  NOT NULL,
        ENTRY_TEXT    VARCHAR2(255),
        CATEGORIA     VARCHAR2(255),
        SEQ_CATEGORIA NUMBER,
        SEQ_PAGINA    NUMBER         DEFAULT 0,
        ACTIVA        VARCHAR2(1)    DEFAULT 'S' NOT NULL,
        CONSTRAINT PAGINAS_FRONT_PK PRIMARY KEY (APP_ID, PAGE_ID),
        CONSTRAINT PAGINAS_FRONT_ACTIVA_CK CHECK (ACTIVA IN ('S', 'N'))
      )~';
    EXECUTE IMMEDIATE q'~COMMENT ON TABLE PAGINAS_FRONT IS 'Paginas del menu que existen solo en el front (no estan en el APEX)'~';
    EXECUTE IMMEDIATE q'~COMMENT ON COLUMN PAGINAS_FRONT.ENTRY_TEXT IS 'Texto en el menu; NULL = PAGE_TITLE'~';
    EXECUTE IMMEDIATE q'~COMMENT ON COLUMN PAGINAS_FRONT.CATEGORIA IS 'Grupo del menu; mismo nombre que la categoria del APEX'~';
    EXECUTE IMMEDIATE q'~COMMENT ON COLUMN PAGINAS_FRONT.SEQ_CATEGORIA IS 'Orden del grupo solo si la categoria no existe en el APEX'~';
  END IF;
END;
/

--------------------------------------------------------------------------------
-- === 2) ALTA DE PAGINAS =====================================================
-- Lo normal es darlas de alta desde la pagina 122 (Paginas del Menu). Estos
-- bloques quedan para las dos primeras (la 122 no puede crearse a si misma).
-- Solo insertan si no existen, asi que re-ejecutar no pisa cambios.
--------------------------------------------------------------------------------

-- Agenda de Citas (121). Permiso para todos los usuarios que ya tienen alguna
-- pagina en la app, con alta/cambio/baja (ver_campos queda en 'N').
DECLARE
  c_app  CONSTANT NUMBER := 86972;
  c_page CONSTANT NUMBER := 121;
BEGIN
  INSERT INTO paginas_front (app_id, page_id, page_title, entry_text, categoria, seq_pagina)
  SELECT c_app, c_page, 'Agenda de Citas', NULL, 'Ventas', 100
    FROM dual
   WHERE NOT EXISTS (SELECT 1 FROM paginas_front
                      WHERE app_id = c_app AND page_id = c_page);

  INSERT INTO roles_paginas (app_id, app_page_id, app_user_id,
                             puede_insertar, puede_actualizar, puede_borrar,
                             puede_consultar, ver_campos)
  SELECT DISTINCT c_app, c_page, r.app_user_id, 'S', 'S', 'S', 'S', 'N'
    FROM roles_paginas r
   WHERE r.app_id = c_app
     AND NOT EXISTS (SELECT 1 FROM roles_paginas x
                      WHERE x.app_id = c_app
                        AND x.app_page_id = c_page
                        AND x.app_user_id = r.app_user_id);
  COMMIT;
END;
/

-- Para ver como quedo:
--   SELECT * FROM paginas_front ORDER BY app_id, page_id;
--   SELECT app_user_id, puede_consultar FROM roles_paginas
--    WHERE app_id = 86972 AND app_page_id = 121 ORDER BY app_user_id;

-- Paginas del menu (122): la pantalla para dar de alta estas paginas. Solo
-- JOSEG la ve (y el paquete solo le deja modificar a el).
DECLARE
  c_app  CONSTANT NUMBER := 86972;
  c_page CONSTANT NUMBER := 122;
BEGIN
  INSERT INTO paginas_front (app_id, page_id, page_title, entry_text, categoria, seq_pagina)
  SELECT c_app, c_page, 'Páginas del Menú', NULL, 'Informática', 100
    FROM dual
   WHERE NOT EXISTS (SELECT 1 FROM paginas_front
                      WHERE app_id = c_app AND page_id = c_page);

  INSERT INTO roles_paginas (app_id, app_page_id, app_user_id,
                             puede_insertar, puede_actualizar, puede_borrar,
                             puede_consultar, ver_campos)
  SELECT c_app, c_page, 'JOSEG', 'S', 'S', 'S', 'S', 'N'
    FROM dual
   WHERE NOT EXISTS (SELECT 1 FROM roles_paginas x
                      WHERE x.app_id = c_app
                        AND x.app_page_id = c_page
                        AND x.app_user_id = 'JOSEG');
  COMMIT;
END;
/

--------------------------------------------------------------------------------
-- === 3) PAQUETE PKG_PAGINAS_FRONT_LUBRIMEC ==================================
-- Alta, cambio y baja de PAGINAS_FRONT desde la pagina 122. Consultar puede
-- cualquiera con token; modificar solo JOSEG (usuario del TOKEN) -> 403.
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_PAGINAS_FRONT_LUBRIMEC AS

  -- { data: [paginas], categorias: [{categoria, seq, origen}],
  --   siguiente_page_id, puede_editar }
  PROCEDURE LISTAR(
      p_token  IN VARCHAR2,
      p_app_id IN NUMBER);

  -- p_permiso: 'TODOS' = permiso completo a todos los usuarios que ya tienen
  -- paginas en la app; cualquier otro valor = solo a quien la crea.
  PROCEDURE INSERTAR(
      p_token         IN VARCHAR2,
      p_app_id        IN NUMBER,
      p_page_id       IN NUMBER,
      p_page_title    IN VARCHAR2,
      p_entry_text    IN VARCHAR2,
      p_categoria     IN VARCHAR2,
      p_seq_categoria IN NUMBER,
      p_seq_pagina    IN NUMBER,
      p_activa        IN VARCHAR2,
      p_permiso       IN VARCHAR2);

  -- El page_id no cambia (es la clave de vistas.tsx y de ROLES_PAGINAS).
  PROCEDURE ACTUALIZAR(
      p_token         IN VARCHAR2,
      p_app_id        IN NUMBER,
      p_page_id       IN NUMBER,
      p_page_title    IN VARCHAR2,
      p_entry_text    IN VARCHAR2,
      p_categoria     IN VARCHAR2,
      p_seq_categoria IN NUMBER,
      p_seq_pagina    IN NUMBER,
      p_activa        IN VARCHAR2);

  -- Borra la pagina y sus permisos (los permisos solo si el page_id no es
  -- tambien una pagina del APEX, que los comparte).
  PROCEDURE ELIMINAR(
      p_token   IN VARCHAR2,
      p_app_id  IN NUMBER,
      p_page_id IN NUMBER);

END PKG_PAGINAS_FRONT_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_PAGINAS_FRONT_LUBRIMEC AS

  --------------------------------------------------------------------------
  -- Helpers privados (NO usarlos dentro de SQL: PLS-00231)
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

  FUNCTION f_es_admin(p_usuario IN VARCHAR2) RETURN BOOLEAN IS
  BEGIN
    RETURN UPPER(TRIM(NVL(p_usuario, '-'))) = 'JOSEG';
  END f_es_admin;

  -- Contexto de workspace APEX (sin esto las vistas APEX_* dan 0 filas).
  PROCEDURE p_set_workspace IS
  BEGIN
    wwv_flow_api.set_security_group_id(p_security_group_id => 36593577189528884915);
  END p_set_workspace;

  -- Titulo de la pagina del APEX con ese numero (NULL si no existe).
  FUNCTION f_titulo_apex(p_app_id IN NUMBER, p_page_id IN NUMBER) RETURN VARCHAR2 IS
    l_titulo VARCHAR2(255);
  BEGIN
    SELECT MAX(page_title)
      INTO l_titulo
      FROM apex_application_pages
     WHERE workspace = 'JOSEGALVEZ'
       AND application_id = p_app_id
       AND page_id = p_page_id;
    RETURN l_titulo;
  END f_titulo_apex;

  -- Valida los datos comunes de alta y cambio. NULL = todo bien.
  FUNCTION f_validar(
      p_app_id        IN NUMBER,
      p_page_id       IN NUMBER,
      p_page_title    IN VARCHAR2,
      p_seq_categoria IN NUMBER,
      p_seq_pagina    IN NUMBER) RETURN VARCHAR2 IS
  BEGIN
    IF p_app_id IS NULL THEN
      RETURN 'app_id es obligatorio';
    END IF;
    IF p_page_id IS NULL OR p_page_id <> TRUNC(p_page_id)
       OR p_page_id <= 1 OR p_page_id >= 9999 THEN
      RETURN 'El numero de pagina debe ser un entero entre 2 y 9998';
    END IF;
    IF TRIM(p_page_title) IS NULL THEN
      RETURN 'El titulo es obligatorio';
    END IF;
    IF p_seq_categoria < 0 OR p_seq_pagina < 0 THEN
      RETURN 'El orden no puede ser negativo';
    END IF;
    RETURN NULL;
  END f_validar;

  -- Error de INSERT/UPDATE: un texto que no entra (ORA-12899) es un 400.
  PROCEDURE p_error_guardar(p_code IN NUMBER, p_msg IN VARCHAR2) IS
  BEGIN
    IF p_code = -12899 THEN
      p_error(400, 'Bad Request', 'Uno de los textos es demasiado largo: acortalo y volve a guardar');
    ELSE
      p_error(500, 'Internal Server Error', 'Error: ' || p_msg);
    END IF;
  END p_error_guardar;

  --------------------------------------------------------------------------
  -- LISTAR
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token  IN VARCHAR2,
      p_app_id IN NUMBER) IS
    l_usuario   VARCHAR2(255);
    l_siguiente NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    p_set_workspace;

    -- Primer numero libre despues del mayor usado (APEX o propias).
    SELECT GREATEST(
             NVL((SELECT MAX(page_id) FROM apex_application_pages
                   WHERE workspace = 'JOSEGALVEZ'
                     AND application_id = p_app_id
                     AND page_id < 9999), 0),
             NVL((SELECT MAX(page_id) FROM paginas_front
                   WHERE app_id = p_app_id), 0)) + 1
      INTO l_siguiente
      FROM dual;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('puede_editar', f_es_admin(l_usuario));
    APEX_JSON.WRITE('siguiente_page_id', l_siguiente);

    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        WITH categorias AS (
          SELECT TRANSLATE(UPPER(TRIM(k.entry_text)), 'ÁÉÍÓÚÜ', 'AEIOUU') clave, MIN(k.entry_text) nombre
            FROM apex_application_list_entries k
           WHERE k.application_id = p_app_id
             AND EXISTS (SELECT 1
                           FROM apex_application_list_entries h
                          WHERE h.application_id = k.application_id
                            AND h.list_entry_parent_id = k.list_entry_id)
           GROUP BY TRANSLATE(UPPER(TRIM(k.entry_text)), 'ÁÉÍÓÚÜ', 'AEIOUU')
        )
        SELECT f.app_id, f.page_id, f.page_title, f.entry_text, f.categoria,
               f.seq_categoria, f.seq_pagina, f.activa,
               k.nombre AS categoria_menu,
               (SELECT MAX(p.page_title)
                  FROM apex_application_pages p
                 WHERE p.workspace = 'JOSEGALVEZ'
                   AND p.application_id = f.app_id
                   AND p.page_id = f.page_id) AS titulo_apex,
               (SELECT COUNT(*)
                  FROM roles_paginas r
                 WHERE r.app_id = f.app_id
                   AND r.app_page_id = f.page_id
                   AND NVL(r.puede_consultar, 'N') = 'S') AS usuarios
          FROM paginas_front f
          LEFT JOIN categorias k
            ON k.clave = TRANSLATE(UPPER(TRIM(f.categoria)), 'ÁÉÍÓÚÜ', 'AEIOUU')
         WHERE f.app_id = p_app_id
         ORDER BY f.page_id
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('app_id', r.app_id);
      APEX_JSON.WRITE('page_id', r.page_id);
      APEX_JSON.WRITE('page_title', r.page_title);
      APEX_JSON.WRITE('entry_text', r.entry_text);
      APEX_JSON.WRITE('categoria', r.categoria);
      APEX_JSON.WRITE('categoria_menu', r.categoria_menu);
      APEX_JSON.WRITE('seq_categoria', r.seq_categoria);
      APEX_JSON.WRITE('seq_pagina', r.seq_pagina);
      APEX_JSON.WRITE('activa', r.activa);
      APEX_JSON.WRITE('titulo_apex', r.titulo_apex);
      APEX_JSON.WRITE('usuarios', r.usuarios);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;

    -- Categorias para el combo: las del menu del APEX (con su orden) y las
    -- propias que no coinciden con ninguna.
    APEX_JSON.OPEN_ARRAY('categorias');
    FOR c IN (
        WITH apex AS (
          SELECT TRANSLATE(UPPER(TRIM(k.entry_text)), 'ÁÉÍÓÚÜ', 'AEIOUU') clave,
                 MIN(k.entry_text)         nombre,
                 MIN(k.display_sequence)   seq
            FROM apex_application_list_entries k
           WHERE k.application_id = p_app_id
             AND EXISTS (SELECT 1
                           FROM apex_application_list_entries h
                          WHERE h.application_id = k.application_id
                            AND h.list_entry_parent_id = k.list_entry_id)
           GROUP BY TRANSLATE(UPPER(TRIM(k.entry_text)), 'ÁÉÍÓÚÜ', 'AEIOUU')
        ),
        todas AS (
          SELECT nombre AS categoria, seq, 'APEX' AS origen
            FROM apex
          UNION ALL
          SELECT MIN(TRIM(f.categoria)), MIN(f.seq_categoria), 'PROPIA'
            FROM paginas_front f
           WHERE f.app_id = p_app_id
             AND TRIM(f.categoria) IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM apex a WHERE a.clave = TRANSLATE(UPPER(TRIM(f.categoria)), 'ÁÉÍÓÚÜ', 'AEIOUU'))
           GROUP BY TRANSLATE(UPPER(TRIM(f.categoria)), 'ÁÉÍÓÚÜ', 'AEIOUU')
        )
        SELECT categoria, seq, origen
          FROM todas
         ORDER BY seq NULLS LAST, categoria
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('categoria', c.categoria);
      APEX_JSON.WRITE('seq', c.seq);
      APEX_JSON.WRITE('origen', c.origen);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- INSERTAR
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token         IN VARCHAR2,
      p_app_id        IN NUMBER,
      p_page_id       IN NUMBER,
      p_page_title    IN VARCHAR2,
      p_entry_text    IN VARCHAR2,
      p_categoria     IN VARCHAR2,
      p_seq_categoria IN NUMBER,
      p_seq_pagina    IN NUMBER,
      p_activa        IN VARCHAR2,
      p_permiso       IN VARCHAR2) IS
    l_usuario  VARCHAR2(255);
    l_mensaje  VARCHAR2(400);
    l_apex     VARCHAR2(255);
    l_existe   PLS_INTEGER;
    l_permisos PLS_INTEGER := 0;
    -- Resueltos antes del SQL (las funciones privadas no van dentro de SQL).
    l_activa   VARCHAR2(1) := CASE WHEN UPPER(TRIM(p_activa)) = 'N' THEN 'N' ELSE 'S' END;
    l_todos    BOOLEAN     := NVL(UPPER(TRIM(p_permiso)) = 'TODOS', FALSE);
    l_yo       VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;
    IF NOT f_es_admin(l_usuario) THEN
      p_error(403, 'Forbidden', 'Solo el administrador puede modificar las paginas del menu');
      RETURN;
    END IF;
    l_yo := UPPER(TRIM(l_usuario));

    l_mensaje := f_validar(p_app_id, p_page_id, p_page_title, p_seq_categoria, p_seq_pagina);
    IF l_mensaje IS NOT NULL THEN
      p_error(400, 'Bad Request', l_mensaje);
      RETURN;
    END IF;

    p_set_workspace;
    l_apex := f_titulo_apex(p_app_id, p_page_id);
    IF l_apex IS NOT NULL THEN
      p_error(400, 'Bad Request',
              'El numero ' || p_page_id || ' ya lo usa la pagina del APEX "' || l_apex || '"');
      RETURN;
    END IF;

    SELECT COUNT(*) INTO l_existe
      FROM paginas_front
     WHERE app_id = p_app_id AND page_id = p_page_id;
    IF l_existe > 0 THEN
      p_error(400, 'Bad Request', 'Ya hay una pagina con el numero ' || p_page_id);
      RETURN;
    END IF;

    INSERT INTO paginas_front (app_id, page_id, page_title, entry_text, categoria,
                               seq_categoria, seq_pagina, activa)
    VALUES (p_app_id, p_page_id, TRIM(p_page_title), TRIM(p_entry_text), TRIM(p_categoria),
            p_seq_categoria, NVL(p_seq_pagina, 0), l_activa);

    -- Permisos: el que la crea siempre; con TODOS, ademas el resto de los
    -- usuarios que ya tienen alguna pagina en la app.
    IF l_todos THEN
      INSERT INTO roles_paginas (app_id, app_page_id, app_user_id,
                                 puede_insertar, puede_actualizar, puede_borrar,
                                 puede_consultar, ver_campos)
      SELECT p_app_id, p_page_id, u.app_user_id, 'S', 'S', 'S', 'S', 'N'
        FROM (SELECT r.app_user_id FROM roles_paginas r WHERE r.app_id = p_app_id
              UNION
              SELECT l_yo FROM dual) u
       WHERE NOT EXISTS (SELECT 1 FROM roles_paginas x
                          WHERE x.app_id = p_app_id
                            AND x.app_page_id = p_page_id
                            AND x.app_user_id = u.app_user_id);
    ELSE
      INSERT INTO roles_paginas (app_id, app_page_id, app_user_id,
                                 puede_insertar, puede_actualizar, puede_borrar,
                                 puede_consultar, ver_campos)
      SELECT p_app_id, p_page_id, l_yo, 'S', 'S', 'S', 'S', 'N'
        FROM dual
       WHERE NOT EXISTS (SELECT 1 FROM roles_paginas x
                          WHERE x.app_id = p_app_id
                            AND x.app_page_id = p_page_id
                            AND x.app_user_id = l_yo);
    END IF;
    l_permisos := SQL%ROWCOUNT;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Pagina creada');
    APEX_JSON.WRITE('page_id', p_page_id);
    APEX_JSON.WRITE('permisos', l_permisos);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      -- SQLCODE/SQLERRM se leen aca, dentro del manejador y antes del ROLLBACK.
      p_error_guardar(SQLCODE, SQLERRM);
      ROLLBACK;
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token         IN VARCHAR2,
      p_app_id        IN NUMBER,
      p_page_id       IN NUMBER,
      p_page_title    IN VARCHAR2,
      p_entry_text    IN VARCHAR2,
      p_categoria     IN VARCHAR2,
      p_seq_categoria IN NUMBER,
      p_seq_pagina    IN NUMBER,
      p_activa        IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_mensaje VARCHAR2(400);
    l_activa  VARCHAR2(1) := CASE WHEN UPPER(TRIM(p_activa)) = 'N' THEN 'N' ELSE 'S' END;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;
    IF NOT f_es_admin(l_usuario) THEN
      p_error(403, 'Forbidden', 'Solo el administrador puede modificar las paginas del menu');
      RETURN;
    END IF;

    l_mensaje := f_validar(p_app_id, p_page_id, p_page_title, p_seq_categoria, p_seq_pagina);
    IF l_mensaje IS NOT NULL THEN
      p_error(400, 'Bad Request', l_mensaje);
      RETURN;
    END IF;

    UPDATE paginas_front
       SET page_title    = TRIM(p_page_title),
           entry_text    = TRIM(p_entry_text),
           categoria     = TRIM(p_categoria),
           seq_categoria = p_seq_categoria,
           seq_pagina    = NVL(p_seq_pagina, 0),
           activa        = l_activa
     WHERE app_id = p_app_id
       AND page_id = p_page_id;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Pagina no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Pagina actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error_guardar(SQLCODE, SQLERRM);
      ROLLBACK;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(
      p_token   IN VARCHAR2,
      p_app_id  IN NUMBER,
      p_page_id IN NUMBER) IS
    l_usuario  VARCHAR2(255);
    l_permisos PLS_INTEGER := 0;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;
    IF NOT f_es_admin(l_usuario) THEN
      p_error(403, 'Forbidden', 'Solo el administrador puede modificar las paginas del menu');
      RETURN;
    END IF;

    DELETE FROM paginas_front
     WHERE app_id = p_app_id
       AND page_id = p_page_id;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Pagina no encontrada');
      RETURN;
    END IF;

    -- Los permisos se van con la pagina, salvo que el numero tambien sea una
    -- pagina del APEX (comparten ROLES_PAGINAS).
    p_set_workspace;
    IF f_titulo_apex(p_app_id, p_page_id) IS NULL THEN
      DELETE FROM roles_paginas
       WHERE app_id = p_app_id
         AND app_page_id = p_page_id;
      l_permisos := SQL%ROWCOUNT;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Pagina eliminada');
    APEX_JSON.WRITE('permisos', l_permisos);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_PAGINAS_FRONT_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 4) ENDPOINTS ORDS ======================================================
--   GET    /lubrimec/paginas-front?app_id=:n           -> listar (+ categorias)
--   POST   /lubrimec/paginas-front                     -> insertar
--   PUT    /lubrimec/paginas-front/:id                 -> actualizar (id = page_id)
--   DELETE /lubrimec/paginas-front/:id?app_id=:n       -> eliminar
--
-- Body JSON de POST/PUT: { app_id, page_id, page_title, entry_text, categoria,
-- seq_categoria, seq_pagina, activa, permiso } (permiso solo en POST).
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente: borra handlers previos si el script se re-ejecuta.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'paginas-front', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'paginas-front', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'paginas-front/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'paginas-front/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /paginas-front
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'paginas-front',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /paginas-front?app_id=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'paginas-front',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
    l_qs    VARCHAR2(4000);

    -- Extrae el valor de un parametro del query string (?clave=valor&...).
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    PKG_PAGINAS_FRONT_LUBRIMEC.LISTAR(
        p_token  => l_token,
        p_app_id => TO_NUMBER(get_qs(l_qs, 'app_id')));
END;
~');

  -- Mapea el header HTTP Authorization al bind :authorization.
  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'paginas-front',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- POST /paginas-front  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'paginas-front',
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

    PKG_PAGINAS_FRONT_LUBRIMEC.INSERTAR(
        p_token         => l_token,
        p_app_id        => TO_NUMBER(:app_id),
        p_page_id       => TO_NUMBER(:page_id),
        p_page_title    => :page_title,
        p_entry_text    => :entry_text,
        p_categoria     => :categoria,
        p_seq_categoria => TO_NUMBER(:seq_categoria),
        p_seq_pagina    => TO_NUMBER(:seq_pagina),
        p_activa        => :activa,
        p_permiso       => :permiso);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'paginas-front',
      p_method             => 'POST',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /paginas-front/:id  (id = page_id)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'paginas-front/:id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- PUT /paginas-front/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'paginas-front/:id',
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

    PKG_PAGINAS_FRONT_LUBRIMEC.ACTUALIZAR(
        p_token         => l_token,
        p_app_id        => TO_NUMBER(:app_id),
        p_page_id       => TO_NUMBER(:id),
        p_page_title    => :page_title,
        p_entry_text    => :entry_text,
        p_categoria     => :categoria,
        p_seq_categoria => TO_NUMBER(:seq_categoria),
        p_seq_pagina    => TO_NUMBER(:seq_pagina),
        p_activa        => :activa);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'paginas-front/:id',
      p_method             => 'PUT',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- DELETE /paginas-front/:id?app_id=:n  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'paginas-front/:id',
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

    PKG_PAGINAS_FRONT_LUBRIMEC.ELIMINAR(
        p_token   => l_token,
        p_app_id  => TO_NUMBER(:app_id),
        p_page_id => TO_NUMBER(:id));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'paginas-front/:id',
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
