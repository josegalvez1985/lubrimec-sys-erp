-- Paquete de autenticación: login (genera token Bearer), logout y validación.
-- Tabla LUBRIMEC_TOKENS: TOKEN, USUARIO, FECHA_CREACION, FECHA_EXPIRACION, ACTIVO.
-- Vencimiento del token: 6 horas (l_exp en LOGIN).
--
-- USUARIOS BLOQUEADOS: IS_LOGIN_PASSWORD_VALID solo compara la contraseña, NO mira
-- el estado de la cuenta. Sin el chequeo de usuario_bloqueado, una cuenta bloqueada
-- en APEX (ACCOUNT_LOCKED) entraba igual. Se controla en DOS lugares:
--   1) LOGIN         → no emite token (el usuario ve el motivo en el mensaje).
--   2) VALIDAR_TOKEN → corta la sesión YA abierta; sin esto el bloqueado seguía
--                      operando hasta 6 h con el token que ya tenía.

create or replace PACKAGE BODY PKG_AUTH_LUBRIMEC AS

FUNCTION generar_token (p_usuario IN VARCHAR2) RETURN VARCHAR2 IS
BEGIN
    RETURN UPPER(RAWTOHEX(SYS_GUID()) || RAWTOHEX(SYS_GUID()));
END generar_token;

-- Motivo de bloqueo de la cuenta APEX, o NULL si el usuario puede operar.
-- Devuelve texto listo para mostrar: el front pinta el 'message' tal cual.
--
-- SOLO se mira ACCOUNT_LOCKED: es lo que se marca al bloquear un usuario desde
-- la administracion de APEX. NO chequear ACCOUNT_EXPIRY aca: en esta instancia
-- viene con fecha pasada en cuentas perfectamente activas, y rechazaba usuarios
-- sanos con "La cuenta expiro" (bug real, no repetirlo). La expiracion de la
-- SESION ya la maneja FECHA_EXPIRACION de LUBRIMEC_TOKENS, que es otra cosa.
--
-- OJO con el contexto de workspace: WWV_FLOW_USERS devuelve 0 filas desde ORDS si
-- no está fijado (mismo gotcha que APEX_APPLICATION_* en ORDS_MENU_PAGINAS.sql).
-- Los llamadores fijan el contexto ANTES de invocar a esta función.
--
-- Un usuario que no existe NO se reporta como bloqueado: se deja caer en el
-- "usuario o contrasena incorrectos" de siempre, para no revelar qué cuentas existen.
FUNCTION usuario_bloqueado (p_usuario IN VARCHAR2) RETURN VARCHAR2 IS
    l_locked  VARCHAR2(1);
BEGIN
    SELECT NVL(UPPER(account_locked), 'N')
      INTO l_locked
      FROM wwv_flow_users
     WHERE UPPER(user_name) = UPPER(p_usuario)
       AND ROWNUM = 1;

    IF l_locked = 'Y' THEN
        RETURN 'Usuario bloqueado. Contacte al administrador.';
    END IF;

    RETURN NULL;
EXCEPTION
    -- Usuario inexistente: no es "bloqueado" (ver nota arriba).
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END usuario_bloqueado;

FUNCTION credenciales_validas (
    p_usuario IN VARCHAR2,
    p_password IN VARCHAR2
) RETURN BOOLEAN IS
    l_security_group_id NUMBER;
BEGIN
    l_security_group_id := APEX_UTIL.FIND_SECURITY_GROUP_ID(p_workspace => 'lubrimec');
    APEX_UTIL.SET_SECURITY_GROUP_ID(p_security_group_id => l_security_group_id);
    RETURN APEX_UTIL.IS_LOGIN_PASSWORD_VALID(
        p_username => UPPER(p_usuario),
        p_password => p_password
    );
END credenciales_validas;

