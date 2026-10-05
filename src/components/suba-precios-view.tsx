import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Search, X, Pencil, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { BuscadorModal } from "@/components/ui/buscador-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InputMonto } from "@/components/ui/input-monto";
import {
  listarSubaPrecios,
  crearSubaPrecio,
  sugerirSubaPrecio,
  listarUltimasCompras,
  sugerirPrecio,
  crearPrecioVenta,
  buscarArticulos,
  type SubaPrecio,
  type SubaPrecioInput,
  type SugerenciaSuba,
  type UltimaCompra,
  type ArticuloBusqueda,
  type PrecioVentaInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n)}%`;
const fmtFecha = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const conSigno = (n: number, fmt: (n: number) => string) => (n > 0 ? "+" : "") + fmt(n);
// Filtro estándar de artículos (GUIA_FRONT): cada palabra, en cualquier orden, y el
// OEM con o sin separadores (9091503001 ≡ 90915-03001).
const sinSep = (s: string) => s.replace(/[-/.\s]/g, "");

const COLUMNAS: Column<SubaPrecio>[] = [
  {
    key: "articulo",
    header: "Artículo",
    accessor: (r) => r.articulo ?? "",
    render: (r) => (
      <div className="flex flex-col">
        <span>{r.articulo ?? "—"}</span>
        {r.codigo_oem && (
          <span className="font-mono text-xs text-muted-foreground">OEM {r.codigo_oem}</span>
        )}
      </div>
    ),
    hideable: false,
  },
  // null y no "": sin dato va al final en los dos sentidos (con "" quedaba primero en A→Z).
  { key: "marca", header: "Marca", accessor: (r) => r.marca },
  { key: "rubro", header: "Rubro", accessor: (r) => r.rubro },
  {
    key: "stock",
    header: "Stock",
    num: true,
    accessor: (r) => r.stock,
    render: (r) => fmtNum(r.stock),
  },
  {
    key: "precio_compra",
    header: "Precio Compra",
    num: true,
    accessor: (r) => r.precio_compra,
    render: (r) => <span className="font-mono">{fmtNum(r.precio_compra)}</span>,
  },
  {
    key: "precio_venta_anterior",
    header: "Precio Anterior",
    num: true,
    accessor: (r) => r.precio_venta_anterior,
    render: (r) => <span className="font-mono">{fmtNum(r.precio_venta_anterior)}</span>,
  },
  {
    key: "precio_venta",
    header: "Precio",
    num: true,
    accessor: (r) => r.precio_venta,
    render: (r) => <span className="font-mono font-semibold">{fmtNum(r.precio_venta)}</span>,
  },
  {
    key: "porc_recargo",
    header: "Porc Recargo",
    num: true,
    accessor: (r) => r.porc_recargo,
    render: (r) => fmtPct(r.porc_recargo),
  },
  {
    key: "margen",
    header: "Margen",
    num: true,
    accessor: (r) => r.margen,
    render: (r) => fmtPct(r.margen),
  },
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => fmtFecha(r.fecha),
  },
];

// ─── Última compra: costo actual contra el del precio vigente ────────────────

const COSTO_SUBIO = "Costo subió";
// Orden de la faceta: lo que pide subir el precio, primero.
const ESTADOS_COSTO = [
  COSTO_SUBIO,
  "Costo bajó",
  "Sin cambio",
  "Sin costo en el precio",
  "Sin compras",
];

function estadoCosto(r: SubaPrecio, ultimas: Map<number, UltimaCompra> | null): string {
  const u = ultimas?.get(r.id_articulo);
  if (!u) return "Sin compras";
  if (!r.precio_compra) return "Sin costo en el precio";
  if (u.precio_compra > r.precio_compra) return COSTO_SUBIO;
  if (u.precio_compra < r.precio_compra) return "Costo bajó";
  return "Sin cambio";
}

// ─── Stock ───────────────────────────────────────────────────────────────────

// Stock negativo (vendido sin compra cargada) cuenta como "Sin stock": no hay
// unidades para vender. El valor sale de PKG_STOCK.fn_existencia (por artículo).
const ESTADOS_STOCK = ["Con stock", "Sin stock"];
const estadoStock = (r: SubaPrecio) => ((r.stock ?? 0) > 0 ? "Con stock" : "Sin stock");

// % de la última compra sobre el costo del precio vigente.
function varCosto(r: SubaPrecio, ultimas: Map<number, UltimaCompra>): number | null {
  const u = ultimas.get(r.id_articulo);
  if (!u || !r.precio_compra) return null;
  return ((u.precio_compra - r.precio_compra) / r.precio_compra) * 100;
}

// La última compra va como segunda línea de "Precio Compra" (solo si difiere), no como
// columna aparte: cada columna suma ~100 px y en 1366 px la de acciones quedaba cortada.
function conUltimaCompra(
  col: Column<SubaPrecio>,
  ultimas: Map<number, UltimaCompra>,
): Column<SubaPrecio> {
  return {
    ...col,
    render: (r) => {
      const u = ultimas.get(r.id_articulo);
      const v = varCosto(r, ultimas);
      return (
        <div className="flex flex-col items-end">
          <span className="font-mono">{fmtNum(r.precio_compra)}</span>
          {u && v != null && v !== 0 && (
            <span
              className={
                v > 0
                  ? "font-mono text-xs font-semibold text-amber-600 dark:text-amber-500"
                  : "font-mono text-xs text-muted-foreground"
              }
              title={`Última compra${u.fec_compra ? ` del ${fmtFecha(u.fec_compra)}` : ""}: ${fmtNum(
                u.precio_compra,
              )} (${conSigno(v, fmtPct)})`}
            >
              {v > 0 ? "↑" : "↓"} {fmtNum(u.precio_compra)}
            </span>
          )}
        </div>
      );
    },
  };
}

export function SubaPreciosView() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [marcasSel, setMarcasSel] = useState<Set<string>>(new Set());
  const [rubrosSel, setRubrosSel] = useState<Set<string>>(new Set());
  const [costosSel, setCostosSel] = useState<Set<string>>(new Set());
  const [stockSel, setStockSel] = useState<Set<string>>(new Set());
  const [editar, setEditar] = useState<SubaPrecio | null>(null);
  // Modal "Nueva suba": fila = null desde el encabezado (se elige el artículo),
  // con fila desde el botón de la grilla (artículo fijo).
  const [nueva, setNueva] = useState<{ fila: SubaPrecio | null } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["suba-precios", COD_EMPRESA],
    queryFn: () => listarSubaPrecios(COD_EMPRESA),
    retry: false,
  });

  // Costo de la última compra por artículo. Endpoint aparte: si la BD todavía no lo
  // tiene (db/ORDS_SUBA_PRECIOS.sql), la columna, la faceta y la marca no aparecen y
  // la grilla queda como antes. Clave propia para que guardar un precio no la recargue.
  const { data: dataUltimas } = useQuery({
    queryKey: ["suba-precios-ultimas-compras", COD_EMPRESA],
    queryFn: () => listarUltimasCompras(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);
  // Clave de fila propia, no id_precio: si el backend repite un id_precio (un JOIN que
  // duplica filas), React confunde las filas con la misma clave al reordenar y el orden
  // por columna parece no funcionar. Las filas filtradas son los mismos objetos.
  const claveFila = useMemo(() => new Map(filas.map((r, i) => [r, i])), [filas]);
  // Precio vigente por artículo (la grilla trae el último precio de cada uno).
  const vigentes = useMemo(() => new Map(filas.map((r) => [r.id_articulo, r])), [filas]);
  const ultimas = useMemo(
    () => (dataUltimas ? new Map(dataUltimas.map((u) => [u.id_articulo, u])) : null),
    [dataUltimas],
  );

  const tokens = busqueda.trim().toUpperCase().split(/\s+/).filter(Boolean);

  // Conteo de facetas sobre las filas ya filtradas por las OTRAS facetas + búsqueda.
  const coincide = (r: SubaPrecio, ignora: "marca" | "rubro" | "costo" | "stock" | null) => {
    if (tokens.length > 0) {
      const texto =
        `${r.articulo ?? ""} ${r.codigo_oem ?? ""} ${r.id_articulo} ${r.marca ?? ""} ${r.rubro ?? ""}`.toUpperCase();
      const textoSinSep = sinSep(texto);
      if (!tokens.every((t) => texto.includes(t) || textoSinSep.includes(sinSep(t)))) return false;
    }
    if (ignora !== "marca" && marcasSel.size > 0 && !marcasSel.has(r.marca ?? "")) return false;
    if (ignora !== "rubro" && rubrosSel.size > 0 && !rubrosSel.has(r.rubro ?? "")) return false;
    if (ignora !== "costo" && costosSel.size > 0 && !costosSel.has(estadoCosto(r, ultimas)))
      return false;
    if (ignora !== "stock" && stockSel.size > 0 && !stockSel.has(estadoStock(r))) return false;
    return true;
  };

  const facetMarcas = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filas)
      if (coincide(r, "marca") && r.marca) c.set(r.marca, (c.get(r.marca) ?? 0) + 1);
    return [...c.entries()]
      .map(([valor, n]) => ({ valor, n }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, marcasSel, rubrosSel, costosSel, stockSel, ultimas]);

  const facetRubros = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filas)
      if (coincide(r, "rubro") && r.rubro) c.set(r.rubro, (c.get(r.rubro) ?? 0) + 1);
    return [...c.entries()]
      .map(([valor, n]) => ({ valor, n }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, marcasSel, rubrosSel, costosSel, stockSel, ultimas]);

  // En el orden de ESTADOS_COSTO (subió primero), no alfabético.
  const facetCostos = useMemo(() => {
    if (!ultimas) return [];
    const c = new Map<string, number>();
    for (const r of filas) {
      if (!coincide(r, "costo")) continue;
      const e = estadoCosto(r, ultimas);
      c.set(e, (c.get(e) ?? 0) + 1);
    }
    return ESTADOS_COSTO.filter((e) => c.has(e)).map((valor) => ({ valor, n: c.get(valor) ?? 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, marcasSel, rubrosSel, costosSel, stockSel, ultimas]);

  // Con stock primero, no alfabético.
  const facetStock = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filas) {
      if (!coincide(r, "stock")) continue;
      const e = estadoStock(r);
      c.set(e, (c.get(e) ?? 0) + 1);
    }
    return ESTADOS_STOCK.filter((e) => c.has(e)).map((valor) => ({ valor, n: c.get(valor) ?? 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, marcasSel, rubrosSel, costosSel, stockSel, ultimas]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, marcasSel, rubrosSel, costosSel, stockSel, ultimas],
  );

  // Con la última compra disponible, "Precio Compra" la muestra debajo cuando difiere.
  const columnas = useMemo(
    () =>
      ultimas
        ? COLUMNAS.map((c) => (c.key === "precio_compra" ? conUltimaCompra(c, ultimas) : c))
        : COLUMNAS,
    [ultimas],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setMarcasSel(new Set());
    setRubrosSel(new Set());
    setCostosSel(new Set());
    setStockSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" ||
    marcasSel.size > 0 ||
    rubrosSel.size > 0 ||
    costosSel.size > 0 ||
    stockSel.size > 0;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Suba de Precios</h2>
          <p className="text-sm text-muted-foreground">
            Último precio por artículo con margen y stock · {filasFiltradas.length} de{" "}
            {filas.length} artículos
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {hayFiltro && (
            <Button variant="outline" size="sm" onClick={limpiar} className="shrink-0">
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
          <Button
            onClick={() => setNueva({ fila: null })}
            className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva suba
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los precios"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <TrendingUp className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin precios para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar artículo, OEM, ID..."
                className="pl-10"
              />
            </div>
            {ultimas && (
              <Faceta
                titulo="Costo de compra"
                valores={facetCostos}
                seleccion={costosSel}
                onToggle={(v) => toggle(costosSel, setCostosSel, v)}
              />
            )}
            <Faceta
              titulo="Stock"
              valores={facetStock}
              seleccion={stockSel}
              onToggle={(v) => toggle(stockSel, setStockSel, v)}
            />

            <Faceta
              titulo="Rubro"
              valores={facetRubros}
              seleccion={rubrosSel}
              onToggle={(v) => toggle(rubrosSel, setRubrosSel, v)}
            />
            <Faceta
              titulo="Marca"
              valores={facetMarcas}
              seleccion={marcasSel}
              onToggle={(v) => toggle(marcasSel, setMarcasSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={columnas}
              rows={filasFiltradas}
              getRowId={(r) => claveFila.get(r) ?? r.id_precio}
              exportName="suba-precios"
              initialSort={{ key: "fecha", dir: "desc" }}
              actions={(r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={
                      estadoCosto(r, ultimas) === COSTO_SUBIO
                        ? "h-8 w-8 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                        : "h-8 w-8 text-muted-foreground hover:text-primary"
                    }
                    onClick={() => setNueva({ fila: r })}
                    aria-label="Nueva suba"
                    title={
                      estadoCosto(r, ultimas) === COSTO_SUBIO
                        ? "Nueva suba (el costo de compra subió)"
                        : "Nueva suba"
                    }
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => setEditar(r)}
                    aria-label="Actualizar precio"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      <SubaPrecioDialog
        item={editar}
        onClose={() => setEditar(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["suba-precios"] });
          setEditar(null);
        }}
      />

      <NuevaSubaDialog
        open={nueva !== null}
        fila={nueva?.fila ?? null}
        vigentes={vigentes}
        onClose={() => setNueva(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["suba-precios"] })}
      />
    </div>
  );
}

// ─── Dialog: nueva suba (artículo a elegir, costo de la última compra) ───────
//
// Calcula como Precios de Ventas: costo de la última compra (+ su delivery
// prorrateado) y % de recargo del rubro, redondeado hacia arriba al millar. Graba
// con el POST de Precios de Ventas, que guarda además la factura y la línea de
// compra de donde salió el costo. El lápiz de la grilla sigue con su modal propio.

type Modo = "recargo" | "suba";

type Calculo = {
  modo: Modo;
  costo: number | null;
  delivery: number; // por unidad; solo cuando el costo es el de la última compra
  recargo: number | null;
  pctSuba: number | null;
  vigente: number | null;
};

// Hacia arriba al millar (fórmula del APEX). Antes se redondea a centésimos: el
// error de coma flotante convertía 70.000 × 1,1 (77.000,0000000001) en 78.000.
const alMillar = (n: number) => Math.ceil(Math.round(n * 100) / 100 / 1000) * 1000;

function precioCalculado(c: Calculo): number | null {
  if (c.modo === "suba") {
    if (c.vigente == null || c.pctSuba == null) return null;
    return alMillar(c.vigente * (1 + c.pctSuba / 100));
  }
  if (c.costo == null || c.recargo == null) return null;
  const base = c.costo + c.delivery;
  return alMillar(base + (c.recargo / 100) * base);
}

function NuevaSubaDialog({
  open,
  fila,
  vigentes,
  onClose,
  onSaved,
}: {
  open: boolean;
  fila: SubaPrecio | null; // abierto desde una fila: artículo fijo, sin "Guardar y otro"
  vigentes: Map<number, SubaPrecio>;
  onClose: () => void;
  onSaved: () => void; // refresca la grilla; el cierre lo decide el modal
}) {
  const [articulo, setArticulo] = useState<ArticuloBusqueda | null>(null);
  const [sug, setSug] = useState<SugerenciaSuba | null>(null);
  const [avisoSug, setAvisoSug] = useState("");
  const [cargando, setCargando] = useState(false);
  const [costo, setCosto] = useState<number | null>(null);
  // true = el costo es el de la última compra: suma su delivery y se graba su factura.
  const [costoDeCompra, setCostoDeCompra] = useState(false);
  const [recargo, setRecargo] = useState<number | null>(null);
  const [modo, setModo] = useState<Modo>("recargo");
  const [pctSuba, setPctSuba] = useState<number | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);
  const [precioTocado, setPrecioTocado] = useState(false);
  const [confirmaBajoCosto, setConfirmaBajoCosto] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Descarta la respuesta de un artículo anterior si el usuario ya eligió otro.
  const pedido = useRef(0);

  const vigente = articulo ? (vigentes.get(articulo.id_articulo) ?? null) : null;
  const precioVigente = vigente?.precio_venta ?? null;
  const delivery = costoDeCompra ? (sug?.costo_delivery ?? 0) : 0;

  function limpiar() {
    pedido.current++;
    setArticulo(null);
    setSug(null);
    setAvisoSug("");
    setCargando(false);
    setCosto(null);
    setCostoDeCompra(false);
    setRecargo(null);
    setModo("recargo");
    setPctSuba(null);
    setPrecio(null);
    setPrecioTocado(false);
    setConfirmaBajoCosto(false);
    setError("");
  }

  function cerrar() {
    limpiar();
    onClose();
  }

  // Recalcula el precio con lo que cambió, salvo que se haya escrito a mano
  // (forzar: cambio de modo o botón "Recalcular").
  function recalcular(cambios: Partial<Calculo>, forzar = false) {
    setConfirmaBajoCosto(false);
    if (precioTocado && !forzar) return;
    setPrecioTocado(false);
    setPrecio(
      precioCalculado({
        modo,
        costo,
        delivery,
        recargo,
        pctSuba,
        vigente: precioVigente,
        ...cambios,
      }),
    );
  }

  async function elegir(a: ArticuloBusqueda) {
    const n = ++pedido.current;
    setArticulo(a);
    setSug(null);
    setAvisoSug("");
    setError("");
    setConfirmaBajoCosto(false);
    setCargando(true);
    const v = vigentes.get(a.id_articulo) ?? null;
    let s: SugerenciaSuba = {};
    let aviso = "";
    try {
      s = await sugerirSubaPrecio(COD_EMPRESA, a.id_articulo);
    } catch (err) {
      // BD sin el endpoint (db/ORDS_SUBA_PRECIOS.sql, bloque suba-precios/sugerir) o
      // error puntual. El % del rubro igual sale de precios-ventas/sugerir; su costo
      // no, porque sin factura no es la última compra: queda el del precio vigente.
      aviso = `No se pudo traer la última compra (${
        err instanceof Error ? err.message : "error"
      }): se usa el costo del precio vigente.`;
      try {
        s = { porc_recargo: (await sugerirPrecio(COD_EMPRESA, a.id_articulo)).porc_recargo };
      } catch {
        // sin respaldo: queda el recargo del precio vigente
      }
    }
    if (n !== pedido.current) return;
    const deCompra = s.precio_compra != null;
    const c = s.precio_compra ?? v?.precio_compra ?? null;
    const r = s.porc_recargo ?? v?.porc_recargo ?? null;
    setSug(s);
    setAvisoSug(aviso);
    setCosto(c);
    setCostoDeCompra(deCompra);
    setRecargo(r);
    setModo("recargo");
    setPctSuba(null);
    setPrecioTocado(false);
    setPrecio(
      precioCalculado({
        modo: "recargo",
        costo: c,
        delivery: deCompra ? (s.costo_delivery ?? 0) : 0,
        recargo: r,
        pctSuba: null,
        vigente: v?.precio_venta ?? null,
      }),
    );
    setCargando(false);
  }

  // Desde una fila el artículo ya está elegido: se cargan sus sugeridos al abrir.
  useEffect(() => {
    if (!open || !fila) return;
    void elegir({
      id_articulo: fila.id_articulo,
      descripcion: fila.articulo,
      codigo_oem: fila.codigo_oem,
      precio_venta: fila.precio_venta,
      costo_ultima_compra: null,
      rubro: fila.rubro,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fila]);

  // Sugerencia de costo: alternar entre la última compra y el del precio vigente.
  function usarCosto(deCompra: boolean) {
    const c = deCompra ? (sug?.precio_compra ?? null) : (vigente?.precio_compra ?? null);
    setCosto(c);
    setCostoDeCompra(deCompra);
    recalcular({ costo: c, delivery: deCompra ? (sug?.costo_delivery ?? 0) : 0 });
  }

  function cambiarModo(m: Modo) {
    setModo(m);
    recalcular({ modo: m }, true);
  }

  const costoCambio =
    sug?.precio_compra != null &&
    vigente?.precio_compra != null &&
    sug.precio_compra !== vigente.precio_compra;
  const margen = precio != null && costo ? ((precio - costo) / costo) * 100 : null;
  const bajoCosto = precio != null && costo != null && precio < costo;
  const avisos: string[] = [];
  if (precio != null && precioVigente != null && precio <= precioVigente) {
    avisos.push(`El precio nuevo no supera al vigente (${fmtNum(precioVigente)}).`);
  }
  if (bajoCosto) {
    avisos.push("El precio nuevo queda por debajo del costo.");
  } else if (margen != null && recargo != null && margen < recargo) {
    avisos.push(
      `El margen (${fmtPct(margen)}) queda por debajo del recargo del rubro (${fmtPct(recargo)}).`,
    );
  }

  async function guardar(otro: boolean) {
    if (!articulo) return setError("Selecciona el artículo");
    if (precio == null || precio <= 0) return setError("Indica el precio de venta");
    if (bajoCosto && !confirmaBajoCosto) {
      setConfirmaBajoCosto(true);
      return setError("El precio queda por debajo del costo. Volvé a guardar para confirmarlo.");
    }
    setError("");
    setSaving(true);
    try {
      const input: PrecioVentaInput = {
        id_articulo: articulo.id_articulo,
        porc_recargo: recargo,
        precio_compra: costo,
        precio_venta: precio,
        cod_empresa: COD_EMPRESA,
        // La compra de donde salió el costo, como en Precios de Ventas.
        id_factura: costoDeCompra ? (sug?.id_factura ?? null) : null,
        nro_linea: costoDeCompra ? (sug?.nro_linea ?? null) : null,
      };
      await crearPrecioVenta(input);
      onSaved();
      if (otro) {
        toast.success(
          `${articulo.descripcion ?? `Artículo ${articulo.id_articulo}`}: precio ${fmtNum(precio)}`,
        );
        limpiar();
        requestAnimationFrame(() => document.getElementById("nueva_suba_articulo")?.focus());
      } else {
        cerrar();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva suba de precio</DialogTitle>
          <DialogDescription>
            Costo de la última compra y % de recargo del rubro, como en Precios de Ventas. El precio
            nuevo queda como el vigente.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(false);
          }}
          className="space-y-4"
        >
          {fila ? (
            <div className="space-y-2">
              <Label>Artículo</Label>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-sm font-medium">
                  {fila.articulo ?? `Artículo ${fila.id_articulo}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    `ID ${fila.id_articulo}`,
                    fila.codigo_oem ? `OEM ${fila.codigo_oem}` : null,
                    fila.rubro,
                    fila.marca,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="nueva_suba_articulo">Artículo</Label>
              <BuscadorModal
                id="nueva_suba_articulo"
                titulo="Elegir artículo"
                descripcion="Buscá por descripción, código OEM o ID."
                placeholder="Seleccionar artículo..."
                buscarPlaceholder="Buscar artículo por descripción, OEM o ID..."
                emptyLabel="Sin artículos"
                label={articulo ? (articulo.descripcion ?? `Artículo ${articulo.id_articulo}`) : ""}
                buscar={(q) => buscarArticulos(COD_EMPRESA, q)}
                itemKey={(a) => a.id_articulo}
                itemTitle={(a) => a.descripcion ?? "—"}
                itemSub={(a) => {
                  const v = vigentes.get(a.id_articulo);
                  return [
                    `ID ${a.id_articulo}`,
                    a.codigo_oem ? `OEM ${a.codigo_oem}` : "sin OEM",
                    a.rubro,
                    v?.precio_venta != null ? `Precio ${fmtNum(v.precio_venta)}` : "sin precio",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                }}
                onSelect={(a) => void elegir(a)}
                disabled={saving}
              />
            </div>
          )}

          {articulo && cargando && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {articulo && !cargando && (
            <>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                {vigente ? (
                  <>
                    <p>
                      Precio vigente{" "}
                      <span className="font-mono font-semibold">
                        {fmtNum(vigente.precio_venta)}
                      </span>{" "}
                      desde {fmtFecha(vigente.fecha)}
                    </p>
                    <p className="text-muted-foreground">
                      Costo {fmtNum(vigente.precio_compra)} · Margen {fmtPct(vigente.margen)} ·
                      Stock {fmtNum(vigente.stock)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Sin precio registrado: este será el primer precio del artículo.
                  </p>
                )}
              </div>

              {avisoSug && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                  {avisoSug}
                </p>
              )}

              {sug?.precio_compra != null && (
                <div
                  className={
                    costoCambio
                      ? "space-y-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
                      : "space-y-1 rounded-lg border border-border px-3 py-2 text-sm"
                  }
                >
                  <p className="font-medium">
                    {costoCambio ? "Sugerencia: actualizar el costo de compra" : "Última compra"}
                  </p>
                  {costoCambio && vigente?.precio_compra != null ? (
                    <p>
                      <span className="font-mono">{fmtNum(vigente.precio_compra)}</span>{" "}
                      <span className="text-muted-foreground">(precio vigente)</span> →{" "}
                      <span className="font-mono font-semibold">{fmtNum(sug.precio_compra)}</span>{" "}
                      <span className="text-muted-foreground">(última compra)</span> ·{" "}
                      {conSigno(
                        ((sug.precio_compra - vigente.precio_compra) / vigente.precio_compra) * 100,
                        fmtPct,
                      )}
                    </p>
                  ) : (
                    <p>
                      Costo{" "}
                      <span className="font-mono font-semibold">{fmtNum(sug.precio_compra)}</span>
                      {vigente?.precio_compra != null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · igual al del precio vigente
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[
                      sug.fec_compra ? fmtFecha(sug.fec_compra) : null,
                      sug.proveedor,
                      sug.comprobante,
                      (sug.costo_delivery ?? 0) > 0
                        ? `delivery ${fmtNum(sug.costo_delivery ?? 0)} por unidad`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {costoCambio && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => usarCosto(!costoDeCompra)}
                      disabled={saving}
                    >
                      {costoDeCompra
                        ? "Mantener el costo anterior"
                        : "Usar el costo de la última compra"}
                    </Button>
                  )}
                </div>
              )}

              {sug && sug.precio_compra == null && !avisoSug && (
                <p className="text-sm text-muted-foreground">
                  El artículo no tiene compras registradas: se usa el costo del precio vigente.
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nueva_suba_costo">Costo de compra</Label>
                  <InputMonto
                    id="nueva_suba_costo"
                    value={costo}
                    onValueChange={(v) => {
                      setCosto(v);
                      recalcular({ costo: v });
                    }}
                    disabled={saving}
                    className="font-mono"
                  />
                  {delivery > 0 && modo === "recargo" && (
                    <p className="text-xs text-muted-foreground">
                      + delivery {fmtNum(delivery)} por unidad en el cálculo
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nueva_suba_recargo">% Recargo</Label>
                  <InputMonto
                    id="nueva_suba_recargo"
                    value={recargo}
                    onValueChange={(v) => {
                      setRecargo(v);
                      recalcular({ recargo: v });
                    }}
                    disabled={saving}
                    className="font-mono"
                  />
                  {sug?.rubro && (
                    <p className="text-xs text-muted-foreground">Del rubro {sug.rubro}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Calcular el precio por</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={modo === "recargo" ? "default" : "outline"}
                    onClick={() => cambiarModo("recargo")}
                    disabled={saving}
                  >
                    Recargo sobre costo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={modo === "suba" ? "default" : "outline"}
                    onClick={() => cambiarModo("suba")}
                    disabled={saving || precioVigente == null}
                  >
                    % de suba sobre el vigente
                  </Button>
                </div>
              </div>

              {modo === "suba" && (
                <div className="space-y-2">
                  <Label htmlFor="nueva_suba_pct">% de suba</Label>
                  <InputMonto
                    id="nueva_suba_pct"
                    value={pctSuba}
                    onValueChange={(v) => {
                      setPctSuba(v);
                      recalcular({ pctSuba: v });
                    }}
                    disabled={saving}
                    className="font-mono"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="nueva_suba_precio">Precio nuevo</Label>
                <InputMonto
                  id="nueva_suba_precio"
                  value={precio}
                  onValueChange={(v) => {
                    setPrecio(v);
                    setPrecioTocado(true);
                    setConfirmaBajoCosto(false);
                  }}
                  disabled={saving}
                  maxDecimals={0}
                  className="font-mono text-base font-semibold"
                />
                {precio != null && (
                  <p className="text-xs text-muted-foreground">
                    {precioVigente != null && (
                      <>
                        {fmtNum(precioVigente)} →{" "}
                        <span className="font-mono text-foreground">{fmtNum(precio)}</span> ·{" "}
                        {conSigno(precio - precioVigente, fmtNum)} Gs. (
                        {conSigno(((precio - precioVigente) / precioVigente) * 100, fmtPct)}) ·{" "}
                      </>
                    )}
                    margen {fmtPct(margen)}
                    {precioTocado && (
                      <>
                        {" · escrito a mano · "}
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={() => recalcular({}, true)}
                        >
                          Recalcular
                        </button>
                      </>
                    )}
                  </p>
                )}
              </div>

              {avisos.length > 0 && (
                <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                  {avisos.map((a) => (
                    <p key={a}>{a}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={cerrar} disabled={saving}>
              Cancelar
            </Button>
            {!fila && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void guardar(true)}
                disabled={saving || !articulo || cargando}
              >
                Guardar y otro
              </Button>
            )}
            <Button
              type="submit"
              disabled={saving || !articulo || cargando}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: actualizar precio (inserta un precio nuevo) ─────────────────────

function SubaPrecioDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SubaPrecio | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = item !== null;

  const [precioCompra, setPrecioCompra] = useState<number | null>(null);
  const [porcRecargo, setPorcRecargo] = useState<number | null>(null);
  const [precioVenta, setPrecioVenta] = useState<number | null>(null);
  const [precioTocado, setPrecioTocado] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState<number | null>(null);
  if (open && item.id_precio !== lastKey) {
    setLastKey(item.id_precio);
    setPrecioCompra(item.precio_compra);
    setPorcRecargo(item.porc_recargo);
    setPrecioVenta(item.precio_venta);
    setPrecioTocado(false);
    setError("");
  }

  // precio_venta = CEIL(((recargo/100)*compra + compra)/1000)*1000  (igual que APEX)
  const recalcular = (compra: number | null, recargo: number | null) =>
    Math.ceil((((recargo ?? 0) / 100) * (compra ?? 0) + (compra ?? 0)) / 1000) * 1000;

  const aplicarRecalculo = (compra: number | null, recargo: number | null) => {
    if (!precioTocado) setPrecioVenta(recalcular(compra, recargo));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError("");
    if (precioVenta == null) return setError("Indica el precio de venta");

    setSaving(true);
    try {
      const input: SubaPrecioInput = {
        id_articulo: item.id_articulo,
        precio_compra: precioCompra,
        porc_recargo: porcRecargo,
        precio_venta: precioVenta,
        cod_empresa: COD_EMPRESA,
      };
      await crearSubaPrecio(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar precio</DialogTitle>
          <DialogDescription>
            {item?.articulo ?? "Artículo"} — se registra un precio nuevo (queda como el vigente).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Precio anterior:{" "}
            <span className="font-mono text-foreground">{fmtNum(item?.precio_venta ?? null)}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="precio_compra">Precio Compra</Label>
              <InputMonto
                id="precio_compra"
                value={precioCompra}
                onValueChange={(v) => {
                  setPrecioCompra(v);
                  aplicarRecalculo(v, porcRecargo);
                }}
                disabled={saving}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="porc_recargo">Porc Recargo</Label>
              <InputMonto
                id="porc_recargo"
                value={porcRecargo}
                onValueChange={(v) => {
                  setPorcRecargo(v);
                  aplicarRecalculo(precioCompra, v);
                }}
                disabled={saving}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="precio_venta">Precio Venta</Label>
            <InputMonto
              id="precio_venta"
              value={precioVenta}
              onValueChange={(v) => {
                setPrecioVenta(v);
                setPrecioTocado(true);
              }}
              disabled={saving}
              maxDecimals={0}
              className="font-mono text-base font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Se calcula automáticamente al millar; podés ajustarlo a mano.
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
