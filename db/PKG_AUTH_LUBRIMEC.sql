-- Paquete de autenticación: login (genera token Bearer), logout y validación.
-- Tabla LUBRIMEC_TOKENS: TOKEN, USUARIO, FECHA_CREACION, FECHA_EXPIRACION, ACTIVO.
-- Vencimiento del token: 6 horas (l_exp en LOGIN).

create or replace PACKAGE BODY PKG_AUTH_LUBRIMEC AS

FUNCTION generar_token (p_usuario IN VARCHAR2) RETURN VARCHAR2 IS
BEGIN
    RETURN UPPER(RAWTOHEX(SYS_GUID()) || RAWTOHEX(SYS_GUID()));
END generar_token;

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
    RETURN l_usuario;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END validar_token;

END PKG_AUTH_LUBRIMEC;
/