PROCEDURE login (
    p_usuario IN VARCHAR2,
    p_password IN VARCHAR2
) IS
    l_token VARCHAR2(128);
    l_exp TIMESTAMP;
    l_bloqueo VARCHAR2(4000);
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    OWA_UTIL.HTTP_HEADER_CLOSE;
    IF p_usuario IS NULL OR p_password IS NULL THEN
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Usuario y contrasena son obligatorios');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;
    IF credenciales_validas(p_usuario, p_password) THEN
        -- credenciales_validas ya dejo fijado el contexto de workspace APEX, que es
        -- lo que necesita usuario_bloqueado para ver filas en WWV_FLOW_USERS.
        l_bloqueo := usuario_bloqueado(p_usuario);
        IF l_bloqueo IS NOT NULL THEN
            -- Contrasena correcta pero cuenta bloqueada/expirada: NO se emite token.
            -- Ademas se cortan las sesiones que hubiera dejado abiertas.
            UPDATE LUBRIMEC_TOKENS
            SET ACTIVO = 'N'
            WHERE USUARIO = UPPER(p_usuario)
            AND ACTIVO = 'S';
            COMMIT;
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', FALSE);
            APEX_JSON.WRITE('message', l_bloqueo);
            APEX_JSON.CLOSE_OBJECT;
            RETURN;
        END IF;

        l_token := generar_token(p_usuario);
        -- Vencimiento del token: 6 horas.
        l_exp := SYSTIMESTAMP + NUMTODSINTERVAL(6 * 60 * 60, 'SECOND');
        UPDATE LUBRIMEC_TOKENS
        SET ACTIVO = 'N'
        WHERE USUARIO = UPPER(p_usuario)
        AND ACTIVO = 'S';
        INSERT INTO LUBRIMEC_TOKENS (TOKEN, USUARIO, FECHA_CREACION, FECHA_EXPIRACION, ACTIVO)
        VALUES (l_token, UPPER(p_usuario), SYSTIMESTAMP, l_exp, 'S');
        COMMIT;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('message', 'Autenticacion exitosa');
        APEX_JSON.OPEN_OBJECT('data');
        APEX_JSON.WRITE('token', l_token);
        APEX_JSON.WRITE('usuario', UPPER(p_usuario));
        APEX_JSON.WRITE('expira', TO_CHAR(l_exp, 'YYYY-MM-DD"T"HH24:MI:SS'));
        APEX_JSON.CLOSE_OBJECT;
        APEX_JSON.CLOSE_OBJECT;
    ELSE
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Usuario o contrasena incorrectos');
        APEX_JSON.CLOSE_OBJECT;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END login;

PROCEDURE logout (
    p_token IN VARCHAR2
) IS
    l_filas NUMBER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    OWA_UTIL.HTTP_HEADER_CLOSE;
    UPDATE LUBRIMEC_TOKENS
    SET ACTIVO = 'N'
    WHERE TOKEN = UPPER(p_token)
    AND ACTIVO = 'S';
    l_filas := SQL%ROWCOUNT;
    COMMIT;
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', l_filas > 0);
    APEX_JSON.WRITE('message',
        CASE WHEN l_filas > 0 THEN 'Sesion cerrada'
        ELSE 'Token no encontrado o ya inactivo' END);
    APEX_JSON.CLOSE_OBJECT;
END logout;

FUNCTION validar_token (
    p_token IN VARCHAR2
) RETURN VARCHAR2 IS
    l_usuario VARCHAR2(255);
BEGIN
    SELECT USUARIO
    INTO l_usuario
    FROM LUBRIMEC_TOKENS
    WHERE TOKEN = UPPER(p_token)
    AND ACTIVO = 'S'
    AND FECHA_EXPIRACION > SYSTIMESTAMP;

    -- El token sigue vigente, pero la cuenta pudo bloquearse DESPUES del login:
    -- sin esto el usuario bloqueado seguia operando hasta 6 h. Corre en cada
    -- request protegido, asi que el bloqueo tiene efecto en la accion siguiente.
    -- Contexto de workspace: aca NO lo dejo fijado credenciales_validas (eso solo
    -- pasa en el login), hay que fijarlo explicitamente o WWV_FLOW_USERS da 0 filas.
    wwv_flow_api.set_security_group_id(p_security_group_id => 36593577189528884915);
    IF usuario_bloqueado(l_usuario) IS NOT NULL THEN
        -- Devolver NULL basta: cada paquete responde 401 'Token invalido o expirado'
        -- y el front cierra la sesion. No se hace DML aca (es el camino caliente de
        -- TODA lectura); el token queda desactivado en el proximo intento de login.
        RETURN NULL;
    END IF;

    RETURN l_usuario;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END validar_token;

END PKG_AUTH_LUBRIMEC;
/
