--------------------------------------------------------------------------------
-- TRG_ACTUALIZA_EXISTENCIA_INVENTARIO — recalcular el stock del sistema SOLO al
-- contar. Ejecutar como el esquema JOSEGALVEZ. Independiente: no toca paquetes.
--
-- Antes se disparaba en TODO update de INVENTARIO y pisaba cantidad_sistema con
-- el stock del momento. Al ajustar (pag 87/88) primero se inserta el comprobante
-- AJS (mueve el stock) y despues se hace UPDATE cerrado='S': el trigger volvia a
-- calcular y dejaba cantidad_sistema = stock ya ajustado, o sea, el conteo
-- cerrado quedaba con diferencia 0 y se perdia cuanto faltaba/sobraba. Tambien
-- recalculaba al subir la foto y en "Ajustar Diferencias 0".
--
-- Ahora: al insertar y cuando cambia cantidad_fisica o id_articulo (contar o
-- corregir un conteo), igual que antes. Cerrar, foto, observacion: ya no.
--
-- Efectos visibles (desde que se ejecuta; lo ya cerrado no cambia):
--   - Ajustar Inventarios: los conteos que se cierren de aca en adelante
--     mantienen su diferencia real, y suman en los totales salvo que se filtre
--     Cerrado = No. El front y el paquete ya no dejan ajustar un conteo cerrado.
--   - Inventario > Comparacion: los conteos ajustados muestran su diferencia
--     real en vez de 0.
-- El historial anterior se puede reconstruir desde INVENTARIO_JN (auditoria).
--------------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER TRG_ACTUALIZA_EXISTENCIA_INVENTARIO
BEFORE INSERT OR UPDATE OF cantidad_fisica, id_articulo ON inventario
FOR EACH ROW
BEGIN
  :NEW.cantidad_sistema := NVL(PKG_STOCK.fn_existencia(:NEW.id_articulo, :NEW.cod_empresa), 0);
END;
/

--------------------------------------------------------------------------------
-- RESPALDO: version anterior (volver a ella ejecutando solo este bloque).
--------------------------------------------------------------------------------
-- CREATE OR REPLACE TRIGGER TRG_ACTUALIZA_EXISTENCIA_INVENTARIO
-- BEFORE INSERT OR UPDATE ON inventario
-- FOR EACH ROW
-- BEGIN
--   :NEW.cantidad_sistema := nvl(PKG_STOCK.fn_existencia(:NEW.id_articulo, :NEW.cod_empresa),0);
-- END;
-- /
