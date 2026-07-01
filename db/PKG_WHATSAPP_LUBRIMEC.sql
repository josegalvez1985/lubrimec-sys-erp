--------------------------------------------------------------------------------
-- PKG_WHATSAPP_LUBRIMEC : endpoints de la pagina 117 (Mensajes a WhatsApp).
--
--   LISTAR_NUMEROS(token, solo_pendientes)  -> numeros de numeros_whatsapp
--   ENVIAR(token, mensaje, imagen_base64, imagen_nombre) -> lanza job y responde job_id
--   LOGS(token, desde)                      -> filas de LOG_WHATSAPP para el polling
--
-- El envio real corre en background (DBMS_SCHEDULER) porque cada numero tiene una
-- pausa de ~20s: un request HTTP no puede quedarse esperando ~30 min. El job invoca
-- ENVIAR_MENSAJES_WHATSAPP (procedimiento existente, ya extendido para imagen).
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC y las tablas
-- numeros_whatsapp / LOG_WHATSAPP. Ver db/GUIA_ENDPOINTS.md.
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_WHATSAPP_LUBRIMEC AS
    PROCEDURE LISTAR_NUMEROS(
        p_token           IN VARCHAR2,
        p_solo_pendientes IN VARCHAR2 DEFAULT 'S');

    -- p_numeros_manual: JSON array de strings, ej. '["595981...","595982..."]'.
    -- Si viene, esos numeros se insertan en numeros_whatsapp (pendientes) antes de enviar.
    -- p_imagen_url: URL publica de la imagen (wasender no acepta base64).
    PROCEDURE ENVIAR(
        p_token          IN VARCHAR2,
        p_mensaje        IN VARCHAR2,
        p_imagen_url     IN VARCHAR2 DEFAULT NULL,
        p_numeros_manual IN VARCHAR2 DEFAULT NULL);

    PROCEDURE LOGS(
        p_token IN VARCHAR2,
        p_desde IN VARCHAR2 DEFAULT NULL);  -- ISO timestamp; NULL = todo el dia

    -- Sube una imagen (base64) a wasenderapi /api/upload y responde {url} con la URL
    -- publica (CDN de wasender) que se usara como imageUrl. p_base64: data URL o base64 puro.
    PROCEDURE SUBIR_IMAGEN(
        p_token  IN VARCHAR2,
        p_base64 IN CLOB,
        p_mime   IN VARCHAR2 DEFAULT NULL,
        p_nombre IN VARCHAR2 DEFAULT NULL);

    -- Carga masiva: p_numeros es un JSON array de strings. Inserta los validos que no
    -- existan ya (mensajeado='N'). Responde {insertados, omitidos}.
    PROCEDURE CARGAR_NUMEROS(
        p_token   IN VARCHAR2,
        p_numeros IN CLOB);

    -- Borra TODOS los numeros de numeros_whatsapp.
    PROCEDURE BORRAR_NUMEROS(p_token IN VARCHAR2);
