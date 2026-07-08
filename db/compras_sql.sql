--------------------------------------------------------------------------------
-- COMPRAS_CABECERA (pagina APEX 28 grilla + 36 detalle articulos) — paquete +
-- endpoints ORDS. Ejecutar completo como JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--
-- Replica de ventas_sql.sql (pag 60/109) sobre COMPRAS. Solo update/delete de la
-- cabecera + CRUD del detalle de articulos. PK id_factura. Multiempresa.
--
-- Diferencias con ventas: la cabecera de compra referencia un PROVEEDOR (persona)
-- y agrega fec_vencimiento, id_condicion e id_comprador. El detalle
-- (COMPRAS_DETALLE, pag 36) trae ademas el "costo anterior" del articulo para ese
-- proveedor via pkg_compras.fn_costo_ultimo (equivalente al P36_PRECIO_ANTERIOR).
-- No se implementa la carga de foto de factura.
--
-- IMPORTANTE (rutas): base path "compras-cabecera" (igual criterio que
-- ventas-cabecera) para no chocar con plantillas fijas compras/* de otros modulos.
--
-- LISTAR: filtros opcionales fecha_desde/fecha_hasta (YYYY-MM-DD). Sin filtros
-- carga el ULTIMO DIA con compras y lo informa en fecha_default. JOIN a PERSONAS
-- (proveedor) y MONEDAS. total = SUM(cantidad*precio) del detalle.
-- ACTUALIZAR: campos editables de la pagina 28/36 (tip_comprobante,
-- nro_comprobante, fec_comprobante, fec_vencimiento, cod_persona, id_condicion,
-- id_comprador).
-- DETALLE: lineas de COMPRAS_DETALLE (pag 36) con descripcion del articulo,
-- costo_anterior (fn_costo_ultimo) y total = cantidad * precio.
-- GUARDAR_DETALLE (upsert): nro_linea NULL = insertar (nro_linea = MAX+1,
-- cod_iva copiado de ARTICULOS, cod_persona/cod_empresa de la cabecera); con
-- nro_linea = actualizar la linea.
-- ELIMINAR_DETALLE: borra una linea por (id_factura, nro_linea).
--
-- === 1) PAQUETE PKG_COMPRAS_LUBRIMEC =======================================
--------------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE PKG_COMPRAS_LUBRIMEC AS

  PROCEDURE LISTAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_anio IN NUMBER, p_mes IN NUMBER);
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_ser_timbrado IN VARCHAR2,
      p_nro_timbrado IN NUMBER, p_nro_comprobante IN NUMBER,
      p_fec_comprobante IN VARCHAR2, p_fec_vencimiento IN VARCHAR2,
      p_cod_persona IN NUMBER, p_id_condicion IN NUMBER, p_id_comprador IN NUMBER,
      p_cod_moneda IN NUMBER, p_tip_cambio IN NUMBER, p_costo_delivery IN NUMBER);
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_nro_comprobante IN NUMBER,
      p_fec_comprobante IN VARCHAR2, p_fec_vencimiento IN VARCHAR2,
      p_cod_persona IN NUMBER, p_id_condicion IN NUMBER, p_id_comprador IN NUMBER);
  -- Helpers para el alta (DAs de la pag 29): siguiente nro de comprobante por
  -- tip+serie del proveedor, y timbrado sugerido del ultimo comprobante del prov.
  PROCEDURE SUGERIDOS_ALTA(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_cod_persona IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_ser_timbrado IN VARCHAR2);
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER);
  PROCEDURE DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER);
  PROCEDURE GUARDAR_DETALLE(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER,
      p_id_articulo IN NUMBER, p_cantidad IN NUMBER, p_precio IN NUMBER,
      p_cod_iva IN NUMBER);
  PROCEDURE ELIMINAR_DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER);
  -- Resuelve el articulo por el codigo del proveedor (DA recupera_codigo pag 36):
  -- devuelve id_articulo, descripcion, cod_iva y costo_anterior del proveedor de la
  -- factura. p_id_cod_proveedor = codigo del articulo segun el proveedor.
  PROCEDURE RESOLVER_COD_PROVEEDOR(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_id_cod_proveedor IN VARCHAR2);
  -- LOVs propios del modulo de compras (no se comparten con otras paginas):
  -- selector de proveedor (alta/edicion cabecera) y de articulo (detalle pag 36).
  PROCEDURE BUSCAR_PROVEEDORES(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_q IN VARCHAR2);
  PROCEDURE BUSCAR_ARTICULOS(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_q IN VARCHAR2);

END PKG_COMPRAS_LUBRIMEC;
/

CREATE OR REPLACE PACKAGE BODY PKG_COMPRAS_LUBRIMEC AS

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
  PROCEDURE LISTAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_anio IN NUMBER, p_mes IN NUMBER) IS
    l_usuario VARCHAR2(255);
    -- anio/mes NULL o 0 = "Todos" (no filtra esa dimension): sin filtros trae
    -- TODOS los comprobantes; con anio y/o mes acota.
    l_anio    NUMBER := NULLIF(p_anio, 0);
    l_mes     NUMBER := NULLIF(p_mes, 0);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('anio', NVL(l_anio, 0));
    APEX_JSON.WRITE('mes', NVL(l_mes, 0));
    -- Anios con compras (para el filtro del front)
    APEX_JSON.OPEN_ARRAY('anios');
    FOR a IN (
        SELECT DISTINCT EXTRACT(YEAR FROM fec_comprobante) anio
          FROM compras_cabecera
         WHERE cod_empresa = p_cod_empresa
         ORDER BY 1 DESC
    ) LOOP
      APEX_JSON.WRITE(a.anio);
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT b.id_factura, b.tip_comprobante, b.ser_timbrado, b.nro_timbrado,
               b.nro_comprobante,
               TO_CHAR(b.fec_comprobante, 'YYYY-MM-DD') fec_comprobante,
               TO_CHAR(b.fec_vencimiento, 'YYYY-MM-DD') fec_vencimiento,
               b.cod_persona,
               NVL(pe.nombre_fantasia, pe.nombre) AS nombre_proveedor,
               b.cod_moneda, mo.descripcion AS desc_moneda, b.tip_cambio,
               b.id_condicion, b.id_comprador,
               (SELECT SUM(NVL(d.cantidad, 0) * NVL(d.precio, 0))
                  FROM compras_detalle d
                 WHERE d.id_factura = b.id_factura) AS total
          FROM compras_cabecera b
          LEFT JOIN personas pe ON pe.cod_persona = b.cod_persona
                                AND pe.cod_empresa = b.cod_empresa
          LEFT JOIN monedas mo ON mo.cod_moneda = b.cod_moneda
         WHERE b.cod_empresa = p_cod_empresa
           AND (l_anio IS NULL OR EXTRACT(YEAR FROM b.fec_comprobante) = l_anio)
           AND (l_mes IS NULL OR EXTRACT(MONTH FROM b.fec_comprobante) = l_mes)
         ORDER BY b.id_factura DESC
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_factura', r.id_factura);
      APEX_JSON.WRITE('tip_comprobante', r.tip_comprobante);
      APEX_JSON.WRITE('ser_timbrado', r.ser_timbrado);
      APEX_JSON.WRITE('nro_timbrado', r.nro_timbrado);
      APEX_JSON.WRITE('nro_comprobante', r.nro_comprobante);
      APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
      APEX_JSON.WRITE('fec_vencimiento', r.fec_vencimiento);
      APEX_JSON.WRITE('cod_persona', r.cod_persona);
      APEX_JSON.WRITE('nombre_proveedor', r.nombre_proveedor);
      APEX_JSON.WRITE('cod_moneda', r.cod_moneda);
      APEX_JSON.WRITE('desc_moneda', r.desc_moneda);
      APEX_JSON.WRITE('tip_cambio', r.tip_cambio);
      APEX_JSON.WRITE('id_condicion', r.id_condicion);
      APEX_JSON.WRITE('id_comprador', r.id_comprador);
      APEX_JSON.WRITE('total', r.total);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END LISTAR;

  --------------------------------------------------------------------------
  -- INSERTAR (alta de cabecera, pagina 29). id_factura = fn del sistema.
  -- Defaults del APEX: cod_moneda=1, tip_cambio=1, estado 'A'.
  --------------------------------------------------------------------------
  PROCEDURE INSERTAR(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_ser_timbrado IN VARCHAR2,
      p_nro_timbrado IN NUMBER, p_nro_comprobante IN NUMBER,
      p_fec_comprobante IN VARCHAR2, p_fec_vencimiento IN VARCHAR2,
      p_cod_persona IN NUMBER, p_id_condicion IN NUMBER, p_id_comprador IN NUMBER,
      p_cod_moneda IN NUMBER, p_tip_cambio IN NUMBER, p_costo_delivery IN NUMBER) IS
    l_usuario    VARCHAR2(255);
    l_id_factura NUMBER;
    l_fecha      DATE;
    l_venc       DATE := NULL;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_tip_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'El tipo de comprobante es obligatorio'); RETURN;
    END IF;
    IF p_ser_timbrado IS NULL THEN
      p_error(400, 'Bad Request', 'La serie del timbrado es obligatoria'); RETURN;
    END IF;
    IF p_nro_timbrado IS NULL THEN
      p_error(400, 'Bad Request', 'El nro de timbrado es obligatorio'); RETURN;
    END IF;
    IF p_nro_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'El nro de comprobante es obligatorio'); RETURN;
    END IF;
    IF p_fec_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'La fecha es obligatoria'); RETURN;
    END IF;
    IF p_cod_persona IS NULL THEN
      p_error(400, 'Bad Request', 'El proveedor es obligatorio'); RETURN;
    END IF;
    IF p_id_condicion IS NULL THEN
      p_error(400, 'Bad Request', 'La condicion es obligatoria'); RETURN;
    END IF;
    IF NVL(p_cod_moneda, 0) = 0 THEN
      p_error(400, 'Bad Request', 'La moneda es obligatoria'); RETURN;
    END IF;
    IF p_tip_cambio IS NULL THEN
      p_error(400, 'Bad Request', 'El tipo de cambio es obligatorio'); RETURN;
    END IF;
    l_fecha := TO_DATE(p_fec_comprobante, 'YYYY-MM-DD');
    IF p_fec_vencimiento IS NOT NULL THEN
      l_venc := TO_DATE(p_fec_vencimiento, 'YYYY-MM-DD');
    END IF;

    l_id_factura := PKG_VENTAS.FN_ID_FACTURA();

    INSERT INTO compras_cabecera (
        id_factura, tip_comprobante, ser_timbrado, nro_timbrado, nro_comprobante,
        fec_comprobante, fec_vencimiento, cod_persona, id_condicion, id_comprador,
        cod_moneda, tip_cambio, costo_delivery, cod_empresa)
    VALUES (
        l_id_factura, p_tip_comprobante, p_ser_timbrado, p_nro_timbrado, p_nro_comprobante,
        l_fecha, l_venc, p_cod_persona, p_id_condicion, p_id_comprador,
        NVL(p_cod_moneda, 1), NVL(p_tip_cambio, 1), p_costo_delivery, p_cod_empresa);

    COMMIT;

    OWA_UTIL.STATUS_LINE(201, 'Created', FALSE);
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Compra creada');
    APEX_JSON.WRITE('id_factura', l_id_factura);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Proveedor, condicion o comprador inexistente');
      ELSIF SQLCODE = -1 THEN
        p_error(409, 'Conflict', 'Ya existe una compra con esa serie/nro/fecha');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END INSERTAR;

  --------------------------------------------------------------------------
  -- SUGERIDOS_ALTA (DAs de la pag 29): siguiente nro de comprobante por
  -- tip+serie del proveedor y timbrado sugerido (ultimo del proveedor).
  --------------------------------------------------------------------------
  PROCEDURE SUGERIDOS_ALTA(
      p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_cod_persona IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_ser_timbrado IN VARCHAR2) IS
    l_usuario   VARCHAR2(255);
    l_nro       NUMBER := NULL;
    l_timbrado  NUMBER := NULL;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    -- Siguiente nro de comprobante (replica el DA NRO_REC de la pag 29)
    IF p_tip_comprobante IS NOT NULL AND p_ser_timbrado IS NOT NULL THEN
      BEGIN
        SELECT MIN(p.nro_comprobante)
          INTO l_nro
          FROM compras_cabecera p
         WHERE (NVL(p.nro_comprobante, 0) + 1) NOT IN
               (SELECT p1.nro_comprobante FROM compras_cabecera p1
                 WHERE p1.cod_empresa = p.cod_empresa
                   AND p1.tip_comprobante = p.tip_comprobante
                   AND p1.ser_timbrado = p.ser_timbrado)
           AND p.cod_empresa = p_cod_empresa
           AND p.tip_comprobante = p_tip_comprobante
           AND p.ser_timbrado = p_ser_timbrado;
      EXCEPTION WHEN OTHERS THEN l_nro := NULL; END;
      l_nro := NVL(l_nro, 0) + 1;
    END IF;

    -- Timbrado sugerido (DA Nuevo_1: ultimo timbrado del proveedor)
    IF p_cod_persona IS NOT NULL THEN
      BEGIN
        SELECT DISTINCT a.nro_timbrado
          INTO l_timbrado
          FROM compras_cabecera a
         WHERE a.cod_persona = p_cod_persona
           AND a.fec_comprobante = (SELECT MAX(fec_comprobante)
                                      FROM compras_cabecera
                                     WHERE cod_persona = a.cod_persona
                                       AND cod_empresa = a.cod_empresa)
           AND a.cod_empresa = p_cod_empresa
           AND ROWNUM = 1;
      EXCEPTION WHEN OTHERS THEN l_timbrado := NULL; END;
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('nro_comprobante', l_nro);
    APEX_JSON.WRITE('nro_timbrado', l_timbrado);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END SUGERIDOS_ALTA;

  --------------------------------------------------------------------------
  -- ACTUALIZAR (campos editables de la pagina 28/36)
  --------------------------------------------------------------------------
  PROCEDURE ACTUALIZAR(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER,
      p_tip_comprobante IN VARCHAR2, p_nro_comprobante IN NUMBER,
      p_fec_comprobante IN VARCHAR2, p_fec_vencimiento IN VARCHAR2,
      p_cod_persona IN NUMBER, p_id_condicion IN NUMBER, p_id_comprador IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_fecha   DATE;
    l_venc    DATE := NULL;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_tip_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'El tipo de comprobante es obligatorio'); RETURN;
    END IF;
    IF p_nro_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'El nro de comprobante es obligatorio'); RETURN;
    END IF;
    IF p_fec_comprobante IS NULL THEN
      p_error(400, 'Bad Request', 'La fecha es obligatoria'); RETURN;
    END IF;
    IF p_cod_persona IS NULL THEN
      p_error(400, 'Bad Request', 'El proveedor es obligatorio'); RETURN;
    END IF;
    l_fecha := TO_DATE(p_fec_comprobante, 'YYYY-MM-DD');
    IF p_fec_vencimiento IS NOT NULL THEN
      l_venc := TO_DATE(p_fec_vencimiento, 'YYYY-MM-DD');
    END IF;

    UPDATE compras_cabecera
       SET tip_comprobante = p_tip_comprobante,
           nro_comprobante = p_nro_comprobante,
           fec_comprobante = l_fecha,
           fec_vencimiento = l_venc,
           cod_persona     = p_cod_persona,
           id_condicion    = p_id_condicion,
           id_comprador    = p_id_comprador
     WHERE id_factura = p_id_factura
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Compra no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Compra actualizada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Proveedor, condicion o comprador inexistente');
      ELSIF SQLCODE = -1 THEN
        p_error(409, 'Conflict', 'Ya existe una compra con esa serie/nro/fecha');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ACTUALIZAR;

  --------------------------------------------------------------------------
  -- ELIMINAR
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_cod_empresa IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM compras_cabecera
     WHERE id_factura = p_id_factura
       AND cod_empresa = p_cod_empresa;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Compra no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Compra eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2292 THEN
        p_error(409, 'Conflict', 'No se puede eliminar: la compra tiene detalle asociado');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END ELIMINAR;

  --------------------------------------------------------------------------
  -- DETALLE (articulos de la factura, pagina 36)
  --------------------------------------------------------------------------
  PROCEDURE DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER) IS
    l_usuario VARCHAR2(255);
    l_cod_persona compras_cabecera.cod_persona%TYPE;
    l_cod_empresa compras_cabecera.cod_empresa%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT cod_persona, cod_empresa
        INTO l_cod_persona, l_cod_empresa
        FROM compras_cabecera
       WHERE id_factura = p_id_factura;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      l_cod_persona := NULL; l_cod_empresa := NULL;
    END;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_ARRAY('data');
    FOR r IN (
        SELECT d.nro_linea, d.id_articulo,
               ar.descripcion AS descripcion_articulo,
               d.cantidad, d.precio, d.cod_iva,
               pkg_compras.fn_costo_ultimo(d.id_articulo, l_cod_empresa, l_cod_persona) AS costo_anterior,
               NVL(d.cantidad, 0) * NVL(d.precio, 0) AS total
          FROM compras_detalle d
          LEFT JOIN articulos ar ON ar.id_articulo = d.id_articulo
         WHERE d.id_factura = p_id_factura
         ORDER BY d.nro_linea
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('nro_linea', r.nro_linea);
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion_articulo', r.descripcion_articulo);
      APEX_JSON.WRITE('cantidad', r.cantidad);
      APEX_JSON.WRITE('precio', r.precio);
      APEX_JSON.WRITE('cod_iva', r.cod_iva);
      APEX_JSON.WRITE('costo_anterior', r.costo_anterior);
      APEX_JSON.WRITE('total', r.total);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END DETALLE;

  --------------------------------------------------------------------------
  -- GUARDAR_DETALLE (upsert de linea). nro_linea NULL = insertar con
  -- MAX(nro_linea)+1, cod_iva del articulo y cod_persona/cod_empresa de la
  -- cabecera (como el proceso NATIVE_FORM_DML de la pag 36).
  --------------------------------------------------------------------------
  PROCEDURE GUARDAR_DETALLE(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER,
      p_id_articulo IN NUMBER, p_cantidad IN NUMBER, p_precio IN NUMBER,
      p_cod_iva IN NUMBER) IS
    l_usuario   VARCHAR2(255);
    l_nro_linea compras_detalle.nro_linea%TYPE := p_nro_linea;
    l_cod_iva   articulos.cod_iva%TYPE;
    l_cod_persona compras_cabecera.cod_persona%TYPE;
    l_cod_empresa compras_cabecera.cod_empresa%TYPE;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    IF p_id_factura IS NULL THEN
      p_error(400, 'Bad Request', 'La factura es obligatoria'); RETURN;
    END IF;
    IF p_id_articulo IS NULL THEN
      p_error(400, 'Bad Request', 'El articulo es obligatorio'); RETURN;
    END IF;
    IF p_cantidad IS NULL THEN
      p_error(400, 'Bad Request', 'La cantidad es obligatoria'); RETURN;
    END IF;
    IF p_precio IS NULL THEN
      p_error(400, 'Bad Request', 'El precio es obligatorio'); RETURN;
    END IF;

    BEGIN
      SELECT cod_persona, cod_empresa
        INTO l_cod_persona, l_cod_empresa
        FROM compras_cabecera
       WHERE id_factura = p_id_factura;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      p_error(404, 'Not Found', 'Compra no encontrada');
      RETURN;
    END;

    -- IVA: usa el enviado (el modal lo autocarga del articulo y permite override);
    -- si no viene, lo copia del articulo (equivale al DA carga_iva de la pag 36).
    IF p_cod_iva IS NOT NULL THEN
      l_cod_iva := p_cod_iva;
    ELSE
      BEGIN
        SELECT cod_iva INTO l_cod_iva FROM articulos WHERE id_articulo = p_id_articulo;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        p_error(400, 'Bad Request', 'El articulo no existe');
        RETURN;
      END;
    END IF;

    IF l_nro_linea IS NULL THEN
      SELECT NVL(MAX(nro_linea), 0) + 1
        INTO l_nro_linea
        FROM compras_detalle
       WHERE id_factura = p_id_factura;

      INSERT INTO compras_detalle (
          id_factura, nro_linea, id_articulo, cantidad, precio, cod_iva,
          cod_empresa, cod_persona)
      VALUES (
          p_id_factura, l_nro_linea, p_id_articulo, p_cantidad, p_precio,
          l_cod_iva, l_cod_empresa, l_cod_persona);
    ELSE
      UPDATE compras_detalle
         SET id_articulo = p_id_articulo,
             cantidad    = p_cantidad,
             precio      = p_precio,
             cod_iva     = l_cod_iva
       WHERE id_factura = p_id_factura
         AND nro_linea  = p_nro_linea;

      IF SQL%ROWCOUNT = 0 THEN
        ROLLBACK;
        p_error(404, 'Not Found', 'Linea no encontrada');
        RETURN;
      END IF;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Linea guardada');
    APEX_JSON.WRITE('nro_linea', l_nro_linea);
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      IF SQLCODE = -2291 THEN
        p_error(400, 'Bad Request', 'Factura o articulo inexistente');
      ELSE
        p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
      END IF;
  END GUARDAR_DETALLE;

  --------------------------------------------------------------------------
  -- ELIMINAR_DETALLE
  --------------------------------------------------------------------------
  PROCEDURE ELIMINAR_DETALLE(p_token IN VARCHAR2, p_id_factura IN NUMBER, p_nro_linea IN NUMBER) IS
    l_usuario VARCHAR2(255);
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    DELETE FROM compras_detalle
     WHERE id_factura = p_id_factura
       AND nro_linea  = p_nro_linea;

    IF SQL%ROWCOUNT = 0 THEN
      ROLLBACK;
      p_error(404, 'Not Found', 'Linea no encontrada');
      RETURN;
    END IF;
    COMMIT;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('message', 'Linea eliminada');
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END ELIMINAR_DETALLE;

  --------------------------------------------------------------------------
  -- RESOLVER_COD_PROVEEDOR (DA recupera_codigo pag 36): dado el codigo del
  -- articulo segun el proveedor, resuelve el articulo (id, descripcion, iva)
  -- y su costo anterior para el proveedor de la factura.
  --------------------------------------------------------------------------
  PROCEDURE RESOLVER_COD_PROVEEDOR(
      p_token IN VARCHAR2, p_id_factura IN NUMBER, p_id_cod_proveedor IN VARCHAR2) IS
    l_usuario     VARCHAR2(255);
    l_cod_persona compras_cabecera.cod_persona%TYPE;
    l_cod_empresa compras_cabecera.cod_empresa%TYPE;
    l_id_articulo articulos.id_articulo%TYPE;
    l_descripcion articulos.descripcion%TYPE;
    l_cod_iva     articulos.cod_iva%TYPE;
    l_costo       NUMBER;
  BEGIN
    l_usuario := f_usuario(p_token);
    IF l_usuario IS NULL THEN
      p_error(401, 'Unauthorized', 'Token invalido o expirado');
      RETURN;
    END IF;

    BEGIN
      SELECT cod_persona, cod_empresa
        INTO l_cod_persona, l_cod_empresa
        FROM compras_cabecera
       WHERE id_factura = p_id_factura;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      p_error(404, 'Not Found', 'Compra no encontrada');
      RETURN;
    END;

    BEGIN
      SELECT id_articulo
        INTO l_id_articulo
        FROM articulos_proveedores
       WHERE cod_empresa = l_cod_empresa
         AND cod_persona = l_cod_persona
         AND id_cod_proveedor = p_id_cod_proveedor;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      -- Sin match: responde data null (el front no cambia el articulo)
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('success', TRUE);
      APEX_JSON.WRITE('data', TO_CHAR(NULL));
      APEX_JSON.CLOSE_OBJECT;
      RETURN;
    END;

    BEGIN
      SELECT descripcion, cod_iva INTO l_descripcion, l_cod_iva
        FROM articulos WHERE id_articulo = l_id_articulo;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      l_descripcion := NULL; l_cod_iva := NULL;
    END;

    l_costo := pkg_compras.fn_costo_ultimo(l_id_articulo, l_cod_empresa, l_cod_persona);

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.OPEN_OBJECT('data');
    APEX_JSON.WRITE('id_articulo', l_id_articulo);
    APEX_JSON.WRITE('descripcion_articulo', l_descripcion);
    APEX_JSON.WRITE('cod_iva', l_cod_iva);
    APEX_JSON.WRITE('costo_anterior', l_costo);
    APEX_JSON.CLOSE_OBJECT;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END RESOLVER_COD_PROVEEDOR;

  --------------------------------------------------------------------------
  -- BUSCAR_PROVEEDORES (LOV propio de compras). Personas P/A de la empresa;
  -- q vacio = lista COMPLETA (el front filtra localmente: nombre sin distinguir
  -- mayusculas, RUC/CI con o sin guion). Con q filtra en la BD (compatibilidad).
  --------------------------------------------------------------------------
  PROCEDURE BUSCAR_PROVEEDORES(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_q IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_q       VARCHAR2(400) := '%' || UPPER(TRIM(p_q)) || '%';
    l_qn      VARCHAR2(400) := '%' || REPLACE(REPLACE(UPPER(TRIM(p_q)), '-'), ' ') || '%';
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
        SELECT cod_persona,
               NVL(nombre_fantasia, nombre) AS nombre,
               nro_ruc, nro_ci
          FROM personas
         WHERE cod_empresa = p_cod_empresa
           AND NVL(ind_cliente_proveedor, '-') IN ('P', 'A')
           AND (
                 TRIM(p_q) IS NULL
                 OR UPPER(nombre) LIKE l_q
                 OR UPPER(nombre_fantasia) LIKE l_q
                 OR REPLACE(REPLACE(UPPER(nro_ruc), '-'), ' ') LIKE l_qn
                 OR REPLACE(REPLACE(UPPER(nro_ci), '-'), ' ') LIKE l_qn
                 OR TO_CHAR(cod_persona) LIKE l_q
               )
         ORDER BY NVL(nombre_fantasia, nombre)
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('cod_persona', r.cod_persona);
      APEX_JSON.WRITE('nombre', r.nombre);
      APEX_JSON.WRITE('nro_ruc', r.nro_ruc);
      APEX_JSON.WRITE('nro_ci', r.nro_ci);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END BUSCAR_PROVEEDORES;

  --------------------------------------------------------------------------
  -- BUSCAR_ARTICULOS (LOV propio del detalle pag 36). Incluye cod_iva para
  -- el DA carga_iva del modal de linea. q vacio = primeras 30.
  --------------------------------------------------------------------------
  PROCEDURE BUSCAR_ARTICULOS(p_token IN VARCHAR2, p_cod_empresa IN NUMBER, p_q IN VARCHAR2) IS
    l_usuario VARCHAR2(255);
    l_q       VARCHAR2(400) := '%' || UPPER(TRIM(p_q)) || '%';
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
        SELECT id_articulo, descripcion, codigo_oem, cod_iva
          FROM articulos
         WHERE cod_empresa = p_cod_empresa
           AND NVL(es_activo, 'S') = 'S'
           AND (
                 TRIM(p_q) IS NULL
                 OR UPPER(descripcion) LIKE l_q
                 OR UPPER(codigo_oem) LIKE l_q
                 OR TO_CHAR(id_articulo) LIKE l_q
               )
         ORDER BY descripcion
         FETCH FIRST 30 ROWS ONLY
    ) LOOP
      APEX_JSON.OPEN_OBJECT;
      APEX_JSON.WRITE('id_articulo', r.id_articulo);
      APEX_JSON.WRITE('descripcion', r.descripcion);
      APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
      APEX_JSON.WRITE('cod_iva', r.cod_iva);
      APEX_JSON.CLOSE_OBJECT;
    END LOOP;
    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
  EXCEPTION
    WHEN OTHERS THEN
      p_error(500, 'Internal Server Error', 'Error: ' || SQLERRM);
  END BUSCAR_ARTICULOS;

END PKG_COMPRAS_LUBRIMEC;
/

--------------------------------------------------------------------------------
-- === 2) ENDPOINTS ORDS =====================================================
--
--   GET    /lubrimec/compras-cabecera?cod_empresa=:n[&fecha_desde&fecha_hasta]
--   GET    /lubrimec/compras-cabecera/buscar-proveedores?cod_empresa=:n&q=:q
--   GET    /lubrimec/compras-cabecera/buscar-articulos?cod_empresa=:n&q=:q
--   PUT    /lubrimec/compras-cabecera/:id            -> actualizar
--   DELETE /lubrimec/compras-cabecera/:id?cod_empresa=:n -> eliminar
--   GET    /lubrimec/compras-cabecera/:id/detalle    -> articulos de la factura
--   POST   /lubrimec/compras-cabecera/:id/detalle    -> guardar linea (upsert)
--   DELETE /lubrimec/compras-cabecera/:id/detalle/:nro -> eliminar linea
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera', 'GET');             EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/:id', 'PUT');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/:id', 'DELETE');      EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/:id/detalle', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/:id/detalle', 'POST');        EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/:id/detalle/:nro', 'DELETE'); EXCEPTION WHEN OTHERS THEN NULL; END;

  ----------------------------------------------------------------------------
  -- /compras-cabecera  (GET listar)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
    l_anio VARCHAR2(10); l_mes VARCHAR2(10);
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
    HTP.P('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_anio        := get_qs(l_qs, 'anio');
    l_mes         := get_qs(l_qs, 'mes');
    PKG_COMPRAS_LUBRIMEC.LISTAR(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa),
        p_anio => TO_NUMBER(l_anio), p_mes => TO_NUMBER(l_mes));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  -- /compras-cabecera  (POST insertar cabecera, pag 29)
  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera', p_method => 'POST',
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
    PKG_COMPRAS_LUBRIMEC.INSERTAR(
        p_token => l_token, p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_tip_comprobante => :tip_comprobante,
        p_ser_timbrado => :ser_timbrado,
        p_nro_timbrado => TO_NUMBER(:nro_timbrado),
        p_nro_comprobante => TO_NUMBER(:nro_comprobante),
        p_fec_comprobante => :fec_comprobante,
        p_fec_vencimiento => :fec_vencimiento,
        p_cod_persona => TO_NUMBER(:cod_persona),
        p_id_condicion => TO_NUMBER(:id_condicion),
        p_id_comprador => TO_NUMBER(:id_comprador),
        p_cod_moneda => TO_NUMBER(:cod_moneda),
        p_tip_cambio => TO_NUMBER(:tip_cambio),
        p_costo_delivery => TO_NUMBER(:costo_delivery));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/sugeridos-alta  (GET: siguiente nro + timbrado sugerido)
  ----------------------------------------------------------------------------
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/sugeridos-alta', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/sugeridos-alta',
        p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/sugeridos-alta', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20); l_cod_persona VARCHAR2(20);
    l_tip VARCHAR2(10); l_ser VARCHAR2(20);
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
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_cod_persona := get_qs(l_qs, 'cod_persona');
    l_tip         := get_qs(l_qs, 'tip_comprobante');
    l_ser         := get_qs(l_qs, 'ser_timbrado');
    PKG_COMPRAS_LUBRIMEC.SUGERIDOS_ALTA(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa),
        p_cod_persona => TO_NUMBER(l_cod_persona),
        p_tip_comprobante => l_tip, p_ser_timbrado => l_ser);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/sugeridos-alta', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/buscar-proveedores  (GET: LOV de proveedores de compras)
  ----------------------------------------------------------------------------
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/buscar-proveedores', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/buscar-proveedores',
        p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/buscar-proveedores', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20); l_q VARCHAR2(4000);
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
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_q           := get_qs(l_qs, 'q');
    PKG_COMPRAS_LUBRIMEC.BUSCAR_PROVEEDORES(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa), p_q => l_q);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/buscar-proveedores', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/buscar-articulos  (GET: LOV de articulos del detalle)
  ----------------------------------------------------------------------------
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/buscar-articulos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/buscar-articulos',
        p_priority => 1, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/buscar-articulos', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20); l_q VARCHAR2(4000);
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
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    l_q           := get_qs(l_qs, 'q');
    PKG_COMPRAS_LUBRIMEC.BUSCAR_ARTICULOS(
        p_token => l_token, p_cod_empresa => TO_NUMBER(l_cod_empresa), p_q => l_q);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/buscar-articulos', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/:id  (PUT actualizar, DELETE eliminar)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id', p_method => 'PUT',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_COMPRAS_LUBRIMEC.ACTUALIZAR(
        p_token => l_token, p_id_factura => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(:cod_empresa),
        p_tip_comprobante => :tip_comprobante,
        p_nro_comprobante => TO_NUMBER(:nro_comprobante),
        p_fec_comprobante => :fec_comprobante,
        p_fec_vencimiento => :fec_vencimiento,
        p_cod_persona => TO_NUMBER(:cod_persona),
        p_id_condicion => TO_NUMBER(:id_condicion),
        p_id_comprador => TO_NUMBER(:id_comprador));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id', p_method => 'PUT',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_empresa VARCHAR2(20);
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
    HTP.P('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    l_qs := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := get_qs(l_qs, 'cod_empresa');
    PKG_COMPRAS_LUBRIMEC.ELIMINAR(
        p_token => l_token, p_id_factura => TO_NUMBER(:id),
        p_cod_empresa => TO_NUMBER(l_cod_empresa));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/:id/detalle  (GET articulos, POST guardar linea)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_COMPRAS_LUBRIMEC.DETALLE(p_token => l_token, p_id_factura => TO_NUMBER(:id));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle', p_method => 'POST',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_COMPRAS_LUBRIMEC.GUARDAR_DETALLE(
        p_token => l_token, p_id_factura => TO_NUMBER(:id),
        p_nro_linea => TO_NUMBER(:nro_linea),
        p_id_articulo => TO_NUMBER(:id_articulo),
        p_cantidad => TO_NUMBER(:cantidad),
        p_precio => TO_NUMBER(:precio),
        p_cod_iva => TO_NUMBER(:cod_iva));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle', p_method => 'POST',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/:id/detalle/:nro  (DELETE eliminar linea)
  ----------------------------------------------------------------------------
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle/:nro',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle/:nro', p_method => 'DELETE',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE l_token VARCHAR2(256); l_pos PLS_INTEGER;
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', FALSE);
    HTP.P('Access-Control-Allow-Origin: *');
    HTP.P('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    HTP.P('Access-Control-Allow-Headers: Authorization, Content-Type');
    OWA_UTIL.HTTP_HEADER_CLOSE;
    l_token := :authorization;
    IF l_token IS NOT NULL THEN
        l_pos := INSTR(UPPER(l_token), 'BEARER ');
        IF l_pos > 0 THEN l_token := TRIM(SUBSTR(l_token, l_pos + 7)); END IF;
    END IF;
    PKG_COMPRAS_LUBRIMEC.ELIMINAR_DETALLE(
        p_token => l_token, p_id_factura => TO_NUMBER(:id), p_nro_linea => TO_NUMBER(:nro));
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/detalle/:nro', p_method => 'DELETE',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  ----------------------------------------------------------------------------
  -- /compras-cabecera/:id/resolver-cod-proveedor?cod_prov=  (GET)
  -- Resuelve el articulo por el codigo del proveedor (DA recupera_codigo pag 36)
  ----------------------------------------------------------------------------
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'compras-cabecera/:id/resolver-cod-proveedor', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/resolver-cod-proveedor',
        p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/resolver-cod-proveedor', p_method => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token VARCHAR2(256); l_pos PLS_INTEGER;
    l_qs VARCHAR2(4000); l_cod_prov VARCHAR2(500);
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
    l_cod_prov := get_qs(l_qs, 'cod_prov');
    PKG_COMPRAS_LUBRIMEC.RESOLVER_COD_PROVEEDOR(
        p_token => l_token, p_id_factura => TO_NUMBER(:id), p_id_cod_proveedor => l_cod_prov);
END;
~');
  ORDS.DEFINE_PARAMETER(p_module_name => 'lubrimec', p_pattern => 'compras-cabecera/:id/resolver-cod-proveedor', p_method => 'GET',
      p_name => 'Authorization', p_bind_variable_name => 'authorization',
      p_source_type => 'HEADER', p_param_type => 'STRING', p_access_method => 'IN');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
