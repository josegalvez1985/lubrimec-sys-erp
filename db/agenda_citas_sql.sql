--------------------------------------------------------------------------------
-- AGENDA DE CITAS (pagina 121) — paquete CRUD + endpoints ORDS en un archivo.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC y la
-- tabla AGENDA_CITAS (DDL al pie, comentado, por si hay que recrearla).
--
-- PK id_agenda por IDENTITY. Multiempresa (cod_empresa). El cliente es una
-- PERSONAS de la misma empresa; la LOV del front reusa GET pos/clientes
-- (clientes C/A, lista completa), asi que aca no hay endpoint de busqueda.
--
-- Fechas: entran y salen como texto 'YYYY-MM-DD'. Hora: 'HH:MM' de 24 h u
-- opcional (la valida tambien el CHECK AGENDA_CITAS_HORA_CK).
--
-- === 1) PAQUETE PKG_AGENDA_CITAS_LUBRIMEC ===================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_AGENDA_CITAS_LUBRIMEC AS

  -- Lista las citas de una empresa. p_desde / p_hasta ('YYYY-MM-DD') son
  -- opcionales: sin ellos devuelve todas. Trae los datos del cliente del JOIN.
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_desde       IN VARCHAR2,
      p_hasta       IN VARCHAR2);

  -- Devuelve una cita por su id (dentro de su empresa).
  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_id_agenda   IN NUMBER,
      p_cod_empresa IN NUMBER);

  -- Inserta una cita (el id lo asigna la IDENTITY).
  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_cod_persona IN NUMBER,
      p_fecha       IN VARCHAR2,
      p_hora        IN VARCHAR2,
      p_vehiculo    IN VARCHAR2,
      p_trabajos    IN VARCHAR2,
      p_repuestos   IN VARCHAR2);

  -- Actualiza una cita existente (no cambia de empresa).
  PROCEDURE ACTUALIZAR(
      p_token       IN VARCHAR2,
      p_id_agenda   IN NUMBER,
      p_cod_empresa IN NUMBER,
      p_cod_persona IN NUMBER,
      p_fecha       IN VARCHAR2,
      p_hora        IN VARCHAR2,
      p_vehiculo    IN VARCHAR2,
      p_trabajos    IN VARCHAR2,
      p_repuestos   IN VARCHAR2);

  -- Borra una cita por su id (dentro de su empresa).
  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_id_agenda   IN NUMBER,
      p_cod_empresa IN NUMBER);

