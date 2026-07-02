import { useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Loader2, Search, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listarVentasArticulos,
  listarAniosVentas,
  listarMesesVentas,
  type FiltrosVentasArticulos,
  type VentaArticulo,
} from "@/lib/api";
import { exportarExcel, exportarPdf } from "@/lib/export";

const COD_EMPRESA = 24;

const fmtN = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-PY"));
const fmtP = (n: number | null) =>
  n == null ? "" : n.toLocaleString("es-PY", { maximumFractionDigits: 2 });

// Columnas de la grilla (mismo orden que la página 54 de APEX). Se reusan para
// la tabla y las exportaciones a Excel/PDF.
const COLUMNAS: {
  titulo: string;
  valor: (v: VentaArticulo) => string;
  num?: boolean; // alineado a la derecha
}[] = [
  { titulo: "Descripción", valor: (v) => v.descripcion ?? "" },
  { titulo: "Stock", valor: (v) => fmtN(v.existencia), num: true },
  { titulo: "Fecha", valor: (v) => v.fec_comprobante },
  { titulo: "Cant.", valor: (v) => fmtN(v.cantidad), num: true },
  { titulo: "Costo", valor: (v) => fmtN(v.costo_ultimo), num: true },
  { titulo: "Total Costo", valor: (v) => fmtN(v.total_costo), num: true },
  { titulo: "Precio Lista", valor: (v) => fmtN(v.precio_lista), num: true },
  { titulo: "Precio", valor: (v) => fmtN(v.precio), num: true },
  { titulo: "%", valor: (v) => fmtN(v.por_descuento), num: true },
  { titulo: "Descuento", valor: (v) => fmtN(v.diferencia), num: true },
  { titulo: "Total Venta", valor: (v) => fmtN(v.total), num: true },
  { titulo: "Rent.", valor: (v) => fmtN(v.rentabilidad), num: true },
  { titulo: "%Rent.", valor: (v) => fmtP(v.rentabilidad_porc), num: true },
  { titulo: "Factura", valor: (v) => String(v.id_factura ?? "") },
  { titulo: "Teléfono", valor: (v) => v.nro_telefono ?? "" },
  { titulo: "Modelo Vehículo", valor: (v) => v.modelo_vehiculo ?? "" },
];

// Totales del pie (como en APEX): Total Costo, Descuento, Total Venta y Rent.
function totales(ventas: VentaArticulo[]) {
  return {
    total_costo: ventas.reduce((a, v) => a + (v.total_costo ?? 0), 0),
    diferencia: ventas.reduce((a, v) => a + (v.diferencia ?? 0), 0),
    total: ventas.reduce((a, v) => a + (v.total ?? 0), 0),
    rentabilidad: ventas.reduce((a, v) => a + (v.rentabilidad ?? 0), 0),
  };
}

// Fila de totales alineada a las columnas (celdas vacías donde no hay total).
function filaTotales(t: ReturnType<typeof totales>): string[] {
  return COLUMNAS.map((c) => {
    switch (c.titulo) {
      case "Total Costo": return fmtN(t.total_costo);
      case "Descuento": return fmtN(t.diferencia);
      case "Total Venta": return fmtN(t.total);
      case "Rent.": return fmtN(t.rentabilidad);
      default: return "";
    }
  });
}

// Arma el TablaExport para los helpers compartidos de src/lib/export.ts.
function tablaExport(ventas: VentaArticulo[], subtitulo: string) {
  return {
    titulo: "Lubrimesys — Ventas Por Artículos",
    subtitulo,
    columnas: COLUMNAS.map((c) => c.titulo),
    filas: ventas.map((v) => COLUMNAS.map((c) => c.valor(v))),
    pie: filaTotales(totales(ventas)),
  };
}

