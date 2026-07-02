--------------------------------------------------------------------------------
-- Definicion ORDS del endpoint de Ventas Por Articulos (pagina APEX 54).
--
-- Estructura PLANA (ver db/GUIA_ENDPOINTS.md). Solo lectura, sin paquete.
--
--   GET /ords/josegalvez/lubrimec/ventas/articulos
--       ?cod_empresa=24          (opcional, default 24)
--       &search=<texto>          (opcional: descripcion/oem/vendedor/modelo)
--       &fecha=DD/MM/YYYY        (opcional)
--       &semana=NN               (opcional, TO_CHAR WW)
--       &mes=MM                  (opcional)
--       &anio=YYYY               (opcional)
--       &vendedor=<nombre>       (opcional)
--
--   Sin ningun filtro de fecha (fecha/semana/mes/anio) se carga por defecto el
--   ULTIMO DIA con ventas (el dia actual si hoy hubo ventas).
--
--   Optimizacion del select original de la pagina 54: fn_precio_venta y
--   fn_existencia_oem se calculan una vez por articulo (CTEs sobre las filas ya
--   filtradas), no una/dos veces por fila.
--
-- Ejecutar como el esquema JOSEGALVEZ. Requiere PKG_AUTH_LUBRIMEC.
--------------------------------------------------------------------------------

