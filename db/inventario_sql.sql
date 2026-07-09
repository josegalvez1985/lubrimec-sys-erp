--------------------------------------------------------------------------------
-- INVENTARIO (paginas APEX 58 grilla + 59 modal Crear Inventario) — paquete CRUD
-- + endpoints ORDS en un archivo. Ejecutar completo como el esquema JOSEGALVEZ.
-- Requiere PKG_AUTH_LUBRIMEC, PKG_STOCK (fn_existencia) y la vista V_PEDIDO_PROVEEDOR.
--
-- PK id_inventario autogenerada (el APEX inserta sin PK y la recupera despues).
-- Multiempresa (cod_empresa). cantidad_sistema la calcula el backend con
-- pkg_stock.fn_existencia al insertar y al cambiar de articulo (replica la DA
-- CANTIDAD de la pag 59); cerrado nace 'N'.
--
-- Rutas:
--   GET    /lubrimec/inventario?cod_empresa=:n                     -> listar
--   GET    /lubrimec/inventario/:id?cod_empresa=:n                 -> obtener
--   POST   /lubrimec/inventario                                    -> insertar
--   PUT    /lubrimec/inventario/:id                                -> actualizar
--   DELETE /lubrimec/inventario/:id?cod_empresa=:n                 -> eliminar
--   GET    /lubrimec/inventario/lov-rubros?cod_empresa=            -> LOV completo (sin 30/39)
--   GET    /lubrimec/inventario/lov-marcas?cod_empresa=            -> LOV completo
--   GET    /lubrimec/inventario/buscar-articulos?cod_empresa=
--          -> LOV COMPLETA de articulos (V_PEDIDO_PROVEEDOR, mas vendidos primero,
--             con es_activo/id_rubro/id_marca); el filtrado es 100% en el front
--   GET    /lubrimec/inventario/articulo-por-barra?cod_empresa=&cod_barra=
--          -> resuelve un codigo de barras a su articulo (lector de barras)
--
-- === 1) PAQUETE PKG_INVENTARIO_LUBRIMEC ====================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_INVENTARIO_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  PROCEDURE OBTENER(
      p_token        IN VARCHAR2,
      p_id_inventario IN NUMBER,
      p_cod_empresa  IN NUMBER);

  -- Inserta un conteo; cantidad_sistema = pkg_stock.fn_existencia, cerrado 'N'.
  PROCEDURE INSERTAR(
      p_token           IN VARCHAR2,
      p_cod_empresa     IN NUMBER,
      p_id_articulo     IN NUMBER,
      p_fecha           IN VARCHAR2,   -- YYYY-MM-DD
      p_cantidad_fisica IN NUMBER,
      p_cod_barra       IN VARCHAR2);

  -- Actualiza; si cambia el articulo recalcula cantidad_sistema.
  PROCEDURE ACTUALIZAR(
      p_token           IN VARCHAR2,
      p_id_inventario   IN NUMBER,
      p_cod_empresa     IN NUMBER,
      p_id_articulo     IN NUMBER,
      p_fecha           IN VARCHAR2,   -- YYYY-MM-DD
      p_cantidad_fisica IN NUMBER,
      p_cod_barra       IN VARCHAR2);

  PROCEDURE ELIMINAR(
      p_token         IN VARCHAR2,
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER);

  -- LOV completa de rubros (sin 30/39 servicios/suministros); filtra el front.
  PROCEDURE LOV_RUBROS(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- LOV completa de marcas; filtra el front.
  PROCEDURE LOV_MARCAS(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- LOV COMPLETA de articulos desde V_PEDIDO_PROVEEDOR (mas vendidos primero).
  -- Devuelve TODO el catalogo con es_activo/id_rubro/id_marca; el filtrado
  -- (palabras sueltas, ID parcial, cascada es_activo/rubro/marca) es 100% front.
  PROCEDURE BUSCAR_ARTICULOS(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER);

  -- Resuelve un codigo de barras a su articulo (DA ID_ARTICULO de la pag 59).
  PROCEDURE ARTICULO_POR_BARRA(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_cod_barra   IN VARCHAR2);

END PKG_INVENTARIO_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_INVENTARIO_LUBRIMEC AS

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

  -- Existencia actual del articulo (DA CANTIDAD de la pag 59); 0 ante error.
  FUNCTION f_existencia(p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN NVL(pkg_stock.fn_existencia(p_id_articulo, p_cod_empresa), 0);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN 0;
  END f_existencia;

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
        SELECT i.id_inventario,
               i.id_articulo,
               a.descripcion AS articulo,
               TO_CHAR(i.fecha, 'YYYY-MM-DD') AS fecha,
               i.cantidad_fisica,
               i.cantidad_sistema,
               NVL(i.cantidad_fisica, 0) - NVL(i.cantidad_sistema, 0) AS diferencia,
               i.cerrado,
               i.cod_barra
          FROM inventario i
          LEFT JOIN articulos a
                 ON a.cod_empresa = i.cod_empresa
                AND a.id_articulo = i.id_articulo
         WHERE i.cod_empresa = p_cod_empresa
         ORDER BY i.id_inventario DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_inventario', r.id_inventario);
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('articulo', r.articulo);
      APEX_JSON.WRITE('fecha', r.fecha);
      APEX_JSON.WRITE('cantidad_fisica', r.cantidad_fisica);
      APEX_JSON.WRITE('cantidad_sistema', r.cantidad_sistema);
      APEX_JSON.WRITE('diferencia', r.diferencia);
      APEX_JSON.WRITE('cerrado', r.cerrado);
      APEX_JSON.WRITE('cod_barra', r.cod_barra);
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
      p_token         IN VARCHAR2,
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_row     inventario%ROWTYPE;
    l_articulo articulos.descripcion%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT i.* INTO l_row
        FROM inventario i
       WHERE i.id_inventario = p_id_inventario
         AND i.cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Registro de inventario no encontrado');
        RETURN;
    END;

    BEGIN
      SELECT a.descripcion INTO l_articulo
        FROM articulos a
       WHERE a.cod_empresa = l_row.cod_empresa
         AND a.id_articulo = l_row.id_articulo;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        l_articulo := NULL;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_inventario', l_row.id_inventario);
    APEX_JSON.WRITE('id_articulo', l_row.id_articulo);
    APEX_JSON.WRITE('articulo', l_articulo);
    APEX_JSON.WRITE('fecha', TO_CHAR(l_row.fecha, 'YYYY-MM-DD'));
    APEX_JSON.WRITE('cantidad_fisica', l_row.cantidad_fisica);
    APEX_JSON.WRITE('cantidad_sistema', l_row.cantidad_sistema);
    APEX_JSON.WRITE('diferencia', NVL(l_row.cantidad_fisica, 0) - NVL(l_row.cantidad_sistema, 0));
    APEX_JSON.WRITE('cerrado', l_row.cerrado);
    APEX_JSON.WRITE('cod_barra', l_row.cod_barra);
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
      p_cod_empresa     IN NUMBER,
      p_id_articulo     IN NUMBER,
      p_fecha           IN VARCHAR2,
      p_cantidad_fisica IN NUMBER,
      p_cod_barra       IN VARCHAR2) IS
    l_usuario  VARCHAR2(255);
    l_id       inventario.id_inventario%TYPE;
    l_fecha    DATE;
    l_sistema  NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_cod_empresa IS NULL OR p_id_articulo IS NULL
       OR p_fecha IS NULL OR p_cantidad_fisica IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa, id_articulo, fecha y cantidad_fisica son obligatorios');
      RETURN;
    END IF;

    l_fecha   := TO_DATE(p_fecha, 'YYYY-MM-DD');
    l_sistema := f_existencia(p_id_articulo, p_cod_empresa);

    INSERT INTO inventario (cod_empresa, id_articulo, fecha, cantidad_fisica,
                            cantidad_sistema, cerrado, cod_barra)
    VALUES (p_cod_empresa, p_id_articulo, l_fecha, p_cantidad_fisica,
            l_sistema, 'N', p_cod_barra)
    RETURNING id_inventario INTO l_id;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Inventario creado');
    APEX_JSON.WRITE('id_inventario', l_id);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'El articulo indicado no existe');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token           IN VARCHAR2,
      p_id_inventario   IN NUMBER,
      p_cod_empresa     IN NUMBER,
      p_id_articulo     IN NUMBER,
      p_fecha           IN VARCHAR2,
      p_cantidad_fisica IN NUMBER,
      p_cod_barra       IN VARCHAR2) IS
    l_usuario      VARCHAR2(255);
    l_fecha        DATE;
    l_id_ant       inventario.id_articulo%TYPE;
    l_sistema_ant  inventario.cantidad_sistema%TYPE;
    l_sistema      NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_id_articulo IS NULL OR p_fecha IS NULL OR p_cantidad_fisica IS NULL THEN
      p_error(400, 'Bad Request', 'id_articulo, fecha y cantidad_fisica son obligatorios');
      RETURN;
    END IF;

    BEGIN
      SELECT id_articulo, cantidad_sistema
        INTO l_id_ant, l_sistema_ant
        FROM inventario
       WHERE id_inventario = p_id_inventario
         AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Registro de inventario no encontrado');
        RETURN;
    END;

    l_fecha := TO_DATE(p_fecha, 'YYYY-MM-DD');
    -- Si cambia el articulo se recalcula la existencia (replica la DA CANTIDAD).
    IF l_id_ant = p_id_articulo THEN
      l_sistema := l_sistema_ant;
    ELSE
      l_sistema := f_existencia(p_id_articulo, p_cod_empresa);
    END IF;

    UPDATE inventario
       SET id_articulo      = p_id_articulo,
           fecha            = l_fecha,
           cantidad_fisica  = p_cantidad_fisica,
           cantidad_sistema = l_sistema,
           cod_barra        = p_cod_barra
     WHERE id_inventario = p_id_inventario
       AND cod_empresa = p_cod_empresa;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Inventario actualizado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'El articulo indicado no existe');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(
      p_token         IN VARCHAR2,
      p_id_inventario IN NUMBER,
      p_cod_empresa   IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM inventario
     WHERE id_inventario = p_id_inventario
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Registro de inventario no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Inventario eliminado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- LOV_RUBROS (lista completa; filtra el front)
  --------------------------------------------------------------------------
  PROCEDURE LOV_RUBROS(
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
        SELECT id_rubro, descripcion
          FROM rubros
         WHERE cod_empresa = p_cod_empresa
           AND id_rubro NOT IN (30, 39) -- servicios / suministros
         ORDER BY descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_rubro', r.id_rubro);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LOV_RUBROS;

  --------------------------------------------------------------------------
  -- LOV_MARCAS (lista completa; filtra el front)
  --------------------------------------------------------------------------
  PROCEDURE LOV_MARCAS(
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
        SELECT id_marca, descripcion
          FROM marcas
         WHERE cod_empresa = p_cod_empresa
         ORDER BY descripcion
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LOV_MARCAS;

  --------------------------------------------------------------------------
  -- BUSCAR_ARTICULOS (LOV P59_ID_ARTICULO: catalogo COMPLETO, filtra el front)
  --------------------------------------------------------------------------
  PROCEDURE BUSCAR_ARTICULOS(
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
        SELECT a.descripcion, a.id_articulo, a.codigo_oem,
               NVL(a.es_activo, 'S') AS es_activo,
               a.id_rubro, a.id_marca
          FROM v_pedido_proveedor a
         WHERE a.cod_empresa = p_cod_empresa
         GROUP BY a.descripcion, a.id_articulo, a.codigo_oem,
                  NVL(a.es_activo, 'S'), a.id_rubro, a.id_marca
         ORDER BY SUM(a.ventas) DESC, a.codigo_oem ASC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.WRITE('es_activo', r.es_activo);
      APEX_JSON.WRITE('id_rubro', r.id_rubro);
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END BUSCAR_ARTICULOS;

  --------------------------------------------------------------------------
  -- ARTICULO_POR_BARRA (lector de codigo de barras de la pag 59)
  --------------------------------------------------------------------------
  PROCEDURE ARTICULO_POR_BARRA(
      p_token       IN VARCHAR2,
      p_cod_empresa IN NUMBER,
      p_cod_barra   IN VARCHAR2) IS
    l_usuario     VARCHAR2(255);
    l_id_articulo NUMBER;
    l_descripcion articulos.descripcion%TYPE;
    l_codigo_oem  articulos.codigo_oem%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT cb.id_articulo, a.descripcion, a.codigo_oem
        INTO l_id_articulo, l_descripcion, l_codigo_oem
        FROM codigos_barras cb
        LEFT JOIN articulos a
               ON a.cod_empresa = cb.cod_empresa
              AND a.id_articulo = cb.id_articulo
       WHERE cb.cod_empresa = p_cod_empresa
         AND cb.cod_barra = p_cod_barra;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Codigo de barras no registrado');
        RETURN;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_articulo', l_id_articulo);
    APEX_JSON.WRITE('descripcion', l_descripcion);
    APEX_JSON.WRITE('codigo_oem', l_codigo_oem);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ARTICULO_POR_BARRA;

END PKG_INVENTARIO_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--------------------------------------------------------------------------------

BEGIN
  -- Limpieza idempotente.
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario', 'GET');                      EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario', 'POST');                     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/:id', 'GET');                  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/:id', 'PUT');                  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/:id', 'DELETE');               EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/lov-rubros', 'GET');           EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/lov-marcas', 'GET');           EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/buscar-articulos', 'GET');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'inventario/articulo-por-barra', 'GET');   EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /inventario
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /inventario?cod_empresa=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario',
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
    PKG_INVENTARIO_LUBRIMEC.LISTAR(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- POST /inventario  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario',
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

    PKG_INVENTARIO_LUBRIMEC.INSERTAR(
        p_token           => l_token,
        p_cod_empresa     => TO_NUMBER(:cod_empresa),
        p_id_articulo     => TO_NUMBER(:id_articulo),
        p_fecha           => :fecha,
        p_cantidad_fisica => TO_NUMBER(:cantidad_fisica),
        p_cod_barra       => :cod_barra);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /inventario/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario/:id',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /inventario/:id?cod_empresa=:n  -> obtener
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/:id',
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
    PKG_INVENTARIO_LUBRIMEC.OBTENER(
        p_token         => l_token,
        p_id_inventario => TO_NUMBER(:id),
        p_cod_empresa   => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/:id', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- PUT /inventario/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/:id',
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

    PKG_INVENTARIO_LUBRIMEC.ACTUALIZAR(
        p_token           => l_token,
        p_id_inventario   => TO_NUMBER(:id),
        p_cod_empresa     => TO_NUMBER(:cod_empresa),
        p_id_articulo     => TO_NUMBER(:id_articulo),
        p_fecha           => :fecha,
        p_cantidad_fisica => TO_NUMBER(:cantidad_fisica),
        p_cod_barra       => :cod_barra);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- DELETE /inventario/:id?cod_empresa=:n  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/:id',
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
    PKG_INVENTARIO_LUBRIMEC.ELIMINAR(
        p_token         => l_token,
        p_id_inventario => TO_NUMBER(:id),
        p_cod_empresa   => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- Sub-rutas fijas (p_priority 1 para que ganen a /inventario/:id)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario/lov-rubros',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/lov-rubros',
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
    PKG_INVENTARIO_LUBRIMEC.LOV_RUBROS(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/lov-rubros', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario/lov-marcas',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/lov-marcas',
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
    PKG_INVENTARIO_LUBRIMEC.LOV_MARCAS(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/lov-marcas', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario/buscar-articulos',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/buscar-articulos',
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
    PKG_INVENTARIO_LUBRIMEC.BUSCAR_ARTICULOS(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/buscar-articulos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'inventario/articulo-por-barra',
                         p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'inventario/articulo-por-barra',
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
    PKG_INVENTARIO_LUBRIMEC.ARTICULO_POR_BARRA(
        p_token       => l_token,
        p_cod_empresa => TO_NUMBER(NVL(get_qs(l_qs, 'cod_empresa'), '24')),
        p_cod_barra   => get_qs(l_qs, 'cod_barra'));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'inventario/articulo-por-barra', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
