--------------------------------------------------------------------------------
-- MONEDAS (pagina APEX 18) — maestro-detalle. Paquete CRUD + ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- Cabecera MONEDAS (PK cod_moneda por seq_monedas).
-- Detalle  MONEDAS_DETALLE (PK compuesta valor + cod_moneda; el valor lo ingresa el
--   usuario). archivo_imagen es BLOB: se intercambia como base64 en el JSON
--   (front manda data URL / base64; el GET devuelve base64 puro en 'imagen_base64').
--
-- === 1) PAQUETE PKG_MONEDAS_LUBRIMEC =======================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_MONEDAS_LUBRIMEC AS

  -- Cabecera
  PROCEDURE LISTAR(p_token IN VARCHAR2);
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_descripcion IN VARCHAR2,
      p_siglas IN VARCHAR2, p_decimales IN NUMBER);
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_cod_moneda IN NUMBER, p_descripcion IN VARCHAR2,
      p_siglas IN VARCHAR2, p_decimales IN NUMBER);
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod_moneda IN NUMBER);

  -- Detalle (denominaciones)
  PROCEDURE LISTAR_DETALLE(p_token IN VARCHAR2, p_cod_moneda IN NUMBER);
  PROCEDURE GUARDAR_DETALLE(          -- upsert por (valor, cod_moneda)
      p_token IN VARCHAR2, p_cod_moneda IN NUMBER, p_valor IN NUMBER,
      p_imagen_base64 IN CLOB, p_nombre_imagen IN VARCHAR2, p_mime_type IN VARCHAR2);
  PROCEDURE ELIMINAR_DETALLE(
      p_token IN VARCHAR2, p_cod_moneda IN NUMBER, p_valor IN NUMBER);