BEGIN
  BEGIN ORDS.DELETE_HANDLER('lubrimec', 'ventas/articulos', 'GET'); EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'lubrimec', p_pattern => 'ventas/articulos',
                         p_priority => 0, p_etag_type => 'HASH', p_comments => NULL);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.DEFINE_HANDLER(
      p_module_name => 'lubrimec',
      p_pattern     => 'ventas/articulos',
      p_method      => 'GET',
      p_source_type => 'plsql/block',
      p_source      => q'~
DECLARE
    l_token       VARCHAR2(256);
    l_usuario     VARCHAR2(255);
    l_pos         PLS_INTEGER;
    l_query       VARCHAR2(4000);
    l_cod_empresa VARCHAR2(20);
    l_search      VARCHAR2(200);
    l_fecha       VARCHAR2(10);
    l_semana      VARCHAR2(2);
    l_mes         VARCHAR2(2);
    l_anio        VARCHAR2(4);
    l_vendedor    VARCHAR2(200);

    FUNCTION get_qs(p_qs IN VARCHAR2, p_key IN VARCHAR2) RETURN VARCHAR2 IS
        l_p PLS_INTEGER;
        l_e PLS_INTEGER;
        l_v VARCHAR2(4000);
    BEGIN
        l_p := INSTR('&' || p_qs, '&' || p_key || '=');
        IF l_p = 0 THEN RETURN NULL; END IF;
        l_p := l_p + LENGTH(p_key) + 1;
        l_e := INSTR(p_qs || '&', '&', l_p);
        l_v := SUBSTR(p_qs, l_p, l_e - l_p);
        l_v := REPLACE(l_v, '+', ' '); -- '+' = espacio (form-encoding), antes de UNESCAPE
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
        IF l_pos > 0 THEN
            l_token := TRIM(SUBSTR(l_token, l_pos + 7));
        END IF;
    END IF;

    l_usuario := PKG_AUTH_LUBRIMEC.VALIDAR_TOKEN(l_token);
    IF l_usuario IS NULL THEN
        OWA_UTIL.STATUS_LINE(401, 'Unauthorized', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Token invalido o expirado');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    l_query       := OWA_UTIL.GET_CGI_ENV('QUERY_STRING');
    l_cod_empresa := NVL(get_qs(l_query, 'cod_empresa'), '24');
    l_search      := get_qs(l_query, 'search');
    l_fecha       := get_qs(l_query, 'fecha');
    l_semana      := get_qs(l_query, 'semana');
    l_mes         := get_qs(l_query, 'mes');
    l_anio        := get_qs(l_query, 'anio');
    l_vendedor    := get_qs(l_query, 'vendedor');

    -- Default: sin filtros de fecha se carga el ultimo dia con ventas
    -- (equivale al dia actual si hoy hubo movimientos).
    IF l_fecha IS NULL AND l_semana IS NULL AND l_mes IS NULL AND l_anio IS NULL THEN
        SELECT TO_CHAR(MAX(fec_comprobante), 'DD/MM/YYYY')
          INTO l_fecha
          FROM ventas_articulos
         WHERE cod_empresa = TO_NUMBER(l_cod_empresa);
    END IF;

    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('success', TRUE);
    APEX_JSON.WRITE('fecha_default', l_fecha);
    APEX_JSON.OPEN_ARRAY('data');

    FOR r IN (
        WITH filtradas AS (
            SELECT va.*
              FROM ventas_articulos va
             WHERE va.cod_empresa = TO_NUMBER(l_cod_empresa)
               AND (l_fecha    IS NULL OR TO_CHAR(va.fec_comprobante, 'DD/MM/YYYY') = l_fecha)
               AND (l_anio     IS NULL OR TO_CHAR(va.fec_comprobante, 'YYYY') = l_anio)
               AND (l_mes      IS NULL OR TO_CHAR(va.fec_comprobante, 'MM') = l_mes)
               AND (l_semana   IS NULL OR TO_CHAR(va.fec_comprobante, 'WW') = l_semana)
               AND (l_vendedor IS NULL OR UPPER(va.vendedor) = UPPER(l_vendedor))
               AND (l_search   IS NULL OR
                    UPPER(va.descripcion || ' ' || va.codigo_oem || ' ' ||
                          va.vendedor || ' ' || va.modelo_vehiculo)
                    LIKE '%' || UPPER(l_search) || '%')
        ),
        precios AS (
            -- fn_precio_venta una sola vez por articulo+empresa
            SELECT f.id_articulo,
                   f.cod_empresa,
                   pkg_ventas.fn_precio_venta(f.cod_empresa, f.id_articulo) precio_venta_actual
              FROM (SELECT DISTINCT id_articulo, cod_empresa FROM filtradas) f
        ),
        existencias AS (
            -- fn_existencia_oem una sola vez por articulo+empresa+oem
            SELECT f.id_articulo,
                   f.cod_empresa,
                   f.codigo_oem,
                   pkg_stock.fn_existencia_oem(NVL(f.codigo_oem, f.id_articulo), f.cod_empresa) existencia
              FROM (SELECT DISTINCT id_articulo, cod_empresa, codigo_oem FROM filtradas) f
        )
        SELECT va.descripcion,
               va.total,
               TO_CHAR(va.fec_comprobante, 'DD/MM/YYYY HH24:MI')                     fec_comprobante,
               TO_CHAR(va.fec_comprobante, 'DD/MM/YYYY')                             fec_comprobante_filtro,
               va.cod_empresa,
               va.costo_ultimo,
               DECODE(va.id_rubro, 30, va.total, va.rentabilidad)                    rentabilidad,
               DECODE(va.id_rubro, 30, 100, va.rentabilidad_porc)                    rentabilidad_porc,
               va.mes_anio,
               va.cantidad,
               va.precio,
               va.total_costo,
               TO_CHAR(va.fec_comprobante, 'YYYY')                                   anio,
               INITCAP(TRIM(TO_CHAR(va.fec_comprobante, 'Month', 'NLS_DATE_LANGUAGE=SPANISH'))) mes,
               TO_CHAR(va.fec_comprobante, 'WW')                                     semana,
               va.vendedor,
               NVL(va.precio_lista, p.precio_venta_actual)                           precio_lista,
               DECODE(va.id_rubro, 30, 0,
                      (p.precio_venta_actual - va.precio) * va.cantidad)             diferencia,
               va.codigo_oem,
               e.existencia,
               va.por_descuento,
               va.id_factura,
               va.nro_telefono,
               fn_porcentaje_comision_bancaria(va.cod_empresa, va.id_factura)        porc_comis_bancario,
               va.modelo_vehiculo
          FROM filtradas va
          JOIN precios p
            ON p.id_articulo = va.id_articulo
           AND p.cod_empresa = va.cod_empresa
          JOIN existencias e
            ON e.id_articulo = va.id_articulo
           AND e.cod_empresa = va.cod_empresa
           AND NVL(e.codigo_oem, '#') = NVL(va.codigo_oem, '#')
         ORDER BY va.fec_comprobante DESC
    ) LOOP
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('descripcion', r.descripcion);
        APEX_JSON.WRITE('total', r.total);
        APEX_JSON.WRITE('fec_comprobante', r.fec_comprobante);
        APEX_JSON.WRITE('fec_comprobante_filtro', r.fec_comprobante_filtro);
        APEX_JSON.WRITE('cod_empresa', r.cod_empresa);
        APEX_JSON.WRITE('costo_ultimo', r.costo_ultimo);
        APEX_JSON.WRITE('rentabilidad', r.rentabilidad);
        APEX_JSON.WRITE('rentabilidad_porc', r.rentabilidad_porc);
        APEX_JSON.WRITE('mes_anio', r.mes_anio);
        APEX_JSON.WRITE('cantidad', r.cantidad);
        APEX_JSON.WRITE('precio', r.precio);
        APEX_JSON.WRITE('total_costo', r.total_costo);
        APEX_JSON.WRITE('anio', r.anio);
        APEX_JSON.WRITE('mes', r.mes);
        APEX_JSON.WRITE('semana', r.semana);
        APEX_JSON.WRITE('vendedor', r.vendedor);
        APEX_JSON.WRITE('precio_lista', r.precio_lista);
        APEX_JSON.WRITE('diferencia', r.diferencia);
        APEX_JSON.WRITE('codigo_oem', r.codigo_oem);
        APEX_JSON.WRITE('existencia', r.existencia);
        APEX_JSON.WRITE('por_descuento', r.por_descuento);
        APEX_JSON.WRITE('id_factura', r.id_factura);
        APEX_JSON.WRITE('nro_telefono', r.nro_telefono);
        APEX_JSON.WRITE('porc_comis_bancario', r.porc_comis_bancario);
        APEX_JSON.WRITE('modelo_vehiculo', r.modelo_vehiculo);
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

    APEX_JSON.CLOSE_ARRAY;
    APEX_JSON.CLOSE_OBJECT;
EXCEPTION
    WHEN OTHERS THEN
        OWA_UTIL.STATUS_LINE(500, 'Internal Server Error', FALSE);
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Error: ' || SQLERRM);
        APEX_JSON.CLOSE_OBJECT;
END;
~');

  ORDS.DEFINE_PARAMETER(
      p_module_name        => 'lubrimec',
      p_pattern            => 'ventas/articulos',
      p_method             => 'GET',
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
