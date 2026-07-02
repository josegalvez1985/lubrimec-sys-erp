--------------------------------------------------------------------------------
-- Paquete PKG_PERSONAS_LUBRIMEC
-- CRUD de la tabla PERSONAS para el modulo ORDS lubrimec (pagina APEX 2).
-- Cada operacion valida el token Bearer con PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN
-- y devuelve JSON con APEX_JSON usando el contrato { success, message, data }.
--
-- FEC_NACIMIENTO se intercambia como texto 'YYYY-MM-DD' (formato input date HTML).
-- La PK COD_PERSONA la asigna el trigger TRG_PERSONAS (seq_personas).
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_PERSONAS_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER);

  PROCEDURE INSERTAR(
      p_token           IN VARCHAR2,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER);

  PROCEDURE ACTUALIZAR(
      p_token           IN VARCHAR2,
      p_cod_persona     IN NUMBER,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER);

  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER);

END PKG_PERSONAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_PERSONAS_LUBRIMEC AS

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

  -- Texto 'YYYY-MM-DD' -> DATE (NULL si vacio o no parseable).
  FUNCTION f_fecha(p_txt IN VARCHAR2) RETURN DATE IS
  BEGIN
    IF p_txt IS NULL OR TRIM(p_txt) IS NULL THEN RETURN NULL; END IF;
    RETURN TO_DATE(p_txt, 'YYYY-MM-DD');
  EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
  END f_fecha;

  -- Escribe una fila de personas como objeto JSON (reusado en LISTAR/OBTENER).
  PROCEDURE w_persona(
      p_cod_persona     NUMBER,   p_tipo_persona VARCHAR2, p_nombre VARCHAR2,
      p_nombre_fantasia VARCHAR2, p_sexo VARCHAR2,         p_fec_nacimiento DATE,
      p_nro_telefono    VARCHAR2, p_direccion VARCHAR2,    p_nro_ci VARCHAR2,
      p_nro_ruc         VARCHAR2, p_ind_cli_prov VARCHAR2, p_cod_empresa NUMBER) IS
  BEGIN
    APEX_JSON.WRITE('cod_persona', p_cod_persona);
    APEX_JSON.WRITE('tipo_persona', p_tipo_persona);
    APEX_JSON.WRITE('nombre', p_nombre);
    APEX_JSON.WRITE('nombre_fantasia', p_nombre_fantasia);
    APEX_JSON.WRITE('sexo', p_sexo);
    APEX_JSON.WRITE('fec_nacimiento',
        CASE WHEN p_fec_nacimiento IS NULL THEN NULL
             ELSE TO_CHAR(p_fec_nacimiento, 'YYYY-MM-DD') END);
    APEX_JSON.WRITE('nro_telefono', p_nro_telefono);
    APEX_JSON.WRITE('direccion', p_direccion);
    APEX_JSON.WRITE('nro_ci', p_nro_ci);
    APEX_JSON.WRITE('nro_ruc', p_nro_ruc);
    APEX_JSON.WRITE('ind_cliente_proveedor', p_ind_cli_prov);
    APEX_JSON.WRITE('cod_empresa', p_cod_empresa);
  END w_persona;

  --------------------------------------------------------------------------
  -- LISTAR
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER) IS
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
        SELECT cod_persona, tipo_persona, nombre, nombre_fantasia, sexo,
               fec_nacimiento, nro_telefono, direccion, nro_ci, nro_ruc,
               ind_cliente_proveedor, cod_empresa
          FROM personas
         WHERE cod_empresa = p_cod_empresa
         ORDER BY nombre
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      w_persona(r.cod_persona, r.tipo_persona, r.nombre, r.nombre_fantasia, r.sexo,
                r.fec_nacimiento, r.nro_telefono, r.direccion, r.nro_ci, r.nro_ruc,
                r.ind_cliente_proveedor, r.cod_empresa);
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
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    r         personas%ROWTYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT * INTO r
        FROM personas
       WHERE cod_persona = p_cod_persona
         AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Persona no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    w_persona(r.cod_persona, r.tipo_persona, r.nombre, r.nombre_fantasia, r.sexo,
              r.fec_nacimiento, r.nro_telefono, r.direccion, r.nro_ci, r.nro_ruc,
              r.ind_cliente_proveedor, r.cod_empresa);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token           IN VARCHAR2,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER) IS
    l_usuario     VARCHAR2(255);
    l_cod_persona personas.cod_persona%TYPE;
    l_fecha       DATE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_nombre IS NULL THEN
      p_error(400, 'Bad Request', 'El nombre es obligatorio');
      RETURN;
    END IF;
    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    l_fecha := f_fecha(p_fec_nacimiento);

    INSERT INTO personas (
        tipo_persona, nombre, nombre_fantasia, sexo, fec_nacimiento,
        nro_telefono, direccion, nro_ci, nro_ruc, ind_cliente_proveedor, cod_empresa)
    VALUES (
        p_tipo_persona, p_nombre, p_nombre_fantasia, p_sexo, l_fecha,
        p_nro_telefono, p_direccion, p_nro_ci, p_nro_ruc, p_ind_cli_prov, p_cod_empresa)
    RETURNING cod_persona INTO l_cod_persona;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Persona creada');
    APEX_JSON.WRITE('cod_persona', l_cod_persona);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token           IN VARCHAR2,
      p_cod_persona     IN NUMBER,
      p_tipo_persona    IN VARCHAR2,
      p_nombre          IN VARCHAR2,
      p_nombre_fantasia IN VARCHAR2,
      p_sexo            IN VARCHAR2,
      p_fec_nacimiento  IN VARCHAR2,
      p_nro_telefono    IN VARCHAR2,
      p_direccion       IN VARCHAR2,
      p_nro_ci          IN VARCHAR2,
      p_nro_ruc         IN VARCHAR2,
      p_ind_cli_prov    IN VARCHAR2,
      p_cod_empresa     IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_fecha   DATE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_nombre IS NULL THEN
      p_error(400, 'Bad Request', 'El nombre es obligatorio');
      RETURN;
    END IF;

    l_fecha := f_fecha(p_fec_nacimiento);

    UPDATE personas
       SET tipo_persona          = p_tipo_persona,
           nombre                = p_nombre,
           nombre_fantasia       = p_nombre_fantasia,
           sexo                  = p_sexo,
           fec_nacimiento        = l_fecha,
           nro_telefono          = p_nro_telefono,
           direccion             = p_direccion,
           nro_ci                = p_nro_ci,
           nro_ruc               = p_nro_ruc,
           ind_cliente_proveedor = p_ind_cli_prov
     WHERE cod_persona = p_cod_persona
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Persona no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Persona actualizada');
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
      p_cod_persona IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM personas
     WHERE cod_persona = p_cod_persona
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Persona no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Persona eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_PERSONAS_LUBRIMEC;
/
