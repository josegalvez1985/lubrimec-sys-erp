import { lazy, type ComponentType } from "react";

// Mapa de vistas por page_id (APEX), cargadas bajo demanda con React.lazy.
//
// Por qué lazy y no imports estáticos: home.tsx importaba las 61 vistas de forma
// estática, así que el bundler las metía todas en el chunk de /home (~1.5 MB). Abrir
// el dashboard obligaba a descargar y parsear TODO el ERP —incluidas jspdf,
// html2canvas y recharts, que solo usan algunas pantallas—. Con lazy cada vista es
// su propio chunk y baja recién cuando el usuario la abre.
//
// Al implementar una página nueva: anotar su page_id aquí con su componente.
// Las páginas del menú sin entrada aquí muestran un Placeholder con su título.

// Las vistas son named exports y lazy() espera un módulo con { default }:
// este helper toma el named export y lo reexpone como default.
function vista(carga: () => Promise<Record<string, unknown>>, nombre: string) {
  return lazy(async () => ({ default: (await carga())[nombre] as ComponentType }));
}

export const VISTAS: Record<number, ComponentType> = {
  2: vista(() => import("@/components/personas-view"), "PersonasView"), // Personas
  4: vista(() => import("@/components/articulos-view"), "ArticulosView"), // Artículos
  6: vista(() => import("@/components/marcas-view"), "MarcasView"), // Marcas
  10: vista(() => import("@/components/iva-view"), "IvaView"), // IVA
  12: vista(() => import("@/components/empresas-view"), "EmpresasView"), // Empresas
  18: vista(() => import("@/components/monedas-view"), "MonedasView"), // Monedas
  20: vista(() => import("@/components/rubros-view"), "RubrosView"), // Rubros
  24: vista(() => import("@/components/codigos-barras-view"), "CodigosBarrasView"), // Códigos de Barras
  27: vista(() => import("@/components/articulos-proveedores-view"), "ArticulosProveedoresView"), // Artículos por Proveedor
  42: vista(() => import("@/components/condiciones-facturas-view"), "CondicionesFacturasView"), // Condiciones de Facturas
  44: vista(() => import("@/components/talonarios-view"), "TalonariosView"), // Talonarios
  48: vista(() => import("@/components/formas-cobro-pago-view"), "FormasCobroPagoView"), // Formas de Cobro/Pago
  50: vista(() => import("@/components/bancos-view"), "BancosView"), // Bancos
  52: vista(() => import("@/components/viscosidad-view"), "ViscosidadView"), // Viscosidad de Lubricantes
  21: vista(() => import("@/components/unidades-medidas-view"), "UnidadesMedidasView"), // Unidades de Medidas
  54: vista(() => import("@/components/ventas-articulos-view"), "VentasArticulosView"), // Ventas Por Artículos
  102: vista(() => import("@/components/articulos-mas-vendidos-view"), "ArticulosMasVendidosView"), // Artículos Más Vendidos
  63: vista(() => import("@/components/pedidos-articulos-view"), "PedidosArticulosView"), // Pedidos de Artículos
  117: vista(() => import("@/components/whatsapp-view"), "WhatsappView"), // Mensajes a Whatsapp
  83: vista(() => import("@/components/monedas-detalle-view"), "MonedasDetalleView"), // Detalle de Monedas
  94: vista(() => import("@/components/vehiculos-repuestos-view"), "VehiculosRepuestosView"), // Vehículos-Repuestos
  120: vista(() => import("@/components/logs-whatsapp-view"), "LogsWhatsappView"), // Logs de WhatsApp
  77: vista(() => import("@/components/compras-pagos-view"), "ComprasPagosView"), // Pagos de Compras
  30: vista(() => import("@/components/vendedores-view"), "VendedoresView"), // Vendedores
  106: vista(() => import("@/components/descuentos-escalonados-view"), "DescuentosEscalonadosView"), // Descuentos Escalonados
  105: vista(() => import("@/components/post-venta-view"), "PostVentaView"), // Post Venta
  100: vista(() => import("@/components/suba-precios-view"), "SubaPreciosView"), // Suba de Precios
  85: vista(() => import("@/components/conteo-efectivo-view"), "ConteoEfectivoView"), // Conteo de Efectivo
  67: vista(() => import("@/components/descuentos-view"), "DescuentosView"), // Descuentos
  71: vista(() => import("@/components/numeros-vouchers-view"), "NumerosVouchersView"), // Números de Vouchers
  62: vista(() => import("@/components/cierre-dia-view"), "CierreDiaView"), // Cierre del Día
  73: vista(() => import("@/components/rendiciones-cajas-view"), "RendicionesCajasView"), // Rendición de Caja
  65: vista(() => import("@/components/ventas-cobros-view"), "VentasCobrosView"), // Cobros de Ventas
  60: vista(() => import("@/components/ventas-view"), "VentasView"), // Ventas
  28: vista(() => import("@/components/compras-view"), "ComprasView"), // Consulta de Compras
  34: vista(() => import("@/components/precios-ventas-view"), "PreciosVentasView"), // Precios de Ventas
  111: vista(() => import("@/components/cobros-acreditar-view"), "CobrosAcreditarView"), // Acreditación de Cobros
  55: vista(() => import("@/components/compras-articulos-view"), "ComprasArticulosView"), // Compras por Artículos
  56: vista(() => import("@/components/ficha-articulos-view"), "FichaArticulosView"), // Ficha de Artículos
  57: vista(() => import("@/components/articulos-sin-barra-view"), "ArticulosSinBarraView"), // Artículos sin Código de Barra
  81: vista(() => import("@/components/articulos-no-inventariados-view"), "ArticulosNoInventariadosView"), // Artículos no Inventariados
  76: vista(() => import("@/components/articulos-inventario-view"), "ArticulosInventarioView"), // Artículos para Inventario
  58: vista(() => import("@/components/inventario-view"), "InventarioView"), // Inventario (modal Crear Inventario = pág 59)
  87: vista(() => import("@/components/ajustar-inventarios-view"), "AjustarInventariosView"), // Ajustar Inventarios (modal Aplicar = pág 88)
  89: vista(() => import("@/components/parametros-view"), "ParametrosView"), // Parámetros (modal Crear/Editar = pág 90)
  112: vista(() => import("@/components/planilla-inventarios-view"), "PlanillaInventariosView"), // Planilla para inventarios (113 Crear + 115 Cantidad)
  108: vista(() => import("@/components/sortear-view"), "SortearView"), // Sortear
  37: vista(() => import("@/components/roles-paginas-view"), "RolesPaginasView"), // Roles de Páginas (modal Crear Rol = pág 38)
  82: vista(() => import("@/components/precios-mayoristas-view"), "PreciosMayoristasView"), // Precios Mayoristas
  92: vista(() => import("@/components/costo-inventarios-view"), "CostoInventariosView"), // Costo de Inventarios
  93: vista(() => import("@/components/marcas-vs-descripcion-view"), "MarcasVsDescripcionView"), // Marcas Vs Descripción de Articulos
  101: vista(() => import("@/components/pago-comisiones-view"), "PagoComisionesView"), // Pago de Comisiones
  103: vista(() => import("@/components/pagos-proveedores-ventas-view"), "PagosProveedoresVentasView"), // Pagos a proveedores por ventas
  104: vista(() => import("@/components/aguinaldos-view"), "AguinaldosView"), // Aguinaldos
  114: vista(() => import("@/components/comisiones-banco-view"), "ComisionesBancoView"), // Comisiones al Banco
  61: vista(() => import("@/components/consulta-precios-view"), "ConsultaPreciosView"), // Consulta de Precios
  70: vista(() => import("@/components/existencia-articulos-view"), "ExistenciaArticulosView"), // Existencia de Artículos
  75: vista(() => import("@/components/compras-vs-ventas-view"), "ComprasVsVentasView"), // Compras Vs Ventas
  79: vista(() => import("@/components/saldos-proveedores-view"), "SaldosProveedoresView"), // Saldos de Proveedores
  80: vista(() => import("@/components/consulta-inventarios-view"), "ConsultaInventariosView"), // Consulta de Inventarios
  39: vista(() => import("@/components/punto-venta-view"), "PuntoVentaView"), // Punto de Venta
};