// Vista de la página 54 (Ventas Por Artículos): grilla con filtros de las
// facetas APEX y export a Excel/PDF. Sin filtros carga el último día con ventas.
export function VentasArticulosView() {
  const [filtros, setFiltros] = useState<FiltrosVentasArticulos>({});
  const [searchInput, setSearchInput] = useState("");
  const [vendedorInput, setVendedorInput] = useState("");

  const ventasQuery = useQuery({
    queryKey: ["ventas-articulos", COD_EMPRESA, filtros],
    queryFn: () => listarVentasArticulos(filtros, COD_EMPRESA),
    retry: false,
  });

  const aniosQuery = useQuery({
    queryKey: ["ventas-anios", COD_EMPRESA],
    queryFn: () => listarAniosVentas(COD_EMPRESA),
    retry: false,
  });
  const mesesQuery = useQuery({
    queryKey: ["ventas-meses", COD_EMPRESA, filtros.anio],
    queryFn: () => listarMesesVentas(filtros.anio!, COD_EMPRESA),
    enabled: !!filtros.anio,
    retry: false,
  });

  const ventas = ventasQuery.data?.ventas ?? [];
  const fechaDefault = ventasQuery.data?.fechaDefault ?? null;
  const t = useMemo(() => totales(ventas), [ventas]);
  const hayFiltros = Object.values(filtros).some((v) => v);
  const tituloExport = `ventas-articulos-${(filtros.fecha ?? fechaDefault ?? "todos").replace(/\//g, "-")}`;

  // search y vendedor se aplican con Enter (evita un fetch por tecla).
  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    setFiltros((f) => ({
      ...f,
      search: searchInput.trim() || undefined,
      vendedor: vendedorInput.trim() || undefined,
    }));
  }

  function limpiar() {
    setFiltros({});
    setSearchInput("");
    setVendedorInput("");
  }

  const selectCls =
    "h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 sm:p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold">Ventas Por Artículos</h2>
          <p className="text-sm text-muted-foreground">
            {ventasQuery.isSuccess
              ? `${ventas.length} venta${ventas.length === 1 ? "" : "s"}${!hayFiltros && fechaDefault ? ` · ${fechaDefault}` : ""}`
              : "Cargando..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => exportarExcel(tablaExport(ventas, tituloExport))}
            disabled={ventas.length === 0}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => exportarPdf(tablaExport(ventas, tituloExport))}
            disabled={ventas.length === 0}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filtros (facetas de la página 54) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 sm:p-5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar (Enter)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={onEnter}
            className="h-10 pl-10"
          />
        </div>
        <input
          type="date"
          aria-label="Fecha"
          className={selectCls}
          value={
            // Por defecto muestra la fecha cargada (hoy o el último día con ventas).
            (filtros.fecha ?? (!hayFiltros ? fechaDefault : null))
              ?.split("/")
              .reverse()
              .join("-") ?? ""
          }
          onChange={(e) => {
            const v = e.target.value; // yyyy-mm-dd -> DD/MM/YYYY
            setFiltros((f) => ({
              ...f,
              fecha: v ? v.split("-").reverse().join("/") : undefined,
            }));
          }}
        />
        <select
          aria-label="Año"
          className={selectCls}
          value={filtros.anio ?? ""}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              anio: e.target.value || undefined,
              mes: undefined,
              fecha: undefined, // año/mes y fecha puntual no se combinan
            }))
          }
        >
          <option value="">Año</option>
          {(aniosQuery.data ?? []).map((a) => (
            <option key={a.anio} value={a.anio}>
              {a.anio}
            </option>
          ))}
        </select>
        <select
          aria-label="Mes"
          className={selectCls}
          value={filtros.mes ?? ""}
          onChange={(e) => setFiltros((f) => ({ ...f, mes: e.target.value || undefined }))}
          disabled={!filtros.anio}
        >
          <option value="">Mes</option>
          {(mesesQuery.data ?? []).map((m) => (
            <option key={m.mes_num} value={m.mes_num}>
              {m.mes}
            </option>
          ))}
        </select>
        <Input
          placeholder="Vendedor (Enter)"
          value={vendedorInput}
          onChange={(e) => setVendedorInput(e.target.value)}
          onKeyDown={onEnter}
          className="h-10 w-40"
        />
        {(hayFiltros || searchInput || vendedorInput) && (
          <Button type="button" variant="ghost" size="sm" onClick={limpiar} className="gap-1 text-muted-foreground">
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Grilla */}
      <div className="overflow-x-auto p-2 sm:p-4">
        {ventasQuery.isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ventasQuery.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {ventasQuery.error instanceof Error
              ? ventasQuery.error.message
              : "No se pudieron cargar las ventas"}
          </p>
        ) : ventas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin ventas para los filtros seleccionados.
          </p>
        ) : (
          <>
          {/* Móvil: tarjetas (la grilla de 16 columnas no entra en un teléfono) */}
          <div className="space-y-2 md:hidden">
            {ventas.map((v, i) => (
              <div key={`${v.id_factura}-${i}`} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold">{v.descripcion}</p>
                  <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Stock {fmtN(v.existencia)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {v.fec_comprobante} · Fact. {v.id_factura}
                  {v.vendedor ? ` · ${v.vendedor}` : ""}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Cant.</span>
                  <span className="text-muted-foreground">Precio</span>
                  <span className="text-muted-foreground">Total</span>
                  <span className="tabular-nums">{fmtN(v.cantidad)}</span>
                  <span className="tabular-nums">{fmtN(v.precio)}</span>
                  <span className="font-semibold tabular-nums">{fmtN(v.total)}</span>
                  <span className="text-muted-foreground">Desc. {fmtN(v.por_descuento)}%</span>
                  <span className="text-muted-foreground">Rent.</span>
                  <span className="text-muted-foreground">%Rent.</span>
                  <span className="tabular-nums">{fmtN(v.diferencia)}</span>
                  <span className="tabular-nums">{fmtN(v.rentabilidad)}</span>
                  <span className="tabular-nums">{fmtP(v.rentabilidad_porc)}</span>
                </div>
              </div>
            ))}
            {/* Totales */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="mb-1 font-semibold">Totales</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Total Costo</span>
                <span className="text-right tabular-nums">{fmtN(t.total_costo)}</span>
                <span className="text-muted-foreground">Descuento</span>
                <span className="text-right tabular-nums">{fmtN(t.diferencia)}</span>
                <span className="text-muted-foreground">Total Venta</span>
                <span className="text-right font-semibold tabular-nums">{fmtN(t.total)}</span>
                <span className="text-muted-foreground">Rentabilidad</span>
                <span className="text-right tabular-nums">{fmtN(t.rentabilidad)}</span>
              </div>
            </div>
          </div>

          {/* Desktop/tablet: grilla completa */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNAS.map((c) => (
                  <TableHead key={c.titulo} className={c.num ? "text-right" : ""}>
                    {c.titulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.map((v, i) => (
                <TableRow key={`${v.id_factura}-${i}`}>
                  {COLUMNAS.map((c) => (
                    <TableCell
                      key={c.titulo}
                      className={c.num ? "text-right tabular-nums" : "whitespace-nowrap"}
                    >
                      {c.valor(v)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                {filaTotales(t).map((s, i) => (
                  <TableCell key={i} className="text-right font-semibold tabular-nums">
                    {s}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          </Table>
          </div>
          </>
        )}
        {ventasQuery.isFetching && !ventasQuery.isLoading && (
          <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Actualizando...
          </p>
        )}
      </div>
    </div>
  );
}
