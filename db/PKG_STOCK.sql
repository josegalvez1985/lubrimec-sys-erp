--------------------------------------------------------------------------------
-- PKG_STOCK — COPIA DE REFERENCIA del body que esta en la BD (exportado de
-- USER_SOURCE el 2026-10-01). Lo usan muchos paquetes del front para el stock.
-- No es parte del despliegue: NO hace falta ejecutarlo. Si se cambia en la BD,
-- volver a exportarlo aca. El spec (PACKAGE "PKG_STOCK") no esta incluido.
--
-- Cual usar:
--   fn_existencia(id_articulo, cod_empresa)   -> stock DE UN ARTICULO, desde
--       V_FICHA_EXISTENCIA. La usan Articulos (pag 4), Consulta de Precios, Precios
--       Mayoristas e Inventario.
--   fn_existencia_oem(codigo_oem, cod_empresa) -> stock de TODOS los articulos con
--       ese codigo_oem (o del id si no tiene OEM), calculado como compras - ventas
--       sin rubros 30/39. Suma todo el OEM y sale de OTRA fuente que fn_existencia,
--       asi que los dos pueden no coincidir (ej. art 1116: 0 por articulo, 1 por OEM).
--       La usa Ventas por Articulos (pag 54); pasarla a fn_existencia la rompio.
--   FN_EXISTENCIA_FECHA(cod_empresa, id_articulo, fecha) -> stock a una fecha.
--------------------------------------------------------------------------------

create or replace package body "PKG_STOCK" as

    -- -------------------------------------------------------------------------
    -- fn_existencia - SIN CAMBIOS
    -- -------------------------------------------------------------------------
    FUNCTION fn_existencia (pid_articulo number,
                            pcod_empresa number)
    RETURN NUMBER IS
        vExistencia NUMBER;
    BEGIN
        SELECT SUM(NVL(cantidad, 0))
          INTO vExistencia
          FROM V_FICHA_EXISTENCIA
         WHERE id_articulo = pid_articulo
           AND cod_empresa = pcod_empresa;
        RETURN NVL(vExistencia, 0);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN 0;
        WHEN OTHERS THEN
            RAISE_APPLICATION_ERROR(-20001,
                'Error fn_existencia art=' || pid_articulo || ' ' || SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- FN_EXISTENCIA_FECHA - SIN CAMBIOS
    -- -------------------------------------------------------------------------
    FUNCTION FN_EXISTENCIA_FECHA (p_cod_empresa number,
                                  p_id_articulo number,
                                  p_fecha       date)
    RETURN number IS
        vExistencia number;
    BEGIN
        SELECT SUM(cantidad)
          INTO vExistencia
          FROM V_FICHA_EXISTENCIA
         WHERE cod_empresa      = p_cod_empresa
           AND id_articulo      = p_id_articulo
           AND fec_comprobante <= p_fecha;
        RETURN NVL(vExistencia, 0);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN 0;
        WHEN OTHERS THEN        RETURN 0;
    END;

    -- -------------------------------------------------------------------------
    -- fn_existencia_oem - OPTIMIZADA
    -- Separa los dos casos (con y sin codigo_oem) para permitir uso de indices
    -- en lugar de NVL(codigo_oem, id_articulo) que hace full scan siempre
    -- -------------------------------------------------------------------------
    FUNCTION fn_existencia_oem (pcod_oem     varchar2,
                                pcod_empresa number)
    RETURN NUMBER IS
        vExistencia NUMBER;
    BEGIN
        -- Busca primero por codigo_oem directo; si no existe, busca por id_articulo
        -- Esto evita NVL en el WHERE y permite que Oracle use indices en ambas columnas
        SELECT SUM(NVL(cantidad, 0))
          INTO vExistencia
          FROM (
              -- Compras: suma por codigo_oem o id_articulo segun corresponda
              SELECT NVL(b.cantidad, 0) AS cantidad
                FROM compras_cabecera a
                JOIN compras_detalle  b ON b.id_factura  = a.id_factura
                JOIN articulos        c ON c.id_articulo = b.id_articulo
                                       AND c.cod_empresa = a.cod_empresa
               WHERE a.cod_empresa = pcod_empresa
                 AND c.id_rubro NOT IN (30, 39)
                 AND (
                       c.codigo_oem = pcod_oem                          -- match por OEM
                       OR (c.codigo_oem IS NULL
                           AND TO_CHAR(c.id_articulo) = pcod_oem)       -- match por id cuando no hay OEM
                     )
              UNION ALL
              -- Ventas: negativo
              SELECT NVL(b.cantidad, 0) * -1
                FROM ventas_cabecera a
                JOIN ventas_detalle  b ON b.id_factura  = a.id_factura
                JOIN articulos       c ON c.id_articulo = b.id_articulo
                                      AND c.cod_empresa = a.cod_empresa
               WHERE a.cod_empresa = pcod_empresa
                 AND c.id_rubro NOT IN (30, 39)
                 AND (
                       c.codigo_oem = pcod_oem
                       OR (c.codigo_oem IS NULL
                           AND TO_CHAR(c.id_articulo) = pcod_oem)
                     )
          );

        RETURN NVL(vExistencia, 0);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN 0;
        WHEN OTHERS THEN
            RAISE_APPLICATION_ERROR(-20001,
                'Error fn_existencia_oem oem=' || pcod_oem || ' ' || SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- fn_parametro - SIN CAMBIOS
    -- -------------------------------------------------------------------------
    FUNCTION fn_parametro (pCodEmpresa number,
                           pParametro  varchar2)
    RETURN varchar2 IS
        vValor varchar2(500);
    BEGIN
        SELECT valor
          INTO vValor
          FROM parametros
         WHERE cod_empresa = pCodEmpresa
           AND parametro   = pParametro;
        RETURN NVL(vValor, null);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN SQLERRM;
        WHEN OTHERS THEN
            RAISE_APPLICATION_ERROR(-20001,
                'Error fn_parametro. ' || SQLERRM);
    END;

end "PKG_STOCK";
/