END PKG_MONEDAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_MONEDAS_LUBRIMEC AS

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
  -- CABECERA: LISTAR
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(p_token IN VARCHAR2) IS
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
        SELECT m.cod_moneda, m.descripcion, m.siglas, m.decimales,
               (SELECT COUNT(*) FROM monedas_detalle d WHERE d.cod_moneda = m.cod_moneda) cant_detalle
          FROM monedas m
         ORDER BY m.descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('cod_moneda', r.cod_moneda);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('siglas', r.siglas);
      APEX_JSON.WRITE('decimales', r.decimales);
      APEX_JSON.WRITE('cant_detalle', r.cant_detalle);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- CABECERA: INSERTAR
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_descripcion IN VARCHAR2,
      p_siglas IN VARCHAR2, p_decimales IN NUMBER) IS
    l_usuario    VARCHAR2(255);
    l_cod_moneda monedas.cod_moneda%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_descripcion IS NULL THEN
      p_error(400, 'Bad Request', 'La descripcion es obligatoria');
      RETURN;
    END IF;

    INSERT INTO monedas (descripcion, siglas, decimales)
    VALUES (p_descripcion, p_siglas, p_decimales)
    RETURNING cod_moneda INTO l_cod_moneda;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Moneda creada');
    APEX_JSON.WRITE('cod_moneda', l_cod_moneda);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- CABECERA: ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_cod_moneda IN NUMBER, p_descripcion IN VARCHAR2,
      p_siglas IN VARCHAR2, p_decimales IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_descripcion IS NULL THEN
      p_error(400, 'Bad Request', 'La descripcion es obligatoria');
      RETURN;
    END IF;

    UPDATE monedas
       SET descripcion = p_descripcion,
           siglas      = p_siglas,
           decimales   = p_decimales
     WHERE cod_moneda = p_cod_moneda;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Moneda no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Moneda actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- CABECERA: ELIMINAR (borra detalle primero)
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod_moneda IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM monedas_detalle WHERE cod_moneda = p_cod_moneda;
    DELETE FROM monedas         WHERE cod_moneda = p_cod_moneda;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Moneda no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Moneda eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: la moneda tiene registros asociados');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- DETALLE: LISTAR (imagen BLOB -> base64 para el front)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR_DETALLE(p_token IN VARCHAR2, p_cod_moneda IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_b64     CLOB;
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
        SELECT valor, cod_moneda, archivo_imagen, nombre_imagen, mime_type,
               TO_CHAR(last_update, 'YYYY-MM-DD') last_update
          FROM monedas_detalle
         WHERE cod_moneda = p_cod_moneda
         ORDER BY valor
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('valor', r.valor);
      APEX_JSON.WRITE('cod_moneda', r.cod_moneda);
      APEX_JSON.WRITE('nombre_imagen', r.nombre_imagen);
      APEX_JSON.WRITE('mime_type', r.mime_type);
      APEX_JSON.WRITE('last_update', r.last_update);
      -- Imagen como base64 (o null). Se arma data URL en el front con el mime_type.
      IF r.archivo_imagen IS NOT NULL AND DBMS_LOB.GETLENGTH(r.archivo_imagen) > 0 THEN
        l_b64 := APEX_WEB_SERVICE.BLOB2CLOBBASE64(r.archivo_imagen);
        -- Quita saltos de linea que mete el encoder.
        l_b64 := REPLACE(REPLACE(l_b64, CHR(13), ''), CHR(10), '');
      ELSE
        l_b64 := NULL;
      END IF;
      -- Variable CLOB tipada: evita la ambiguedad de overload de WRITE(nombre, NULL).
      APEX_JSON.WRITE('imagen_base64', l_b64);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR_DETALLE;

  --------------------------------------------------------------------------
  -- DETALLE: GUARDAR (upsert). p_imagen_base64 NULL = no toca la imagen.
  --------------------------------------------------------------------------
  PROCEDURE GUARDAR_DETALLE(
      p_token IN VARCHAR2, p_cod_moneda IN NUMBER, p_valor IN NUMBER,
      p_imagen_base64 IN CLOB, p_nombre_imagen IN VARCHAR2, p_mime_type IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_blob    BLOB;
    l_existe  NUMBER;
    l_b64     CLOB;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_valor IS NULL THEN
      p_error(400, 'Bad Request', 'El valor es obligatorio');
      RETURN;
    END IF;

    -- Decodifica base64 -> BLOB (quita prefijo data:...;base64, si viene).
    IF p_imagen_base64 IS NOT NULL AND DBMS_LOB.GETLENGTH(p_imagen_base64) > 0 THEN
      l_b64 := p_imagen_base64;
      IF INSTR(l_b64, 'base64,') > 0 THEN
        l_b64 := SUBSTR(l_b64, INSTR(l_b64, 'base64,') + 7);
      END IF;
      l_blob := APEX_WEB_SERVICE.CLOBBASE642BLOB(l_b64);
    END IF;

    SELECT COUNT(*) INTO l_existe
      FROM monedas_detalle
     WHERE cod_moneda = p_cod_moneda AND valor = p_valor;

    IF l_existe = 0 THEN
      INSERT INTO monedas_detalle (
          valor, cod_moneda, archivo_imagen, nombre_imagen, mime_type, last_update)
      VALUES (
          p_valor, p_cod_moneda, l_blob, p_nombre_imagen, p_mime_type, SYSDATE);
    ELSIF l_blob IS NOT NULL THEN
      -- Reemplaza la imagen solo si se envio una nueva.
      UPDATE monedas_detalle
         SET archivo_imagen = l_blob,
             nombre_imagen  = p_nombre_imagen,
             mime_type      = p_mime_type,
             last_update    = SYSDATE
       WHERE cod_moneda = p_cod_moneda AND valor = p_valor;
    END IF;
    COMMIT;

    OWA_UTIL.STATUS_LINE(200, 'OK', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Denominacion guardada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END GUARDAR_DETALLE;

  --------------------------------------------------------------------------
  -- DETALLE: ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR_DETALLE(
      p_token IN VARCHAR2, p_cod_moneda IN NUMBER, p_valor IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM monedas_detalle
     WHERE cod_moneda = p_cod_moneda AND valor = p_valor;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Denominacion no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Denominacion eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR_DETALLE;

END PKG_MONEDAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/monedas                       -> listar cabecera
--   POST   /lubrimec/monedas                       -> insertar cabecera
--   PUT    /lubrimec/monedas/:id                   -> actualizar cabecera
--   DELETE /lubrimec/monedas/:id                   -> eliminar cabecera (+ detalle)
--   GET    /lubrimec/monedas/:id/detalle           -> listar detalle
--   POST   /lubrimec/monedas/:id/detalle           -> upsert detalle (valor en body)
--   DELETE /lubrimec/monedas/:id/detalle/:valor    -> eliminar detalle
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas', 'GET');                    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas', 'POST');                   EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas/:id', 'PUT');                EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas/:id', 'DELETE');             EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas/:id/detalle', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas/:id/detalle', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'monedas/:id/detalle/:valor', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- /monedas  (coleccion cabecera)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'monedas',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.LISTAR(p_token => l_token);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.INSERTAR(
        p_token => l_token, p_descripcion => :descripcion,
        p_siglas => :siglas, p_decimales => TO_NUMBER(:decimales));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /monedas/:id  (item cabecera)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'monedas/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas/:id', p_method => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.ACTUALIZAR(
        p_token => l_token, p_cod_moneda => TO_NUMBER(:id), p_descripcion => :descripcion,
        p_siglas => :siglas, p_decimales => TO_NUMBER(:decimales));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas/:id', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.ELIMINAR(p_token => l_token, p_cod_moneda => TO_NUMBER(:id));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /monedas/:id/detalle  (coleccion detalle)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.LISTAR_DETALLE(p_token => l_token, p_cod_moneda => TO_NUMBER(:id));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.GUARDAR_DETALLE(
        p_token => l_token, p_cod_moneda => TO_NUMBER(:id), p_valor => TO_NUMBER(:valor),
        p_imagen_base64 => :imagen_base64, p_nombre_imagen => :nombre_imagen,
        p_mime_type => :mime_type);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /monedas/:id/detalle/:valor  (item detalle)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle/:valor',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle/:valor', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
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
    PKG_MONEDAS_LUBRIMEC.ELIMINAR_DETALLE(
        p_token => l_token, p_cod_moneda => TO_NUMBER(:id), p_valor => TO_NUMBER(:valor));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'monedas/:id/detalle/:valor', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
