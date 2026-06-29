--------------------------------------------------------------------------------
-- Paquete PKG_MARCAS_LUBRIMEC
-- CRUD de la tabla MARCAS para el modulo ORDS lubrimec.
-- Cada operacion valida el token Bearer con PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN
-- y devuelve JSON con APEX_JSON usando el mismo contrato { success, message, data }.
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_MARCAS_LUBRIMEC AS

  -- Lista todas las marcas de una empresa.
  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- Devuelve una marca por su id (dentro de su empresa).
  PROCEDURE OBTENER(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER);

  -- Inserta una marca (el id lo asigna el trigger TRG_RENUMERAR_MARCAS).
  PROCEDURE INSERTAR(
      p_token       IN VARCHAR2,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER);

  -- Actualiza una marca existente.
  PROCEDURE ACTUALIZAR(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER);

  -- Borra una marca por su id (dentro de su empresa).
  PROCEDURE ELIMINAR(
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER);

END PKG_MARCAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_MARCAS_LUBRIMEC AS

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
        SELECT id_marca, descripcion, cod_empresa, valoracion
          FROM marcas
         WHERE cod_empresa = p_cod_empresa
         ORDER BY descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
      APEX_JSON.WRITE('valoracion', r.valoracion);
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
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_descripcion marcas.descripcion%TYPE;
    l_cod_empresa marcas.cod_empresa%TYPE;
    l_valoracion  marcas.valoracion%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT descripcion, cod_empresa, valoracion
        INTO l_descripcion, l_cod_empresa, l_valoracion
        FROM marcas
       WHERE id_marca = p_id_marca
         AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Marca no encontrada');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_marca', p_id_marca);
    APEX_JSON.WRITE('descripcion', l_descripcion);
    APEX_JSON.WRITE('cod_empresa', l_cod_empresa);
    APEX_JSON.WRITE('valoracion', l_valoracion);
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
      p_token       IN VARCHAR2,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER) IS
    l_usuario  VARCHAR2(255);
    l_id_marca marcas.id_marca%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    INSERT INTO marcas (descripcion, cod_empresa, valoracion)
    VALUES (p_descripcion, p_cod_empresa, p_valoracion)
    RETURNING id_marca INTO l_id_marca;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Marca creada');
    APEX_JSON.WRITE('id_marca', l_id_marca);
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
      p_token       IN VARCHAR2,
      p_id_marca    IN NUMBER,
      p_descripcion IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_valoracion  IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    -- No se permite reasignar la marca a otra empresa: el filtro asegura
    -- que solo se actualiza si pertenece a la empresa indicada.
    UPDATE marcas
       SET descripcion = p_descripcion,
           valoracion  = p_valoracion
     WHERE id_marca = p_id_marca
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Marca no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Marca actualizada');
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
      p_id_marca    IN NUMBER,
      p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM marcas
     WHERE id_marca = p_id_marca
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Marca no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Marca eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

END PKG_MARCAS_LUBRIMEC;
/
