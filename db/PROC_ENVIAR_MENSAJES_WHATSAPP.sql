--------------------------------------------------------------------------------
-- ENVIAR_MENSAJES_WHATSAPP : version extendida con soporte de imagen.
--
-- Cambios respecto a la version original (la del boton APEX):
--   * Nuevo parametro p_imagen_url.
--   * Si hay imagen, el JSON incluye "imageUrl"; el texto va como caption ("text").
--   * El resto (reintentos, pausa 20s, logs, mensajeado) se mantiene igual.
--
-- wasenderapi (POST /api/send-message) envia imagen con el MISMO endpoint del texto:
--   { "to": "...", "text": "<caption>", "imageUrl": "<URL publica JPEG/PNG, max 5MB>" }
-- Solo acepta URL PUBLICA (no base64). El front sube la imagen al server Node
-- (src/routes/api/uploads.ts) y manda aca la URL resultante.
--------------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE ENVIAR_MENSAJES_WHATSAPP (
    p_mensaje        IN  VARCHAR2,
    p_imagen_url     IN  VARCHAR2 DEFAULT NULL,
    p_numeros_manual IN  CLOB     DEFAULT NULL,  -- JSON array: si viene, envia SOLO a estos
    p_error          OUT VARCHAR2
) AS

    v_api_url           VARCHAR2(500)  := 'https://wasenderapi.com/api/send-message';
    v_api_key           VARCHAR2(500)  := 'e83c588e35133bccc177db1df36ab10701640d02437dfb17438cc5aaa288350c';
    v_max_reintentos    NUMBER         := 3;
    v_pausa_entre_msgs  NUMBER         := 20;
    v_max_registros     NUMBER         := 50;
    v_numero_aviso      VARCHAR2(20)   := '0972111745';  -- avisar aqui al terminar

    v_request_body      CLOB;
    v_contador_enviados NUMBER         := 0;
    v_contador_errores  NUMBER         := 0;
    v_contador_invalidos NUMBER        := 0;
    v_contador_total    NUMBER         := 0;
    v_numero_original   VARCHAR2(100);
    v_numero_limpio     VARCHAR2(100);
    v_mensaje_esc       VARCHAR2(4000);
    v_img_json          VARCHAR2(200);   -- fragmento JSON del campo imagen (o vacio)
    v_enviado           BOOLEAN;
    v_inicio_tiempo     TIMESTAMP;
    v_tiempo_total      NUMBER;

    TYPE t_numeros_table IS TABLE OF numeros_whatsapp%ROWTYPE;
    v_numeros_tabla     t_numeros_table;

    FUNCTION ESCAPAR_JSON(p_texto IN VARCHAR2) RETURN VARCHAR2 IS
        l_texto VARCHAR2(4000);
    BEGIN
        l_texto := p_texto;
        l_texto := REPLACE(l_texto, '\',     '\\');
        l_texto := REPLACE(l_texto, '"',     '\"');
        l_texto := REPLACE(l_texto, CHR(10), '\n');
        l_texto := REPLACE(l_texto, CHR(13), '\r');
        l_texto := REPLACE(l_texto, CHR(9),  '\t');
        RETURN l_texto;
    END ESCAPAR_JSON;

    PROCEDURE REGISTRAR_LOG(
        p_numero_original VARCHAR2, p_numero_limpio VARCHAR2, p_estado VARCHAR2,
        p_http_status NUMBER, p_respuesta VARCHAR2, p_error VARCHAR2
    ) IS
    BEGIN
        BEGIN
            INSERT INTO LOG_WHATSAPP (
                NUMERO_ORIGINAL, NUMERO_LIMPIO, MENSAJE, ESTADO,
                HTTP_STATUS, RESPUESTA_API, DETALLE_ERROR
            ) VALUES (
                p_numero_original, p_numero_limpio, SUBSTR(p_mensaje, 1, 500), p_estado,
                p_http_status, SUBSTR(p_respuesta, 1, 500), SUBSTR(p_error, 1, 1000)
            );
            COMMIT;
        EXCEPTION WHEN OTHERS THEN
            apex_debug.message('Error al registrar log: ' || SQLERRM);
        END;
    END REGISTRAR_LOG;

    PROCEDURE ENVIAR_CON_REINTENTOS(
        p_id NUMBER, p_numero_original VARCHAR2, p_numero_limpio VARCHAR2,
        p_enviado OUT BOOLEAN
    ) IS
        v_intento_local  NUMBER := 0;
        v_enviado_local  BOOLEAN := FALSE;
        v_response_local CLOB;
        v_status_local   NUMBER;
        v_api_ok         BOOLEAN;  -- success del JSON que devuelve wasenderapi
        v_json_api       APEX_JSON.T_VALUES;
    BEGIN
        p_enviado := FALSE;
        WHILE v_intento_local < v_max_reintentos AND NOT v_enviado_local LOOP
            v_intento_local := v_intento_local + 1;
            BEGIN
                -- JSON: si hay imagen agrega el campo imageUrl; el texto va como caption/text.
                v_request_body :=
                    '{"to":"' || p_numero_limpio || '",' ||
                    v_img_json ||
                    '"text":"' || v_mensaje_esc || '"}';

                v_response_local := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
                    p_url         => v_api_url,
                    p_http_method => 'POST',
                    p_body        => v_request_body);

                v_status_local := APEX_WEB_SERVICE.G_STATUS_CODE;

                IF v_status_local IN (200, 201, 202) THEN
                    -- wasenderapi puede responder 200 con {"success":false,...}. Parseamos
                    -- el JSON para no marcar como ENVIADO un mensaje que la API rechazo.
                    BEGIN
                        APEX_JSON.PARSE(v_json_api, v_response_local);
                        v_api_ok := UPPER(NVL(APEX_JSON.GET_VARCHAR2(
                                        p_path => 'success', p_values => v_json_api), 'TRUE')) = 'TRUE';
                    EXCEPTION WHEN OTHERS THEN
                        v_api_ok := TRUE;  -- si no es JSON parseable, nos guiamos por el HTTP 2xx
                    END;

                    IF v_api_ok THEN
                        IF p_id IS NOT NULL THEN
                            UPDATE numeros_whatsapp SET mensajeado = 'S' WHERE id = p_id;
                        END IF;
                        REGISTRAR_LOG(p_numero_original, p_numero_limpio, 'ENVIADO', v_status_local, v_response_local, NULL);
                        v_contador_enviados := v_contador_enviados + 1;
                    ELSE
                        IF p_id IS NOT NULL THEN
                            UPDATE numeros_whatsapp SET mensajeado = 'E' WHERE id = p_id;
                        END IF;
                        REGISTRAR_LOG(p_numero_original, p_numero_limpio, 'ERROR', v_status_local, v_response_local,
                                      'API respondio success=false');
                        v_contador_errores := v_contador_errores + 1;
                    END IF;
                    v_enviado_local := TRUE; p_enviado := TRUE;

                ELSIF v_status_local IN (429, 500, 502, 503, 504) THEN
                    IF v_intento_local < v_max_reintentos THEN
                        IF v_status_local = 429 THEN DBMS_SESSION.SLEEP(5); ELSE DBMS_SESSION.SLEEP(2); END IF;
                    ELSE
                        IF p_id IS NOT NULL THEN
                            UPDATE numeros_whatsapp SET mensajeado = 'E' WHERE id = p_id;
                        END IF;
                        REGISTRAR_LOG(p_numero_original, p_numero_limpio, 'ERROR', v_status_local, v_response_local,
                                      'Error temporal despues de ' || v_max_reintentos || ' intentos');
                        v_contador_errores := v_contador_errores + 1;
                        v_enviado_local := TRUE; p_enviado := TRUE;
                    END IF;

                ELSE
                    IF p_id IS NOT NULL THEN
                        UPDATE numeros_whatsapp SET mensajeado = 'E' WHERE id = p_id;
                    END IF;
                    REGISTRAR_LOG(p_numero_original, p_numero_limpio, 'ERROR', v_status_local, v_response_local,
                                  'Error HTTP ' || v_status_local);
                    v_contador_errores := v_contador_errores + 1;
                    v_enviado_local := TRUE; p_enviado := TRUE;
                END IF;

            EXCEPTION WHEN OTHERS THEN
                IF v_intento_local < v_max_reintentos THEN
                    DBMS_SESSION.SLEEP(2);
                ELSE
                    IF p_id IS NOT NULL THEN
                        UPDATE numeros_whatsapp SET mensajeado = 'E' WHERE id = p_id;
                    END IF;
                    REGISTRAR_LOG(p_numero_original, p_numero_limpio, 'EXCEPCION', NULL, NULL, SQLERRM);
                    v_contador_errores := v_contador_errores + 1;
                    v_enviado_local := TRUE; p_enviado := TRUE;
                END IF;
            END;
        END LOOP;
    END ENVIAR_CON_REINTENTOS;

