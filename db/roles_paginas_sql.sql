--------------------------------------------------------------------------------
-- ROLES DE PAGINAS (paginas APEX 37 grilla + 38 modal Crear Rol) — paquete CRUD
-- + endpoints ORDS en un archivo. Ejecutar completo como el esquema JOSEGALVEZ.
-- Requiere PKG_AUTH_LUBRIMEC.
--
-- CRUD sobre ROLES_PAGINAS (PK compuesta app_id + app_page_id + app_user_id;
-- flags 'S'/'N': puede_insertar/actualizar/borrar/consultar y ver_campos).
-- En edicion solo se actualizan los flags (la PK queda fija, como el modal 38).
--
-- GOTCHA: las vistas APEX_APPLICATION_* y WWV_FLOW_USERS devuelven 0 filas desde
-- ORDS sin contexto de workspace; se fija con wwv_flow_api.set_security_group_id
-- (workspace JOSEGALVEZ id 36593577189528884915). Igual que en ORDS_MENU_PAGINAS.
--
-- LOVs (lista completa + filtro front):
--   lov-usuarios: WWV_FLOW_USERS (query de la LOV nombrada USUARIOS del APEX).
--   lov-paginas:  TODAS las paginas de la app (page_id < 9999, sin 0 ni 1);
--                 el front excluye las ya asignadas al usuario al crear.
--
-- Rutas:
--   GET    /lubrimec/roles-paginas?app_id=:n                 -> listar
--   POST   /lubrimec/roles-paginas                           -> insertar
--   PUT    /lubrimec/roles-paginas                           -> actualizar flags
--   DELETE /lubrimec/roles-paginas?app_id=&app_page_id=&app_user_id=  -> eliminar
--   GET    /lubrimec/roles-paginas/lov-usuarios              -> LOV usuarios
--   GET    /lubrimec/roles-paginas/lov-paginas?app_id=:n     -> LOV paginas
--
-- === 1) PAQUETE PKG_ROLES_PAG_LUBRIMEC =====================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_ROLES_PAG_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token  IN VARCHAR2,
      p_app_id IN NUMBER);

  PROCEDURE INSERTAR(
      p_token            IN VARCHAR2,
      p_app_id           IN NUMBER,
      p_app_page_id      IN NUMBER,
      p_app_user_id      IN VARCHAR2,
      p_puede_insertar   IN VARCHAR2,
      p_puede_actualizar IN VARCHAR2,
      p_puede_borrar     IN VARCHAR2,
      p_puede_consultar  IN VARCHAR2,
      p_ver_campos       IN VARCHAR2);

  PROCEDURE ACTUALIZAR(
      p_token            IN VARCHAR2,
      p_app_id           IN NUMBER,
      p_app_page_id      IN NUMBER,
      p_app_user_id      IN VARCHAR2,
      p_puede_insertar   IN VARCHAR2,
      p_puede_actualizar IN VARCHAR2,
      p_puede_borrar     IN VARCHAR2,
      p_puede_consultar  IN VARCHAR2,
      p_ver_campos       IN VARCHAR2);

  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_app_id      IN NUMBER,
      p_app_page_id IN NUMBER,
      p_app_user_id IN VARCHAR2);

  -- Copia los roles del usuario inicial al final (solo los que no tiene).
  -- Tal cual el APEX (pag 64): ver_campos NO se copia.
  PROCEDURE COPIAR(
      p_token           IN VARCHAR2,
      p_app_id          IN NUMBER,
      p_usuario_inicial IN VARCHAR2,
      p_usuario_final   IN VARCHAR2);

  PROCEDURE LOV_USUARIOS(p_token IN VARCHAR2);

  PROCEDURE LOV_PAGINAS(
      p_token  IN VARCHAR2,
      p_app_id IN NUMBER);

