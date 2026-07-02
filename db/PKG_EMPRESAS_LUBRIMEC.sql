--------------------------------------------------------------------------------
-- Paquete PKG_EMPRESAS_LUBRIMEC
-- CRUD de la tabla EMPRESAS para el modulo ORDS lubrimec (pagina APEX 12).
-- Valida token con PKG_AUTH_LUBRIMEC y responde { success, message, data }.
--
-- La PK COD_EMPRESA la asigna el trigger TRG_RENUMERAR_EMPRESA.
-- NRO_DOCUMENTO es UNIQUE: se devuelve 409 si se intenta duplicar.
-- ACTIVO es NOT NULL VARCHAR2(1): 'S' activo / 'N' inactivo.
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_EMPRESAS_LUBRIMEC AS

  PROCEDURE LISTAR(p_token IN VARCHAR2);

  PROCEDURE OBTENER(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);

  PROCEDURE INSERTAR(
      p_token         IN VARCHAR2,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2);

  PROCEDURE ACTUALIZAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2);

  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);

END PKG_EMPRESAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_EMPRESAS_LUBRIMEC AS

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
  -- LISTAR
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
        SELECT cod_empresa, nombre, nro_documento, activo
          FROM empresas
         ORDER BY nombre
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
      APEX_JSON.WRITE('nombre', r.nombre);
      APEX_JSON.WRITE('nro_documento', r.nro_documento);
      APEX_JSON.WRITE('activo', r.activo);
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
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_nombre        empresas.nombre%TYPE;
    l_nro_documento empresas.nro_documento%TYPE;
    l_activo        empresas.activo%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT nombre, nro_documento, activo
        INTO l_nombre, l_nro_documento, l_activo
        FROM empresas
       WHERE cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Empresa no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('cod_empresa', p_cod_empresa);
    APEX_JSON.WRITE('nombre', l_nombre);
    APEX_JSON.WRITE('nro_documento', l_nro_documento);
    APEX_JSON.WRITE('activo', l_activo);
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
      p_token         IN VARCHAR2,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2) IS
    l_usuario     VARCHAR2(255);
    l_cod_empresa empresas.cod_empresa%TYPE;
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

    INSERT INTO empresas (nombre, nro_documento, activo)
    VALUES (p_nombre, p_nro_documento, NVL(p_activo, 'S'))
    RETURNING cod_empresa INTO l_cod_empresa;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Empresa creada');
    APEX_JSON.WRITE('cod_empresa', l_cod_empresa);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe una empresa con ese numero de documento');
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token         IN VARCHAR2,
      p_cod_empresa   IN NUMBER,
      p_nombre        IN VARCHAR2,
      p_nro_documento IN VARCHAR2,
      p_activo        IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
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

    UPDATE empresas
       SET nombre        = p_nombre,
           nro_documento = p_nro_documento,
           activo        = NVL(p_activo, 'S')
     WHERE cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Empresa no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Empresa actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Ya existe una empresa con ese numero de documento');
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM empresas WHERE cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Empresa no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Empresa eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      -- FK de otras tablas (personas.cod_empresa, etc.) apuntan a empresas.
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: la empresa tiene registros asociados');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

END PKG_EMPRESAS_LUBRIMEC;
/
