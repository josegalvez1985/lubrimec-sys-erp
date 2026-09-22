--------------------------------------------------------------------------------
-- ARTICULOS_PROVEEDORES — limpieza de duplicados + indice unico.
-- DDL en archivo aparte (misma convencion que WHATSAPP_DDL.sql).
--
-- LO QUE LA TABLA YA TIENE (no hace falta crearlo):
--   PK   ARTICULOS_PROVEEDORES_PK  (id_articulo_proveedor)  IDENTITY
--   UK   UK_ARTICULOS_PROVEEDORES  (cod_empresa, cod_persona, id_articulo,
--                                   id_cod_proveedor)
--   IX   IX_AP_EMP_ART_PERS (cod_empresa, id_articulo, cod_persona)
--   IX   IX_AP_ART_PROV     (id_articulo, cod_persona)
--   IX   IX_AP_COD_PROV     (id_cod_proveedor, cod_empresa)
--
-- La UK explica lo que se veia: impide repetir la MISMA tupla de 4 columnas,
-- pero NO impide cargar el mismo articulo dos veces para el mismo proveedor con
-- codigos distintos. Por eso existen los 17 pares duplicados de la empresa 24 y
-- por eso el INSERTAR del paquete ya mapea DUP_VAL_ON_INDEX -> 409: la UK ya
-- estaba disparando.
--
-- POR QUE IMPORTA. Esos duplicados causaron un bug silencioso en Pedidos de
-- Articulos (pag 63): un LEFT JOIN a esta tabla multiplicaba las filas de
-- compras_detalle y las compras salian al doble (fan-out; ver la nota en
-- db/GUIA_ENDPOINTS.md). Ese join ya se saco de la query y el dato que se
-- necesitaba (id_cod_proveedor) hoy se trae colapsado en el CTE codigos_prov,
-- asi que el bug esta corregido con o sin este archivo.
--
-- QUE FALTA, ENTONCES:
--
--   UX_ARTPROV_CODIGO (cod_empresa, cod_persona, id_cod_proveedor)
--      "un codigo de proveedor apunta a UN articulo".
--      Protege el SELECT INTO de compras-cabecera/:id/resolver-cod-proveedor
--      (db/compras_sql.sql), que YA asume esa unicidad: con dos filas revienta
--      con TOO_MANY_ROWS y, como solo captura NO_DATA_FOUND, sale 500.
--      La UK existente NO lo cubre, porque incluye id_articulo: hoy nada impide
--      que el mismo codigo apunte a dos articulos distintos del mismo proveedor.
--      OJO: IX_AP_COD_PROV es (id_cod_proveedor, cod_empresa) — otro orden y
--      otras columnas, asi que no choca con este.
--
-- Ejecutar como el esquema JOSEGALVEZ. Re-ejecutable: si el indice ya existe o
-- si quedan duplicados, informa y sigue en vez de abortar.
--------------------------------------------------------------------------------

SET SERVEROUTPUT ON

-- === 1) LIMPIEZA: duplicados inequivocos ======================================
--
-- Los 4 pares donde las dos filas son EL MISMO codigo. No se pierde informacion
-- al borrar uno, y ademas se arregla el escaneo: hoy, segun como se tipee, el
-- lookup de Compras encuentra una fila u otra.
--
--   535  'VAL 875290' (1902) = 'VAL875290'  (1483)   -> difiere un espacio
--   896  '67-211110-4'(5907) = '67211110-4' (4162)   -> difiere un guion
--   1002 'RP7656002VIC002'(6462) vs 'IC002'(6363)    -> IC002 es la cola mutilada
--   1003 'RP7656002SAK048'(6442) vs 'AK048'(6362)    -> AK048 es la cola mutilada
--
-- Los ids 6362 y 6363 son consecutivos: esos dos entraron juntos en una carga
-- mal hecha. Se borran las colas mutiladas y se conserva el codigo completo.
-- En 535 y 896 da igual cual quede (son el mismo codigo); se conserva la version
-- CON separadores, que es como suele venir impresa.
--
-- Los otros 13 pares tienen codigos realmente distintos: no se tocan.
--
-- REVISAR ANTES DE CORRER. Descomentar cuando estes de acuerdo:

