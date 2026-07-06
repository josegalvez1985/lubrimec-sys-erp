--------------------------------------------------------------------------------
-- ARTICULOS (pagina APEX 4) — paquete CRUD + endpoints ORDS.
-- Ejecutar completo como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- PK id_articulo por trigger TRG_ARTICULOS. Multiempresa (cod_empresa, FK a empresas).
-- FKs: cod_iva, cod_unidad_medida, id_rubro, id_marca, id_viscosidad. Imagen en BLOB.
--
-- Campos que EDITA el usuario: descripcion, cod_iva, cod_unidad_medida, id_rubro,
-- id_marca, id_viscosidad, codigo_oem, valoracion, estado, es_activo, imagen.
-- Campos de SOLO LECTURA (los mantienen otros procesos, se muestran pero no se
-- escriben desde el ABM): precio_venta, existencia, cantidad_vendida,
-- costo_ultima_compra, fecha_ultimo_inventario, last_update.
--
-- Imagen: LISTAR NO trae el BLOB (solo un flag tiene_imagen = getlength>0) para no
-- serializar miles de blobs; OBTENER sí devuelve imagen_base64. GUARDAR/ACTUALIZAR
-- reciben imagen_base64 opcional (null = no tocar la imagen; patron de monedas_detalle).
--
-- === 1) PAQUETE PKG_ARTICULOS_LUBRIMEC =====================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_ARTICULOS_LUBRIMEC AS

  PROCEDURE LISTAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER);
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_descripcion IN VARCHAR2, p_cod_iva IN NUMBER,
      p_cod_unidad_medida IN VARCHAR2, p_id_rubro IN NUMBER, p_id_marca IN NUMBER,
      p_id_viscosidad IN NUMBER, p_codigo_oem IN VARCHAR2,
      p_valoracion IN NUMBER, p_estado IN VARCHAR2, p_es_activo IN VARCHAR2,
      p_imagen_base64 IN CLOB, p_nombre_imagen IN VARCHAR2, p_mime_type IN VARCHAR2,
      p_cod_empresa IN NUMBER);
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_articulo IN NUMBER, p_descripcion IN VARCHAR2,
      p_cod_iva IN NUMBER, p_cod_unidad_medida IN VARCHAR2, p_id_rubro IN NUMBER,
      p_id_marca IN NUMBER, p_id_viscosidad IN NUMBER, p_codigo_oem IN VARCHAR2,
      p_valoracion IN NUMBER, p_estado IN VARCHAR2,
      p_es_activo IN VARCHAR2, p_imagen_base64 IN CLOB, p_nombre_imagen IN VARCHAR2,
      p_mime_type IN VARCHAR2, p_cod_empresa IN NUMBER);
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER);
  -- Sirve el BLOB de la imagen directo (para <img src> del thumbnail en la grilla).
  -- Sin token: el <img> del navegador no puede mandar el header Authorization.
  PROCEDURE SERVIR_IMAGEN(p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER);

