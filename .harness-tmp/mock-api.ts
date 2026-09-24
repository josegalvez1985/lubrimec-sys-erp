// API simulada para el banco de prueba: historial de precios determinista.
export type PrecioVenta = {
  id_precio: number; id_articulo: number; descripcion_articulo: string | null;
  porc_recargo: number | null; fecha: string; precio_compra: number | null; precio_venta: number;
  cod_empresa: number; nro_linea: number | null; id_factura: number | null; margen: number | null;
  rubro: string | null; marca: string | null; codigo_oem: string | null;
};
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r = mulberry32(42);
const RUBROS = ["Aceites de motor", "Filtros de aceite", "Filtros de aire", "Lubricantes de caja", "Aditivos", "Grasas", "Baterías", "Lámparas"];
const MARCAS = ["Shell", "Mobil", "Castrol", "Mann", "Bosch", "Wega"];
const NOMBRES = ["Aceite 15W40 4L", "Filtro aceite", "Filtro aire", "ATF Dexron III 1L", "Limpia inyectores", "Grasa multiuso 500g", "Batería 12V 65Ah", "Lámpara H4 12V", "Aceite 5W30 sintético 4L", "Filtro combustible"];
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
const filas: Omit<PrecioVenta, "id_precio">[] = [];
const inicio = new Date(2024, 5, 1).getTime(), fin = new Date(2026, 8, 22).getTime();
for (let a = 1; a <= 140; a++) {
  const ri = Math.floor(r() * RUBROS.length);
  const desc = `${NOMBRES[ri % NOMBRES.length]} ${MARCAS[a % MARCAS.length]} #${a}`;
  const recargo = 25 + Math.floor(r() * 20);
  let costo = Math.round((20000 + r() * 280000) / 500) * 500;
  let t = inicio + r() * (fin - inicio) * 0.5;
  const n = Math.floor(r() * 7);
  for (let k = 0; k <= n && t < fin; k++) {
    if (k > 0) costo = Math.round((costo * (1 + (r() * 0.18 - 0.03))) / 500) * 500;
    const repite = k > 0 && r() < 0.15;
    const venta = repite ? filas[filas.length - 1].precio_venta : Math.ceil((costo * (1 + recargo / 100)) / 1000) * 1000;
    filas.push({ id_articulo: a, descripcion_articulo: desc, porc_recargo: recargo, fecha: iso(new Date(t)),
      precio_compra: costo, precio_venta: venta, cod_empresa: 24, nro_linea: null, id_factura: null,
      margen: ((venta - costo) / costo) * 100, rubro: RUBROS[ri], marca: MARCAS[a % MARCAS.length],
      codigo_oem: r() < 0.5 ? `9091${a}-0300${a % 9}` : null });
    t += 20 * 86400000 + r() * 150 * 86400000;
  }
}
filas.sort((x, y) => x.fecha.localeCompare(y.fecha));
const DATOS: PrecioVenta[] = filas.map((f, i) => ({ ...f, id_precio: i + 1 })).reverse();

export function getSesion() { return { token: "x", usuario: "joseg", app_user: "JOSEG", app_id: "86972" }; }
export async function listarPreciosVentas(_e: number, idArticulo?: number) {
  return idArticulo == null ? DATOS : DATOS.filter((d) => d.id_articulo === idArticulo);
}
export async function crearPrecioVenta() { return 1; }
export async function actualizarPrecioVenta() {}
export async function eliminarPrecioVenta() {}
export async function sugerirPrecio() { return { precio_compra: null, nro_linea: null, porc_recargo: null, precio_venta: null, precio_venta_anterior: null }; }
export async function articulosParaPrecio() { return []; }
export async function buscarArticulos() { return []; }
export async function buscarComprasPrecios() { return []; }