END PKG_ROLES_PAG_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_ROLES_PAG_LUBRIMEC AS

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

  -- Contexto de workspace APEX (sin esto APEX_* y WWV_FLOW_USERS dan 0 filas).
  PROCEDURE p_set_workspace IS
  BEGIN
    wwv_flow_api.set_security_group_id(p_security_group_id => 36593577189528884915);
  END p_set_workspace;

  -- Normaliza un flag a 'S'/'N'.
  FUNCTION f_flag(p_v IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE WHEN UPPER(p_v) = 'S' THEN 'S' ELSE 'N' END;
  END f_flag;

  --------------------------------------------------------------------------
  -- LISTAR (grilla de la pag 37, con el titulo de la pagina)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token  IN VARCHAR2,
      p_app_id IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    p_set_workspace;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT a.app_id,
               a.app_page_id,
               a.app_user_id,
               b.page_title AS pagina,
               NVL(a.puede_insertar, 'N')   AS puede_insertar,
               NVL(a.puede_actualizar, 'N') AS puede_actualizar,
               NVL(a.puede_borrar, 'N')     AS puede_borrar,
               NVL(a.puede_consultar, 'N')  AS puede_consultar,
               NVL(a.ver_campos, 'N')       AS ver_campos
          FROM roles_paginas a
          LEFT JOIN apex_application_pages b
                 ON b.application_id = a.app_id
                AND b.page_id = a.app_page_id
                AND b.workspace = 'JOSEGALVEZ'
         WHERE a.app_id = p_app_id
         ORDER BY a.app_user_id, a.app_page_id
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('app_id', r.app_id);
      APEX_JSON.WRITE('app_page_id', r.app_page_id);
      APEX_JSON.WRITE('app_user_id', r.app_user_id);
      APEX_JSON.WRITE('pagina', r.pagina);
      APEX_JSON.WRITE('puede_insertar', r.puede_insertar);
      APEX_JSON.WRITE('puede_actualizar', r.puede_actualizar);
      APEX_JSON.WRITE('puede_borrar', r.puede_borrar);
      APEX_JSON.WRITE('puede_consultar', r.puede_consultar);
      APEX_JSON.WRITE('ver_campos', r.ver_campos);
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
      p_token            IN VARCHAR2,
      p_app_id           IN NUMBER,
      p_app_page_id      IN NUMBER,
      p_app_user_id      IN VARCHAR2,
      p_puede_insertar   IN VARCHAR2,
      p_puede_actualizar IN VARCHAR2,
      p_puede_borrar     IN VARCHAR2,
      p_puede_consultar  IN VARCHAR2,
      p_ver_campos       IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    -- f_flag no puede usarse dentro de SQL (PLS-00231): se resuelve antes.
    l_ins VARCHAR2(1) := f_flag(p_puede_insertar);
    l_act VARCHAR2(1) := f_flag(p_puede_actualizar);
    l_bor VARCHAR2(1) := f_flag(p_puede_borrar);
    l_con VARCHAR2(1) := f_flag(p_puede_consultar);
    l_ver VARCHAR2(1) := f_flag(p_ver_campos);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_app_id IS NULL OR p_app_page_id IS NULL OR p_app_user_id IS NULL THEN
      p_error(400, 'Bad Request', 'app_id, app_page_id y app_user_id son obligatorios');
      RETURN;
    END IF;

    INSERT INTO roles_paginas (app_id, app_page_id, app_user_id,
                               puede_insertar, puede_actualizar, puede_borrar,
                               puede_consultar, ver_campos)
    VALUES (p_app_id, p_app_page_id, UPPER(p_app_user_id),
            l_ins, l_act, l_bor,
            l_con, l_ver);
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Rol creado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(400, 'Bad Request', 'El usuario ya tiene un rol para esa pagina');
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR (solo los flags; la PK queda fija)
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token            IN VARCHAR2,
      p_app_id           IN NUMBER,
      p_app_page_id      IN NUMBER,
      p_app_user_id      IN VARCHAR2,
      p_puede_insertar   IN VARCHAR2,
      p_puede_actualizar IN VARCHAR2,
      p_puede_borrar     IN VARCHAR2,
      p_puede_consultar  IN VARCHAR2,
      p_ver_campos       IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    -- f_flag no puede usarse dentro de SQL (PLS-00231): se resuelve antes.
    l_ins VARCHAR2(1) := f_flag(p_puede_insertar);
    l_act VARCHAR2(1) := f_flag(p_puede_actualizar);
    l_bor VARCHAR2(1) := f_flag(p_puede_borrar);
    l_con VARCHAR2(1) := f_flag(p_puede_consultar);
    l_ver VARCHAR2(1) := f_flag(p_ver_campos);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    UPDATE roles_paginas
       SET puede_insertar   = l_ins,
           puede_actualizar = l_act,
           puede_borrar     = l_bor,
           puede_consultar  = l_con,
           ver_campos       = l_ver
     WHERE app_id = p_app_id
       AND app_page_id = p_app_page_id
       AND app_user_id = UPPER(p_app_user_id);

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Rol no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Rol actualizado');
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
      p_app_id      IN NUMBER,
      p_app_page_id IN NUMBER,
      p_app_user_id IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM roles_paginas
     WHERE app_id = p_app_id
       AND app_page_id = p_app_page_id
       AND app_user_id = UPPER(p_app_user_id);

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Rol no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Rol eliminado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- COPIAR (proceso de la pag 64: roles del inicial que el final no tiene)
  --------------------------------------------------------------------------
  PROCEDURE COPIAR(
      p_token           IN VARCHAR2,
      p_app_id          IN NUMBER,
      p_usuario_inicial IN VARCHAR2,
      p_usuario_final   IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_ini     VARCHAR2(255) := UPPER(p_usuario_inicial);
    l_fin     VARCHAR2(255) := UPPER(p_usuario_final);
    l_n       PLS_INTEGER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF l_ini IS NULL OR l_fin IS NULL THEN
      p_error(400, 'Bad Request', 'usuario_inicial y usuario_final son obligatorios');
      RETURN;
    END IF;
    IF l_ini = l_fin THEN
      p_error(400, 'Bad Request', 'El usuario final debe ser distinto del inicial');
      RETURN;
    END IF;

    -- Tal cual el APEX: copia los 4 flags (ver_campos no se copia).
    INSERT INTO roles_paginas (app_id, app_page_id, puede_insertar, puede_actualizar,
                               puede_borrar, puede_consultar, app_user_id)
    SELECT a.app_id, a.app_page_id, a.puede_insertar, a.puede_actualizar,
           a.puede_borrar, a.puede_consultar, l_fin
      FROM roles_paginas a
     WHERE a.app_id = p_app_id
       AND a.app_user_id = l_ini
       AND NOT EXISTS (SELECT 1
                         FROM roles_paginas b
                        WHERE b.app_id = a.app_id
                          AND b.app_page_id = a.app_page_id
                          AND b.app_user_id = l_fin);

    l_n := SQL%ROWCOUNT;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Se copiaron ' || l_n || ' roles');
    APEX_JSON.WRITE('copiados', l_n);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END COPIAR;

  --------------------------------------------------------------------------
  -- LOV_USUARIOS (query de la LOV nombrada USUARIOS: WWV_FLOW_USERS)
  --------------------------------------------------------------------------
  PROCEDURE LOV_USUARIOS(p_token IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    p_set_workspace;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT DISTINCT user_name
          FROM wwv_flow_users
         ORDER BY user_name
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('user_name', r.user_name);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LOV_USUARIOS;

  --------------------------------------------------------------------------
  -- LOV_PAGINAS (todas las paginas de la app; el front excluye las asignadas)
  --------------------------------------------------------------------------
  PROCEDURE LOV_PAGINAS(
      p_token  IN VARCHAR2,
      p_app_id IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    p_set_workspace;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT a.page_id, a.page_title
          FROM apex_application_pages a
         WHERE a.workspace = 'JOSEGALVEZ'
           AND a.application_id = p_app_id
           AND a.page_id < 9999
           AND a.page_id NOT IN (0, 1)
         ORDER BY a.page_title
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('page_id', r.page_id);
      APEX_JSON.WRITE('page_title', r.page_title);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LOV_PAGINAS;

END PKG_ROLES_PAG_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas', 'GET');               EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas', 'POST');              EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas', 'PUT');               EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas', 'DELETE');            EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas/copiar', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas/lov-usuarios', 'GET');  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'roles-paginas/lov-paginas', 'GET');   EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /roles-paginas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'roles-paginas',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /roles-paginas?app_id=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas',
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
    PKG_ROLES_PAG_LUBRIMEC.LISTAR(
        p_token  => l_token,
        p_app_id => TO_NUMBER(NVL(get_qs(l_qs, 'app_id'), '86972')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- POST /roles-paginas  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas',
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

    PKG_ROLES_PAG_LUBRIMEC.INSERTAR(
        p_token            => l_token,
        p_app_id           => TO_NUMBER(:app_id),
        p_app_page_id      => TO_NUMBER(:app_page_id),
        p_app_user_id      => :app_user_id,
        p_puede_insertar   => :puede_insertar,
        p_puede_actualizar => :puede_actualizar,
        p_puede_borrar     => :puede_borrar,
        p_puede_consultar  => :puede_consultar,
        p_ver_campos       => :ver_campos);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- PUT /roles-paginas  -> actualizar flags (PK en el body)
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas',
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

    PKG_ROLES_PAG_LUBRIMEC.ACTUALIZAR(
        p_token            => l_token,
        p_app_id           => TO_NUMBER(:app_id),
        p_app_page_id      => TO_NUMBER(:app_page_id),
        p_app_user_id      => :app_user_id,
        p_puede_insertar   => :puede_insertar,
        p_puede_actualizar => :puede_actualizar,
        p_puede_borrar     => :puede_borrar,
        p_puede_consultar  => :puede_consultar,
        p_ver_campos       => :ver_campos);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /roles-paginas?app_id=&app_page_id=&app_user_id=  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas',
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
    PKG_ROLES_PAG_LUBRIMEC.ELIMINAR(
        p_token       => l_token,
        p_app_id      => TO_NUMBER(NVL(get_qs(l_qs, 'app_id'), '86972')),
        p_app_page_id => TO_NUMBER(get_qs(l_qs, 'app_page_id')),
        p_app_user_id => get_qs(l_qs, 'app_user_id'));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- POST /roles-paginas/copiar  -> copiar roles entre usuarios (modal 64)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'roles-paginas/copiar',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas/copiar',
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

    PKG_ROLES_PAG_LUBRIMEC.COPIAR(
        p_token           => l_token,
        p_app_id          => TO_NUMBER(NVL(:app_id, '86972')),
        p_usuario_inicial => :usuario_inicial,
        p_usuario_final   => :usuario_final);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas/copiar', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /roles-paginas/lov-usuarios  -> LOV completa de usuarios APEX
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'roles-paginas/lov-usuarios',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas/lov-usuarios',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256);
    l_pos   PLS_INTEGER;
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

    PKG_ROLES_PAG_LUBRIMEC.LOV_USUARIOS(p_token => l_token);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas/lov-usuarios', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- GET /roles-paginas/lov-paginas?app_id=:n  -> LOV completa de paginas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'roles-paginas/lov-paginas',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'roles-paginas/lov-paginas',
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
    PKG_ROLES_PAG_LUBRIMEC.LOV_PAGINAS(
        p_token  => l_token,
        p_app_id => TO_NUMBER(NVL(get_qs(l_qs, 'app_id'), '86972')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'roles-paginas/lov-paginas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