END PKG_AGENDA_CITAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_AGENDA_CITAS_LUBRIMEC AS

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

  -- Valida el token; devuelve el usuario o NULL si es invalido.
  FUNCTION f_usuario(p_token IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(p_token);
  END f_usuario;

  -- Texto vacio o solo espacios -> NULL (en Oracle '' ya es NULL).
  FUNCTION f_texto(p_valor IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN TRIM(p_valor);
  END f_texto;

  -- Error de INSERT/UPDATE: un texto que no entra en la columna (ORA-12899;
  -- las columnas cuentan bytes y una letra con tilde ocupa dos) sale como 400
  -- con un mensaje entendible; el resto, como 500.
  PROCEDURE p_error_guardar(p_code IN NUMBER, p_msg IN VARCHAR2) IS
  BEGIN
    IF p_code = -12899 THEN
      p_error(400, 'Bad Request',
              'Uno de los textos es demasiado largo: acortalo y volve a guardar');
    ELSE
      p_error(500, 'Internal Server Error', 'Error: ' || p_msg);
    END IF;
  END p_error_guardar;

  -- 'YYYY-MM-DD' -> DATE; NULL si no tiene ese formato o no es una fecha real.
  FUNCTION f_fecha(p_valor IN VARCHAR2) RETURN DATE IS
  BEGIN
    IF p_valor IS NULL OR NOT REGEXP_LIKE(TRIM(p_valor), '^\d{4}-\d{2}-\d{2}$') THEN
      RETURN NULL;
    END IF;
    RETURN TO_DATE(TRIM(p_valor), 'YYYY-MM-DD');
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END f_fecha;

  -- Validaciones comunes de INSERTAR y ACTUALIZAR. Devuelve el mensaje de error
  -- o NULL si todo esta bien; deja la fecha convertida en p_fecha_out.
  FUNCTION f_validar(
      p_cod_empresa IN NUMBER,
      p_cod_persona IN NUMBER,
      p_fecha       IN VARCHAR2,
      p_hora        IN VARCHAR2,
      p_fecha_out   OUT DATE) RETURN VARCHAR2 IS
    l_existe PLS_INTEGER;
  BEGIN
    IF p_cod_empresa IS NULL THEN
      RETURN 'cod_empresa es obligatorio';
    END IF;
    IF p_cod_persona IS NULL THEN
      RETURN 'Elegi el cliente de la cita';
    END IF;

    p_fecha_out := f_fecha(p_fecha);
    IF p_fecha_out IS NULL THEN
      RETURN 'La fecha es obligatoria y debe ser valida';
    END IF;

    IF f_texto(p_hora) IS NOT NULL
       AND NOT REGEXP_LIKE(TRIM(p_hora), '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
      RETURN 'La hora debe tener el formato HH:MM (por ejemplo 08:30)';
    END IF;

    SELECT COUNT(*)
      INTO l_existe
      FROM personas
     WHERE cod_persona = p_cod_persona
       AND cod_empresa = p_cod_empresa;
    IF l_existe = 0 THEN
      RETURN 'El cliente no existe en esta empresa';
    END IF;

    RETURN NULL;
  END f_validar;

  -- Escribe los campos de una cita (fila del cursor de LISTAR u OBTENER).
  PROCEDURE w_cita(
      p_id_agenda    IN NUMBER,
      p_cod_empresa  IN NUMBER,
      p_cod_persona  IN NUMBER,
      p_cliente      IN VARCHAR2,
      p_nro_ruc      IN VARCHAR2,
      p_nro_ci       IN VARCHAR2,
      p_nro_telefono IN VARCHAR2,
      p_fecha        IN DATE,
      p_hora         IN VARCHAR2,
      p_vehiculo     IN VARCHAR2,
      p_trabajos     IN VARCHAR2,
      p_repuestos    IN VARCHAR2) IS
  BEGIN
    APEX_JSON.WRITE('id_agenda', p_id_agenda);
    APEX_JSON.WRITE('cod_empresa', p_cod_empresa);
    APEX_JSON.WRITE('cod_persona', p_cod_persona);
    APEX_JSON.WRITE('cliente', p_cliente);
    APEX_JSON.WRITE('nro_ruc', p_nro_ruc);
    APEX_JSON.WRITE('nro_ci', p_nro_ci);
    APEX_JSON.WRITE('nro_telefono', p_nro_telefono);
    APEX_JSON.WRITE('fecha', TO_CHAR(p_fecha, 'YYYY-MM-DD'));
    APEX_JSON.WRITE('hora', p_hora);
    APEX_JSON.WRITE('vehiculo', p_vehiculo);
    APEX_JSON.WRITE('trabajos', p_trabajos);
    APEX_JSON.WRITE('repuestos', p_repuestos);
  END w_cita;

  --------------------------------------------------------------------------
  -- LISTAR
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_desde       IN VARCHAR2,
      p_hasta       IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_desde   DATE := f_fecha(p_desde);
    l_hasta   DATE := f_fecha(p_hasta);
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
        SELECT a.id_agenda, a.cod_empresa, a.cod_persona,
               p.nombre AS cliente, p.nro_ruc, p.nro_ci, p.nro_telefono,
               a.fecha, a.hora, a.vehiculo, a.trabajos, a.repuestos
          FROM agenda_citas a
          LEFT JOIN personas p
            ON p.cod_persona = a.cod_persona
         WHERE a.cod_empresa = p_cod_empresa
           AND (l_desde IS NULL OR a.fecha >= l_desde)
           AND (l_hasta IS NULL OR a.fecha <  l_hasta + 1)
         ORDER BY a.fecha, a.hora NULLS LAST, p.nombre
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      w_cita(r.id_agenda, r.cod_empresa, r.cod_persona, r.cliente, r.nro_ruc,
             r.nro_ci, r.nro_telefono, r.fecha, r.hora, r.vehiculo,
             r.trabajos, r.repuestos);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- OBTENER
  --------------------------------------------------------------------------
  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_id_agenda   IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    FOR r IN (
        SELECT a.id_agenda, a.cod_empresa, a.cod_persona,
               p.nombre AS cliente, p.nro_ruc, p.nro_ci, p.nro_telefono,
               a.fecha, a.hora, a.vehiculo, a.trabajos, a.repuestos
          FROM agenda_citas a
          LEFT JOIN personas p
            ON p.cod_persona = a.cod_persona
         WHERE a.id_agenda = p_id_agenda
           AND a.cod_empresa = p_cod_empresa
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('success', TRUE);
      APEX_JSON.OPEN_OBJECT('data');
      w_cita(r.id_agenda, r.cod_empresa, r.cod_persona, r.cliente, r.nro_ruc,
             r.nro_ci, r.nro_telefono, r.fecha, r.hora, r.vehiculo,
             r.trabajos, r.repuestos);
      APEX_JSON.CLOSE_OBJECT;
      APEX_JSON.CLOSE_OBJECT;
      RETURN;
    END LOOP;

    p_error(404, 'Not Found', 'Cita no encontrada');
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_cod_persona IN NUMBER,
      p_fecha       IN VARCHAR2,
      p_hora        IN VARCHAR2,
      p_vehiculo    IN VARCHAR2,
      p_trabajos    IN VARCHAR2,
      p_repuestos   IN VARCHAR2) IS
    l_usuario   VARCHAR2(255);
    l_fecha     DATE;
    l_mensaje   VARCHAR2(400);
    l_id_agenda agenda_citas.id_agenda%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    l_mensaje := f_validar(p_cod_empresa, p_cod_persona, p_fecha, p_hora, l_fecha);
    IF l_mensaje IS NOT NULL THEN
      p_error(400, 'Bad Request', l_mensaje);
      RETURN;
    END IF;

    INSERT INTO agenda_citas (cod_empresa, cod_persona, fecha, hora,
                              vehiculo, trabajos, repuestos)
    VALUES (p_cod_empresa, p_cod_persona, l_fecha, TRIM(p_hora),
            TRIM(p_vehiculo), TRIM(p_trabajos), TRIM(p_repuestos))
    RETURNING id_agenda INTO l_id_agenda;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Cita agendada');
    APEX_JSON.WRITE('id_agenda', l_id_agenda);
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
      p_token       IN VARCHAR2,
      p_id_agenda   IN NUMBER,
      p_cod_empresa IN NUMBER,
      p_cod_persona IN NUMBER,
      p_fecha       IN VARCHAR2,
      p_hora        IN VARCHAR2,
      p_vehiculo    IN VARCHAR2,
      p_trabajos    IN VARCHAR2,
      p_repuestos   IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_fecha   DATE;
    l_mensaje VARCHAR2(400);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    l_mensaje := f_validar(p_cod_empresa, p_cod_persona, p_fecha, p_hora, l_fecha);
    IF l_mensaje IS NOT NULL THEN
      p_error(400, 'Bad Request', l_mensaje);
      RETURN;
    END IF;

    -- El filtro por empresa impide mover la cita a otra empresa.
    UPDATE agenda_citas
       SET cod_persona = p_cod_persona,
           fecha       = l_fecha,
           hora        = TRIM(p_hora),
           vehiculo    = TRIM(p_vehiculo),
           trabajos    = TRIM(p_trabajos),
           repuestos   = TRIM(p_repuestos)
     WHERE id_agenda = p_id_agenda
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Cita no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Cita actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      -- SQLCODE/SQLERRM se leen aca, dentro del manejador y antes del ROLLBACK.
      p_error_guardar(SQLCODE, SQLERRM);
      ROLLBACK;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_id_agenda   IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM agenda_citas
     WHERE id_agenda = p_id_agenda
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Cita no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Cita eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_AGENDA_CITAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/agenda-citas?cod_empresa=:n[&desde=YYYY-MM-DD&hasta=YYYY-MM-DD]
--   GET    /lubrimec/agenda-citas/:id?cod_empresa=:n   -> obtener
--   POST   /lubrimec/agenda-citas                      -> insertar (body JSON)
--   PUT    /lubrimec/agenda-citas/:id                  -> actualizar (body JSON)
--   DELETE /lubrimec/agenda-citas/:id?cod_empresa=:n   -> eliminar
--
-- Body JSON de POST/PUT: { cod_empresa, cod_persona, fecha, hora, vehiculo,
-- trabajos, repuestos }. El GET de la coleccion lee el query string crudo
-- (get_qs) porque desde/hasta son opcionales.
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente: borra handlers previos si el script se re-ejecuta.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'agenda-citas', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'agenda-citas', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'agenda-citas/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'agenda-citas/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'agenda-citas/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /agenda-citas
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'agenda-citas',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /agenda-citas?cod_empresa=:n[&desde=&hasta=]  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'agenda-citas',
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
    PKG_AGENDA_CITAS_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(get_qs(l_qs, 'cod_empresa')),
        p_desde       => get_qs(l_qs, 'desde'),
        p_hasta       => get_qs(l_qs, 'hasta'));
END;
~');

  -- Mapea el header HTTP Authorization al bind :authorization.
  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'agenda-citas',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- POST /agenda-citas  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'agenda-citas',
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

    PKG_AGENDA_CITAS_LUBRIMEC.INSERTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_cod_persona => TO_NUMBER(:cod_persona),
        p_fecha       => :fecha,
        p_hora        => :hora,
        p_vehiculo    => :vehiculo,
        p_trabajos    => :trabajos,
        p_repuestos   => :repuestos);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'agenda-citas',
      p_method             => 'POST',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /agenda-citas/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'agenda-citas/:id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /agenda-citas/:id  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'agenda-citas/:id',
      p_method      => 'GET',
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

    PKG_AGENDA_CITAS_LUBRIMEC.OBTENER(
        p_token       => l_token,
        p_id_agenda   => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'agenda-citas/:id',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- PUT /agenda-citas/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'agenda-citas/:id',
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

    PKG_AGENDA_CITAS_LUBRIMEC.ACTUALIZAR(
        p_token       => l_token,
        p_id_agenda   => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_cod_persona => TO_NUMBER(:cod_persona),
        p_fecha       => :fecha,
        p_hora        => :hora,
        p_vehiculo    => :vehiculo,
        p_trabajos    => :trabajos,
        p_repuestos   => :repuestos);
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'agenda-citas/:id',
      p_method             => 'PUT',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- DELETE /agenda-citas/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'agenda-citas/:id',
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

    PKG_AGENDA_CITAS_LUBRIMEC.ELIMINAR(
        p_token       => l_token,
        p_id_agenda   => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'agenda-citas/:id',
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

--------------------------------------------------------------------------------
-- === ANEXO: DDL de la tabla (ya creada; referencia para recrearla) ==========
--
-- CREATE TABLE AGENDA_CITAS (
--   ID_AGENDA   NUMBER GENERATED BY DEFAULT AS IDENTITY NOT NULL,
--   COD_EMPRESA NUMBER NOT NULL,
--   COD_PERSONA NUMBER NOT NULL,
--   FECHA       DATE NOT NULL,
--   HORA        VARCHAR2(5),
--   VEHICULO    VARCHAR2(200),
--   TRABAJOS    VARCHAR2(4000),
--   REPUESTOS   VARCHAR2(4000),
--   CONSTRAINT AGENDA_CITAS_HORA_CK CHECK (HORA IS NULL OR
--     REGEXP_LIKE(HORA, '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
--   CONSTRAINT AGENDA_CITAS_PK PRIMARY KEY (ID_AGENDA));
-- ALTER TABLE AGENDA_CITAS ADD CONSTRAINT AGENDA_CITAS_EMP_FK
--   FOREIGN KEY (COD_EMPRESA) REFERENCES EMPRESAS (COD_EMPRESA);
-- ALTER TABLE AGENDA_CITAS ADD CONSTRAINT AGENDA_CITAS_PERS_FK
--   FOREIGN KEY (COD_PERSONA) REFERENCES PERSONAS (COD_PERSONA);
-- CREATE INDEX AGENDA_CITAS_EMP_IX  ON AGENDA_CITAS (COD_EMPRESA);
-- CREATE INDEX AGENDA_CITAS_PERS_IX ON AGENDA_CITAS (COD_PERSONA);
-- CREATE INDEX AGENDA_CITAS_FEC_IX  ON AGENDA_CITAS (FECHA);
--------------------------------------------------------------------------------