END PKG_WHATSAPP_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_WHATSAPP_LUBRIMEC AS

    -- API key de wasenderapi (la misma del envio). Se usa para subir la imagen a
    -- POST /api/upload, que devuelve una URL publica (CDN de wasender, valida 24h).
    C_WASENDER_KEY CONSTANT VARCHAR2(200) :=
        '95f3747b28d911bd7ea91f261101bd4bcc258a51bbebd55f439e673bba7929bd';

    -- Respuesta de error estandar del proyecto.
    PROCEDURE p_error(p_status IN NUMBER, p_message IN VARCHAR2) IS
    BEGIN
        OWA_UTIL.STATUS_LINE(p_status, NULL, FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', p_message);
        APEX_JSON.CLOSE_OBJECT;
    END p_error;

    -- Valida el token y devuelve el usuario (NULL si invalido).
    FUNCTION f_usuario(p_token IN VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END f_usuario;

    ----------------------------------------------------------------------------
    PROCEDURE LISTAR_NUMEROS(
        p_token           IN VARCHAR2,
        p_solo_pendientes IN VARCHAR2 DEFAULT 'S')
    IS
        l_usuario VARCHAR2(256);
    BEGIN
        l_usuario := f_usuario(p_token);
        IF l_usuario IS NULL THEN
            p_error(401, 'Token invalido o expirado');
            RETURN;
        END IF;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.OPEN_ARRAY('data');
        FOR r IN (
            SELECT id, numero, NVL(mensajeado, 'N') AS mensajeado
            FROM   numeros_whatsapp
            WHERE  (p_solo_pendientes = 'N' OR NVL(mensajeado, 'N') <> 'S')
            ORDER  BY id
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('id', r.id);
            APEX_JSON.WRITE('numero', r.numero);
            APEX_JSON.WRITE('mensajeado', r.mensajeado);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
    EXCEPTION WHEN OTHERS THEN
        p_error(500, 'Error al listar numeros: ' || SQLERRM);
    END LISTAR_NUMEROS;

    ----------------------------------------------------------------------------
    PROCEDURE ENVIAR(
        p_token          IN VARCHAR2,
        p_mensaje        IN VARCHAR2,
        p_imagen_url     IN VARCHAR2 DEFAULT NULL,
        p_numeros_manual IN VARCHAR2 DEFAULT NULL)
    IS
        l_usuario   VARCHAR2(256);
        l_job       VARCHAR2(128);
        l_env_id    NUMBER;
    BEGIN
        l_usuario := f_usuario(p_token);
        IF l_usuario IS NULL THEN
            p_error(401, 'Token invalido o expirado');
            RETURN;
        END IF;

        IF p_mensaje IS NULL AND p_imagen_url IS NULL THEN
            p_error(400, 'Debe enviar un mensaje o una imagen');
            RETURN;
        END IF;

        -- Persistir el envio. Si p_numeros_manual viene (pestana Manual), se guarda
        -- la lista y el proc envia SOLO a esos numeros (no toca numeros_whatsapp).
        -- Si es NULL (pestana De la base), el proc procesa los pendientes de la tabla.
        INSERT INTO WHATSAPP_ENVIOS (mensaje, imagen_url, numeros_manual, usuario, estado)
        VALUES (p_mensaje, p_imagen_url, p_numeros_manual, l_usuario, 'PENDIENTE')
        RETURNING id INTO l_env_id;

        l_job := 'WSP_ENVIO_' || l_env_id;

        DBMS_SCHEDULER.CREATE_JOB(
            job_name   => l_job,
            job_type   => 'PLSQL_BLOCK',
            job_action => 'BEGIN ENVIAR_MENSAJES_WHATSAPP_JOB(' || l_env_id || '); END;',
            start_date => SYSTIMESTAMP,
            enabled    => TRUE,
            auto_drop  => TRUE);

        COMMIT;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('message', 'Envio iniciado');
        APEX_JSON.WRITE('envio_id', l_env_id);
        APEX_JSON.WRITE('job', l_job);
        APEX_JSON.CLOSE_OBJECT;
    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error(500, 'Error al iniciar envio: ' || SQLERRM);
    END ENVIAR;

    ----------------------------------------------------------------------------
    PROCEDURE LOGS(
        p_token IN VARCHAR2,
        p_desde IN VARCHAR2 DEFAULT NULL)
    IS
        l_usuario VARCHAR2(256);
        l_desde   TIMESTAMP;
    BEGIN
        l_usuario := f_usuario(p_token);
        IF l_usuario IS NULL THEN
            p_error(401, 'Token invalido o expirado');
            RETURN;
        END IF;

        BEGIN
            l_desde := TO_TIMESTAMP_TZ(p_desde, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM');
        EXCEPTION WHEN OTHERS THEN
            l_desde := TRUNC(SYSTIMESTAMP);  -- por defecto: desde hoy
        END;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.OPEN_ARRAY('data');
        FOR r IN (
            SELECT numero_original, numero_limpio, estado, http_status,
                   detalle_error, fecha_registro
            FROM   LOG_WHATSAPP
            WHERE  fecha_registro >= l_desde
            ORDER  BY fecha_registro
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('numero',   NVL(r.numero_limpio, r.numero_original));
            APEX_JSON.WRITE('estado',   r.estado);
            APEX_JSON.WRITE('http',     r.http_status);
            APEX_JSON.WRITE('detalle',  r.detalle_error);
            APEX_JSON.WRITE('fecha',    TO_CHAR(r.fecha_registro, 'YYYY-MM-DD"T"HH24:MI:SS'));
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
        APEX_JSON.CLOSE_OBJECT;
    EXCEPTION WHEN OTHERS THEN
        p_error(500, 'Error al leer logs: ' || SQLERRM);
    END LOGS;

    ----------------------------------------------------------------------------
    -- Sube la imagen al propio wasenderapi (POST /api/upload) y devuelve su URL
    -- publica (CDN de wasender, valida 24h). Asi wasender descarga la imagen de su
    -- propio storage al enviar: sin imgbb ni ORDS sirviendo el BLOB (que daba timeout).
    -- Recibe el base64 puro + mime del front; arma el data URL que espera /api/upload.
    PROCEDURE SUBIR_IMAGEN(
        p_token  IN VARCHAR2,
        p_base64 IN CLOB,
        p_mime   IN VARCHAR2 DEFAULT NULL,
        p_nombre IN VARCHAR2 DEFAULT NULL)
    IS
        l_usuario  VARCHAR2(256);
        l_b64      CLOB;
        l_mime     VARCHAR2(100);
        l_datauri  CLOB;
        l_body     CLOB;
        l_response CLOB;
        l_status   NUMBER;
        l_url      VARCHAR2(1000);
        l_comma    PLS_INTEGER;
    BEGIN
        l_usuario := f_usuario(p_token);
        IF l_usuario IS NULL THEN
            p_error(401, 'Token invalido o expirado');
            RETURN;
        END IF;

        IF p_base64 IS NULL OR DBMS_LOB.GETLENGTH(p_base64) = 0 THEN
            p_error(400, 'Imagen vacia');
            RETURN;
        END IF;

        l_b64  := p_base64;
        l_mime := NVL(p_mime, 'image/jpeg');

        -- Normaliza a data URL "data:<mime>;base64,<datos>" (lo que espera /api/upload).
        IF DBMS_LOB.SUBSTR(l_b64, 5, 1) = 'data:' THEN
            l_datauri := l_b64;  -- ya viene como data URL
        ELSE
            l_datauri := 'data:' || l_mime || ';base64,' || l_b64;
        END IF;

        -- Body JSON: {"base64":"<data uri>"}. El base64 no tiene comillas ni backslash,
        -- asi que concatenar directo es seguro.
        l_body := '{"base64":"' || l_datauri || '"}';

        APEX_WEB_SERVICE.SET_REQUEST_HEADERS(
            p_name_01  => 'Authorization', p_value_01 => 'Bearer ' || C_WASENDER_KEY,
            p_name_02  => 'Content-Type',  p_value_02 => 'application/json',
            p_reset    => TRUE);

        l_response := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
            p_url         => 'https://wasenderapi.com/api/upload',
            p_http_method => 'POST',
            p_body        => l_body);

        l_status := APEX_WEB_SERVICE.G_STATUS_CODE;

        IF l_status NOT IN (200, 201) THEN
            p_error(502, 'wasender /upload devolvio HTTP ' || l_status || ': ' ||
                         DBMS_LOB.SUBSTR(l_response, 300, 1));
            RETURN;
        END IF;

        APEX_JSON.PARSE(l_response);
        l_url := APEX_JSON.GET_VARCHAR2('publicUrl');

        IF l_url IS NULL THEN
            p_error(502, 'wasender /upload no devolvio publicUrl');
            RETURN;
        END IF;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('url', l_url);
        APEX_JSON.CLOSE_OBJECT;
    EXCEPTION WHEN OTHERS THEN
        p_error(500, 'Error al subir imagen: ' || SQLERRM);
    END SUBIR_IMAGEN;

    ----------------------------------------------------------------------------
    PROCEDURE CARGAR_NUMEROS(
        p_token   IN VARCHAR2,
        p_numeros IN CLOB)
    IS
        l_usuario     VARCHAR2(256);
        l_numero      VARCHAR2(100);
        l_existe      NUMBER;
        l_ins         NUMBER := 0;
        l_omit        NUMBER := 0;
    BEGIN
        l_usuario := f_usuario(p_token);
        IF l_usuario IS NULL THEN
            p_error(401, 'Token invalido o expirado');
            RETURN;
        END IF;

        APEX_JSON.PARSE(p_numeros);
        FOR i IN 1 .. APEX_JSON.GET_COUNT('.') LOOP
            l_numero := TRIM(APEX_JSON.GET_VARCHAR2('[%d]', i));
            IF l_numero IS NOT NULL THEN
                SELECT COUNT(*) INTO l_existe
                FROM   numeros_whatsapp WHERE numero = l_numero;
                IF l_existe = 0 THEN
                    INSERT INTO numeros_whatsapp (numero, mensajeado)
                    VALUES (l_numero, 'N');
                    l_ins := l_ins + 1;
                ELSE
                    l_omit := l_omit + 1;
                END IF;
            END IF;
        END LOOP;
        COMMIT;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('insertados', l_ins);
        APEX_JSON.WRITE('omitidos', l_omit);
        APEX_JSON.CLOSE_OBJECT;
    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error(500, 'Error al cargar numeros: ' || SQLERRM);
    END CARGAR_NUMEROS;

    ----------------------------------------------------------------------------
    PROCEDURE BORRAR_NUMEROS(p_token IN VARCHAR2) IS
        l_usuario VARCHAR2(256);
        l_borrados NUMBER;
    BEGIN
        l_usuario := f_usuario(p_token);
        IF l_usuario IS NULL THEN
            p_error(401, 'Token invalido o expirado');
            RETURN;
        END IF;

        DELETE FROM numeros_whatsapp;
        l_borrados := SQL%ROWCOUNT;
        COMMIT;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        APEX_JSON.WRITE('borrados', l_borrados);
        APEX_JSON.CLOSE_OBJECT;
    EXCEPTION WHEN OTHERS THEN
        ROLLBACK;
        p_error(500, 'Error al borrar numeros: ' || SQLERRM);
    END BORRAR_NUMEROS;

END PKG_WHATSAPP_LUBRIMEC;
/