END PKG_ARTICULOS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_ARTICULOS_LUBRIMEC AS

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

  -- base64 (CLOB) -> BLOB. NULL si la cadena viene vacia.
  FUNCTION b64_to_blob(p_b64 IN CLOB) RETURN BLOB IS
    l_blob BLOB;
  BEGIN
    IF p_b64 IS NULL OR DBMS_LOB.GETLENGTH(p_b64) = 0 THEN
      RETURN NULL;
    END IF;
    l_blob := APEX_WEB_SERVICE.CLOBBASE642BLOB(p_b64);
    RETURN l_blob;
  END b64_to_blob;

  --------------------------------------------------------------------------
  -- LISTAR (sin el BLOB: solo tiene_imagen = getlength>0)
  --------------------------------------------------------------------------
  PROCEDURE LISTAR(p_token IN VARCHAR2, p_cod_empresa IN NUMBER) IS
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
        SELECT a.id_articulo, a.descripcion, a.cod_iva, a.cod_unidad_medida,
               a.estado, a.es_activo, a.id_rubro, a.id_marca, a.id_viscosidad,
               a.codigo_oem, a.precio_venta, a.valoracion, a.existencia,
               a.cantidad_vendida, a.costo_ultima_compra,
               TO_CHAR(a.fecha_ultimo_inventario, 'DD/MM/YYYY') fecha_ultimo_inventario,
               CASE WHEN DBMS_LOB.GETLENGTH(a.archivo_imagen) > 0 THEN 1 ELSE 0 END tiene_imagen,
               r.descripcion  descripcion_rubro,
               m.descripcion  descripcion_marca,
               v.descripcion  descripcion_viscosidad
          FROM articulos a
          LEFT JOIN rubros r
                 ON r.id_rubro = a.id_rubro AND r.cod_empresa = a.cod_empresa
          LEFT JOIN marcas m
                 ON m.id_marca = a.id_marca AND m.cod_empresa = a.cod_empresa
          LEFT JOIN viscosidad_lubricantes v
                 ON v.id_viscosidad = a.id_viscosidad
         WHERE a.cod_empresa = p_cod_empresa
         ORDER BY a.id_articulo DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('cod_iva', r.cod_iva);
      APEX_JSON.WRITE('cod_unidad_medida', r.cod_unidad_medida);
      APEX_JSON.WRITE('estado', r.estado);
      APEX_JSON.WRITE('es_activo', r.es_activo);
      APEX_JSON.WRITE('id_rubro', r.id_rubro);
      APEX_JSON.WRITE('id_marca', r.id_marca);
      APEX_JSON.WRITE('id_viscosidad', r.id_viscosidad);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.WRITE('precio_venta', r.precio_venta);
      APEX_JSON.WRITE('valoracion', r.valoracion);
      APEX_JSON.WRITE('existencia', r.existencia);
      APEX_JSON.WRITE('cantidad_vendida', r.cantidad_vendida);
      APEX_JSON.WRITE('costo_ultima_compra', r.costo_ultima_compra);
      APEX_JSON.WRITE('fecha_ultimo_inventario', r.fecha_ultimo_inventario);
      APEX_JSON.WRITE('tiene_imagen', r.tiene_imagen);
      APEX_JSON.WRITE('descripcion_rubro', r.descripcion_rubro);
      APEX_JSON.WRITE('descripcion_marca', r.descripcion_marca);
      APEX_JSON.WRITE('descripcion_viscosidad', r.descripcion_viscosidad);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- OBTENER (incluye imagen_base64)
  --------------------------------------------------------------------------
  PROCEDURE OBTENER(p_token IN VARCHAR2, p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_r       articulos%ROWTYPE;
    l_b64     CLOB;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT * INTO l_r
        FROM articulos
       WHERE id_articulo = p_id_articulo AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_error(404, 'Not Found', 'Articulo no encontrado');
        RETURN;
    END;

    IF l_r.archivo_imagen IS NOT NULL AND DBMS_LOB.GETLENGTH(l_r.archivo_imagen) > 0 THEN
      l_b64 := APEX_WEB_SERVICE.BLOB2CLOBBASE64(l_r.archivo_imagen);
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_articulo', l_r.id_articulo);
    APEX_JSON.WRITE('descripcion', l_r.descripcion);
    APEX_JSON.WRITE('cod_iva', l_r.cod_iva);
    APEX_JSON.WRITE('cod_unidad_medida', l_r.cod_unidad_medida);
    APEX_JSON.WRITE('estado', l_r.estado);
    APEX_JSON.WRITE('es_activo', l_r.es_activo);
    APEX_JSON.WRITE('id_rubro', l_r.id_rubro);
    APEX_JSON.WRITE('id_marca', l_r.id_marca);
    APEX_JSON.WRITE('id_viscosidad', l_r.id_viscosidad);
    APEX_JSON.WRITE('codigo_oem', l_r.codigo_oem);
    APEX_JSON.WRITE('precio_venta', l_r.precio_venta);
    APEX_JSON.WRITE('valoracion', l_r.valoracion);
    APEX_JSON.WRITE('existencia', l_r.existencia);
    APEX_JSON.WRITE('cantidad_vendida', l_r.cantidad_vendida);
    APEX_JSON.WRITE('costo_ultima_compra', l_r.costo_ultima_compra);
    APEX_JSON.WRITE('fecha_ultimo_inventario',
                    TO_CHAR(l_r.fecha_ultimo_inventario, 'DD/MM/YYYY'));
    APEX_JSON.WRITE('nombre_imagen', l_r.nombre_imagen);
    APEX_JSON.WRITE('mime_type', l_r.mime_type);
    APEX_JSON.WRITE('imagen_base64', l_b64);
    APEX_JSON.WRITE('cod_empresa', l_r.cod_empresa);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END OBTENER;

  --------------------------------------------------------------------------
  -- INSERTAR (PK por trigger TRG_ARTICULOS)
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_descripcion IN VARCHAR2, p_cod_iva IN NUMBER,
      p_cod_unidad_medida IN VARCHAR2, p_id_rubro IN NUMBER, p_id_marca IN NUMBER,
      p_id_viscosidad IN NUMBER, p_codigo_oem IN VARCHAR2,
      p_valoracion IN NUMBER, p_estado IN VARCHAR2, p_es_activo IN VARCHAR2,
      p_imagen_base64 IN CLOB, p_nombre_imagen IN VARCHAR2, p_mime_type IN VARCHAR2,
      p_cod_empresa IN NUMBER) IS
    l_usuario     VARCHAR2(255);
    l_id_articulo articulos.id_articulo%TYPE;
    l_blob        BLOB;
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
    IF p_cod_empresa IS NULL THEN
      p_error(400, 'Bad Request', 'cod_empresa es obligatorio');
      RETURN;
    END IF;

    l_blob := b64_to_blob(p_imagen_base64);

    INSERT INTO articulos (
        descripcion, cod_iva, cod_unidad_medida, id_rubro, id_marca, id_viscosidad,
        codigo_oem, valoracion, estado, es_activo,
        archivo_imagen, nombre_imagen, mime_type, last_update, cod_empresa)
    VALUES (
        p_descripcion, p_cod_iva, p_cod_unidad_medida, p_id_rubro, p_id_marca, p_id_viscosidad,
        p_codigo_oem, NVL(p_valoracion, 0), p_estado, NVL(p_es_activo, 'S'),
        l_blob, p_nombre_imagen, p_mime_type, SYSDATE, p_cod_empresa)
    RETURNING id_articulo INTO l_id_articulo;
    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Articulo creado');
    APEX_JSON.WRITE('id_articulo', l_id_articulo);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      ROLLBACK;
      p_error(409, 'Conflict', 'Articulo duplicado');
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Alguna referencia (IVA/unidad/rubro/marca/viscosidad) no existe');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END INSERTAR;

  --------------------------------------------------------------------------
  -- ACTUALIZAR (imagen_base64 NULL = no toca la imagen)
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_articulo IN NUMBER, p_descripcion IN VARCHAR2,
      p_cod_iva IN NUMBER, p_cod_unidad_medida IN VARCHAR2, p_id_rubro IN NUMBER,
      p_id_marca IN NUMBER, p_id_viscosidad IN NUMBER, p_codigo_oem IN VARCHAR2,
      p_valoracion IN NUMBER, p_estado IN VARCHAR2,
      p_es_activo IN VARCHAR2, p_imagen_base64 IN CLOB, p_nombre_imagen IN VARCHAR2,
      p_mime_type IN VARCHAR2, p_cod_empresa IN NUMBER) IS
    l_usuario  VARCHAR2(255);
    l_tiene_img BOOLEAN := p_imagen_base64 IS NOT NULL
                           AND DBMS_LOB.GETLENGTH(p_imagen_base64) > 0;
    l_blob     BLOB;
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

    -- Campos de negocio siempre; la imagen solo si vino una nueva.
    UPDATE articulos
       SET descripcion       = p_descripcion,
           cod_iva           = p_cod_iva,
           cod_unidad_medida = p_cod_unidad_medida,
           id_rubro          = p_id_rubro,
           id_marca          = p_id_marca,
           id_viscosidad     = p_id_viscosidad,
           codigo_oem        = p_codigo_oem,
           valoracion        = NVL(p_valoracion, 0),
           estado            = p_estado,
           es_activo         = p_es_activo,
           last_update       = SYSDATE
     WHERE id_articulo = p_id_articulo AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Articulo no encontrado');
      RETURN;
    END IF;

    IF l_tiene_img THEN
      l_blob := b64_to_blob(p_imagen_base64);
      UPDATE articulos
         SET archivo_imagen = l_blob,
             nombre_imagen  = p_nombre_imagen,
             mime_type      = p_mime_type
       WHERE id_articulo = p_id_articulo AND cod_empresa = p_cod_empresa;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Articulo actualizado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Alguna referencia (IVA/unidad/rubro/marca/viscosidad) no existe');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM articulos
     WHERE id_articulo = p_id_articulo AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Articulo no encontrado');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Articulo eliminado');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      -- -2292: hijos con FK a este articulo (codigos_barras, articulos_proveedores...)
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: el articulo tiene registros relacionados');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- SERVIR_IMAGEN: devuelve el BLOB con su mime para <img src>. Sin auth
  -- (el navegador no manda Authorization en un <img>); solo expone la imagen.
  --------------------------------------------------------------------------
  PROCEDURE SERVIR_IMAGEN(p_id_articulo IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_blob BLOB;
    l_mime articulos.mime_type%TYPE;
  BEGIN
    BEGIN
      SELECT archivo_imagen, mime_type
        INTO l_blob, l_mime
        FROM articulos
       WHERE id_articulo = p_id_articulo AND cod_empresa = p_cod_empresa;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        OWA_UTIL.STATUS_LINE(404, 'Not Found', FALSE);
        OWA_UTIL.HTTP_HEADER_CLOSE;
        RETURN;
    END;

    IF l_blob IS NULL OR DBMS_LOB.GETLENGTH(l_blob) = 0 THEN
      OWA_UTIL.STATUS_LINE(404, 'Not Found', FALSE);
      OWA_UTIL.HTTP_HEADER_CLOSE;
      RETURN;
    END IF;

    OWA_UTIL.MIME_HEADER(NVL(l_mime, 'image/png'), FALSE);
    HTP.P('Content-Length: ' || DBMS_LOB.GETLENGTH(l_blob));
    HTP.P('Cache-Control: no-store');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    WPG_DOCLOAD.DOWNLOAD_FILE(l_blob);
  END SERVIR_IMAGEN;

END PKG_ARTICULOS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/articulos?cod_empresa=:n   -> listar
--   GET    /lubrimec/articulos/:id              -> obtener (con imagen_base64)
--   POST   /lubrimec/articulos                  -> insertar
--   PUT    /lubrimec/articulos/:id              -> actualizar
--   DELETE /lubrimec/articulos/:id              -> eliminar
--
-- OJO: el patron 'articulos/buscar' (selector) ya existe en codigos_barras_sql.sql.
-- Aqui se definen 'articulos' y 'articulos/:id'; no colisionan.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos', 'GET');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos', 'POST');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/:id', 'GET');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/:id', 'PUT');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/:id', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'articulos/:id/imagen', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- Plantilla coleccion: /articulos
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'articulos',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /articulos?cod_empresa=:n  -> listar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_ARTICULOS_LUBRIMEC.LISTAR(p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- POST /articulos  -> insertar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos',
      p_method      => 'POST',
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
    PKG_ARTICULOS_LUBRIMEC.INSERTAR(
        p_token             => l_token,
        p_descripcion       => :descripcion,
        p_cod_iva           => TO_NUMBER(:cod_iva),
        p_cod_unidad_medida => :cod_unidad_medida,
        p_id_rubro          => TO_NUMBER(:id_rubro),
        p_id_marca          => TO_NUMBER(:id_marca),
        p_id_viscosidad     => TO_NUMBER(:id_viscosidad),
        p_codigo_oem        => :codigo_oem,
        p_valoracion        => TO_NUMBER(:valoracion),
        p_estado            => :estado,
        p_es_activo         => :es_activo,
        p_imagen_base64     => :imagen_base64,
        p_nombre_imagen     => :nombre_imagen,
        p_mime_type         => :mime_type,
        p_cod_empresa       => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos',
      p_method             => 'POST',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- Plantilla item: /articulos/:id
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'articulos/:id',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- GET /articulos/:id  -> obtener (con imagen_base64)
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/:id',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_ARTICULOS_LUBRIMEC.OBTENER(
        p_token => l_token, p_id_articulo => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos/:id',
      p_method             => 'GET',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- PUT /articulos/:id  -> actualizar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/:id',
      p_method      => 'PUT',
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
    PKG_ARTICULOS_LUBRIMEC.ACTUALIZAR(
        p_token             => l_token,
        p_id_articulo       => TO_NUMBER(:id),
        p_descripcion       => :descripcion,
        p_cod_iva           => TO_NUMBER(:cod_iva),
        p_cod_unidad_medida => :cod_unidad_medida,
        p_id_rubro          => TO_NUMBER(:id_rubro),
        p_id_marca          => TO_NUMBER(:id_marca),
        p_id_viscosidad     => TO_NUMBER(:id_viscosidad),
        p_codigo_oem        => :codigo_oem,
        p_valoracion        => TO_NUMBER(:valoracion),
        p_estado            => :estado,
        p_es_activo         => :es_activo,
        p_imagen_base64     => :imagen_base64,
        p_nombre_imagen     => :nombre_imagen,
        p_mime_type         => :mime_type,
        p_cod_empresa       => TO_NUMBER(:cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos/:id',
      p_method             => 'PUT',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  -- DELETE /articulos/:id  -> eliminar
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/:id',
      p_method      => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256); l_pos PLS_INTEGER;
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_ARTICULOS_LUBRIMEC.ELIMINAR(
        p_token => l_token, p_id_articulo => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'articulos/:id',
      p_method             => 'DELETE',
      p_name               => 'Authorization',
      p_bind_variable_name => 'authorization',
      p_source_type        => 'HEADER',
      p_param_type         => 'STRING',
      p_access_method      => 'IN');

  ----------------------------------------------------------------------------
  -- /articulos/:id/imagen  -> sirve el BLOB (para <img src> del thumbnail).
  -- Publico (sin Authorization): el navegador no manda el header en un <img>.
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(
        p_module_name => 'lubrimec',
        p_pattern     => 'articulos/:id/imagen',
        p_priority    => 0,
        p_etag_type   => 'HASH',
        p_comments    => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'articulos/:id/imagen',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_query       VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
    FUNCTION get_qs(p_qs IN VARCHAR2, p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_p PLS_INTEGER; l_e PLS_INTEGER; l_v VARCHAR2(4000);
    BEGIN
        l_p := INSTR('&' || p_qs, '&' || p_key || '=');
        IF l_p = 0 THEN RETURN NULL; END IF;
        l_p := l_p + LENGTH(p_key) + 1;
        l_e := INSTR(p_qs || '&', '&', l_p);
        l_v := SUBSTR(p_qs, l_p, l_e - l_p);
        RETURN UTL_URL.UNESCAPE(l_v);
    END;
BEGIN
    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_query, 'cod_empresa');
    PKG_ARTICULOS_LUBRIMEC.SERVIR_IMAGEN(
        p_id_articulo => TO_NUMBER(:id), p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
