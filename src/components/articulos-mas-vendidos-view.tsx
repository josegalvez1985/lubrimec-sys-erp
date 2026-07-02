import { useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Loader2, Search, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listarArticulosMasVendidos,
  type FiltrosMasVendidos,
  type ArticuloMasVendido,
} from "@/lib/api";
import { exportarExcel, exportarPdf } from "@/lib/export";

const COD_EMPRESA = 24;

const fmtN = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-PY"));

// Columnas de la grilla (mismas que la página 102 de APEX). Se reusan en tabla y exports.
const COLUMNAS: {
  titulo: string;
  valor: (a: ArticuloMasVendido) => string;
  num?: boolean;
}[] = [
  { titulo: "Cantidad Ventas", valor: (a) => fmtN(a.cantidad_ventas), num: true },
  { titulo: "Stock", valor: (a) => fmtN(a.stock), num: true },
  { titulo: "Descripción", valor: (a) => a.descripcion ?? "" },
  { titulo: "Codigo Oem", valor: (a) => a.codigo_oem ?? "" },
  { titulo: "Costo Ultimo", valor: (a) => fmtN(a.costo_ultimo), num: true },
  { titulo: "Fecha Ultimo Inventario", valor: (a) => a.fecha_ultimo_inventario ?? "" },
];

// Facetas tipo select de la página 102: se aplican server-side; las opciones se
// derivan de los datos cargados (comportamiento facetado: se acotan entre sí).
const FACETAS: { clave: keyof FiltrosMasVendidos; etiqueta: string; valor: (a: ArticuloMasVendido) => string | null }[] = [
  { clave: "proveedor", etiqueta: "Proveedor", valor: (a) => a.proveedor },
  { clave: "rubro", etiqueta: "Rubro", valor: (a) => a.rubro },
  { clave: "viscosidad", etiqueta: "Viscosidad", valor: (a) => a.viscosidad },
  { clave: "marca", etiqueta: "Marca", valor: (a) => a.marca },
  { clave: "unidad", etiqueta: "Unidad", valor: (a) => a.cod_unidad_medida },
];

function tablaExport(articulos: ArticuloMasVendido[]) {
  return {
    titulo: "Lubrimesys — Artículos Más Vendidos",
    subtitulo: `articulos-mas-vendidos-${new Date().toLocaleDateString("es-PY").replace(/\//g, "-")}`,
    columnas: COLUMNAS.map((c) => c.titulo),
    filas: articulos.map((a) => COLUMNAS.map((c) => c.valor(a))),
  };
}

// Vista de la página 102 (Artículos Más Vendidos): ranking por cantidad de
// ventas con facetas y export a Excel/PDF.
export function ArticulosMasVendidosView() {
  const [filtros, setFiltros] = useState<FiltrosMasVendidos>({});
  const [searchInput, setSearchInput] = useState("");

  const query = useQuery({
    queryKey: ["articulos-mas-vendidos", COD_EMPRESA, filtros],
    queryFn: () => listarArticulosMasVendidos(filtros, COD_EMPRESA),
    retry: false,
  });
  const articulos = query.data ?? [];

  // Opciones de cada faceta a partir de los datos cargados.
  const opciones = useMemo(() => {
    const out: Partial<Record<keyof FiltrosMasVendidos, string[]>> = {};
    for (const f of FACETAS) {
      out[f.clave] = Array.from(
        new Set(articulos.map(f.valor).filter((v): v is string => !!v)),
      ).sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [articulos]);

  const hayFiltros = Object.values(filtros).some((v) => v);

  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    setFiltros((f) => ({ ...f, search: searchInput.trim() || undefined }));
  }

  function limpiar() {
    setFiltros({});
    setSearchInput("");
  }

  const selectCls =
    "h-10 max-w-[160px] rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 sm:p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold">Artículos Más Vendidos</h2>
          <p className="text-sm text-muted-foreground">
            {query.isSuccess
              ? `${articulos.length} artículo${articulos.length === 1 ? "" : "s"}`
              : "Cargando..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => exportarExcel(tablaExport(articulos))}
            disabled={articulos.length === 0}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => exportarPdf(tablaExport(articulos))}
            disabled={articulos.length === 0}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filtros (facetas de la página 102) */}
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
        {FACETAS.map((f) => (
          <select
            key={f.clave}
            aria-label={f.etiqueta}
            className={selectCls}
            value={filtros[f.clave] ?? ""}
            onChange={(e) =>
              setFiltros((prev) => ({ ...prev, [f.clave]: e.target.value || undefined }))
            }
          >
            <option value="">{f.etiqueta}</option>
            {(opciones[f.clave] ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ))}
        {(hayFiltros || searchInput) && (
          <Button type="button" variant="ghost" size="sm" onClick={limpiar} className="gap-1 text-muted-foreground">
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Grilla */}
      <div className="overflow-x-auto p-2 sm:p-4">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "No se pudieron cargar los artículos"}
          </p>
        ) : articulos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin artículos para los filtros seleccionados.
          </p>
        ) : (
          <>
            {/* Móvil: tarjetas */}
            <div className="space-y-2 md:hidden">
              {articulos.map((a, i) => (
                <div key={`${a.id_articulo}-${i}`} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold">{a.descripcion}</p>
                    <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {fmtN(a.cantidad_ventas)} vendidos
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.codigo_oem ? `OEM ${a.codigo_oem} · ` : ""}
                    Stock {fmtN(a.stock)} · Costo {fmtN(a.costo_ultimo)}
                    {a.fecha_ultimo_inventario ? ` · Inv. ${a.fecha_ultimo_inventario}` : ""}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop/tablet: grilla */}
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
                  {articulos.map((a, i) => (
                    <TableRow key={`${a.id_articulo}-${i}`}>
                      {COLUMNAS.map((c) => (
                        <TableCell
                          key={c.titulo}
                          className={c.num ? "text-right tabular-nums" : ""}
                        >
                          {c.valor(a)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {query.isFetching && !query.isLoading && (
          <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Actualizando...
          </p>
        )}
      </div>
    </div>
  );
}