BEGIN
    v_inicio_tiempo := SYSTIMESTAMP;

    IF p_mensaje IS NULL AND p_imagen_url IS NULL THEN
        p_error := 'El mensaje no puede estar vacio';
        RETURN;
    END IF;

    v_mensaje_esc := ESCAPAR_JSON(NVL(p_mensaje, ''));

    -- Fragmento JSON de imagen (vacio si no hay). Ver nota de cabecera.
    IF p_imagen_url IS NOT NULL THEN
        v_img_json := '"imageUrl":"' || ESCAPAR_JSON(p_imagen_url) || '",';
    ELSE
        v_img_json := '';
    END IF;

    -- Origen de los numeros: MANUAL (lista recibida) o BASE (tabla numeros_whatsapp).
    IF p_numeros_manual IS NOT NULL AND DBMS_LOB.GETLENGTH(p_numeros_manual) > 0 THEN
        BEGIN
            APEX_JSON.PARSE(p_numeros_manual);
            v_contador_total := APEX_JSON.GET_COUNT('.');
        EXCEPTION WHEN OTHERS THEN
            p_error := 'Numeros manuales invalidos: ' || SQLERRM;
            RETURN;
        END;
        IF v_contador_total = 0 THEN
            p_error := 'No hay numeros para procesar';
            RETURN;
        END IF;
    ELSE
        BEGIN
            SELECT * BULK COLLECT INTO v_numeros_tabla
            FROM numeros_whatsapp
            WHERE NVL(mensajeado, 'N') NOT IN ('S')
            FETCH FIRST v_max_registros ROWS ONLY;

            v_contador_total := v_numeros_tabla.COUNT;
            IF v_contador_total = 0 THEN
                p_error := 'No hay numeros para procesar';
                RETURN;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            p_error := 'Error al cargar numeros: ' || SQLERRM;
            RETURN;
        END;
    END IF;

    BEGIN
        APEX_WEB_SERVICE.SET_REQUEST_HEADERS(
            p_name_01 => 'Authorization', p_value_01 => 'Bearer ' || v_api_key,
            p_name_02 => 'Content-Type',  p_value_02 => 'application/json',
            p_name_03 => 'User-Agent',    p_value_03 => 'APEX-WhatsApp/4.0');
    EXCEPTION WHEN OTHERS THEN
        apex_debug.message('ERROR en headers: ' || SQLERRM);
    END;

    FOR i IN 1..v_contador_total LOOP
        BEGIN
            -- MANUAL: numero de la lista (sin id, no toca la tabla).
            -- BASE:   numero de la coleccion cargada de numeros_whatsapp.
            IF p_numeros_manual IS NOT NULL AND DBMS_LOB.GETLENGTH(p_numeros_manual) > 0 THEN
                v_numero_original := TRIM(APEX_JSON.GET_VARCHAR2('[%d]', i));
            ELSE
                v_numero_original := v_numeros_tabla(i).numero;
            END IF;

            v_numero_limpio := LIMPIAR_NUMERO(v_numero_original);

            IF v_numero_limpio IS NULL THEN
                IF p_numeros_manual IS NULL THEN
                    UPDATE numeros_whatsapp SET mensajeado = 'E' WHERE id = v_numeros_tabla(i).id;
                END IF;
                REGISTRAR_LOG(v_numero_original, NULL, 'INVALIDO', NULL, NULL,
                              'Numero invalido o sin suficientes digitos');
                v_contador_invalidos := v_contador_invalidos + 1;
            ELSE
                -- p_id NULL en manual: no se actualiza numeros_whatsapp.
                IF p_numeros_manual IS NOT NULL AND DBMS_LOB.GETLENGTH(p_numeros_manual) > 0 THEN
                    ENVIAR_CON_REINTENTOS(NULL, v_numero_original, v_numero_limpio, v_enviado);
                ELSE
                    ENVIAR_CON_REINTENTOS(v_numeros_tabla(i).id, v_numero_original, v_numero_limpio, v_enviado);
                END IF;
            END IF;

            DBMS_SESSION.SLEEP(v_pausa_entre_msgs);
        EXCEPTION WHEN OTHERS THEN
            v_contador_errores := v_contador_errores + 1;
        END;
    END LOOP;

    v_tiempo_total := EXTRACT(SECOND FROM (SYSTIMESTAMP - v_inicio_tiempo));

    p_error := 'Total: ' || v_contador_total ||
               ' | Enviados: ' || v_contador_enviados ||
               ' | Errores: ' || v_contador_errores ||
               ' | Invalidos: ' || v_contador_invalidos ||
               ' | Tiempo: ' || ROUND(v_tiempo_total / 60, 2) || ' min';
    COMMIT;

    -- Aviso de finalizacion al numero fijo (usa el resumen como texto, sin imagen).
    BEGIN
        v_img_json    := '';
        v_mensaje_esc := ESCAPAR_JSON(
            'Proceso de envio de mensajes de WhatsApp finalizado. ' || p_error);
        v_numero_limpio := LIMPIAR_NUMERO(v_numero_aviso);
        IF v_numero_limpio IS NOT NULL THEN
            ENVIAR_CON_REINTENTOS(NULL, v_numero_aviso, v_numero_limpio, v_enviado);
            COMMIT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        apex_debug.message('Error al enviar aviso de finalizacion: ' || SQLERRM);
    END;

EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    p_error := 'Error general: ' || SQLERRM;
END ENVIAR_MENSAJES_WHATSAPP;
/