-- DELETE FROM articulos_proveedores
--  WHERE id_articulo_proveedor IN (1483, 4162, 6362, 6363);
-- COMMIT;

-- === 2) DIAGNOSTICO: el mismo codigo apuntando a dos articulos ================
--     Es lo unico que bloquea el indice de la seccion 3. Si devuelve 0 filas,
--     el indice se crea sin limpiar nada.

SELECT cod_persona,
       id_cod_proveedor,
       COUNT(*)                     AS veces,
       LISTAGG(id_articulo, ' | ')
         WITHIN GROUP (ORDER BY id_articulo) AS articulos
  FROM articulos_proveedores
 WHERE cod_empresa = 24
 GROUP BY cod_persona, id_cod_proveedor
HAVING COUNT(*) > 1
 ORDER BY veces DESC;

-- === 3) INDICE A CREAR ========================================================
-- Orden de columnas pensado para resolver-cod-proveedor, que filtra por
-- (cod_empresa, cod_persona, id_cod_proveedor) exactamente: ademas de garantizar
-- la unicidad, le sirve de camino de acceso.

BEGIN
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UX_ARTPROV_CODIGO ON articulos_proveedores '
                 || '(cod_empresa, cod_persona, id_cod_proveedor)';
  DBMS_OUTPUT.PUT_LINE('OK    UX_ARTPROV_CODIGO creado.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('YA    UX_ARTPROV_CODIGO ya existia, nada que hacer.');
    ELSIF SQLCODE = -1408 THEN
      DBMS_OUTPUT.PUT_LINE('YA    Esas columnas ya estan indexadas con ese orden.');
    ELSIF SQLCODE = -1452 THEN
      DBMS_OUTPUT.PUT_LINE('FALTA UX_ARTPROV_CODIGO NO se creo: el mismo codigo '
                        || 'apunta a mas de un articulo. Correr la consulta 2 y limpiar.');
    ELSE
      RAISE;
    END IF;
END;
/

-- === 4) NO HACER: indice unico por (empresa, articulo, persona) ===============
-- Seria "un articulo tiene UN codigo por proveedor". Dos razones para no hacerlo:
--
--   a) Los datos no lo permiten: de los 17 pares duplicados, 13 tienen codigos
--      realmente distintos. Crearlo obliga a borrar un codigo legitimo en cada uno.
--   b) Esas columnas YA estan indexadas en ese orden por IX_AP_EMP_ART_PERS, asi
--      que Oracle rechaza el CREATE con ORA-01408: habria que DROPear ese indice
--      primero, perdiendo su camino de acceso mientras tanto.
--
-- Ademas ya no hace falta: el fan-out que motivaba esto se elimino sacando el
-- join de la query (pag 63). Activar solo si el negocio define que un articulo
-- tiene un unico codigo por proveedor, y en ese caso el orden es:
--   1. resolver los 13 pares (consulta de abajo), 2. DROP INDEX IX_AP_EMP_ART_PERS,
--   3. CREATE UNIQUE INDEX UX_ARTPROV_ARTICULO (cod_empresa, id_articulo, cod_persona).
--
--   SELECT id_articulo_proveedor, id_articulo, cod_persona, id_cod_proveedor
--     FROM articulos_proveedores
--    WHERE cod_empresa = 24
--      AND (id_articulo, cod_persona) IN (
--            SELECT id_articulo, cod_persona FROM articulos_proveedores
--             WHERE cod_empresa = 24 GROUP BY id_articulo, cod_persona
--            HAVING COUNT(*) > 1)
--    ORDER BY id_articulo, cod_persona, id_cod_proveedor;

-- === 5) VERIFICACION ==========================================================

SELECT index_name, uniqueness, status
  FROM user_indexes
 WHERE table_name = 'ARTICULOS_PROVEEDORES'
 ORDER BY index_name;
