import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Search, X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import { listarComprasArticulos, type CompraArticulo } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
// "yyyy-mm-dd" -> número ordenable (para ordenar fecha cronológicamente).
const fechaOrden = (iso: string | null): number =>
  iso ? Number(iso.replace(/-/g, "")) || 0 : 0;

export function ComprasArticulosView() {
  const [busqueda, setBusqueda] = useState("");
  const [provSel, setProvSel] = useState<Set<string>>(new Set());
  const [fechaSel, setFechaSel] = useState<Set<string>>(new Set());
  const [refSel, setRefSel] = useState<Set<string>>(new Set());
  const [imgArticulo, setImgArticulo] = useState<CompraArticulo | null>(null);

  // Cuántos meses (desde el más reciente con datos) se muestran. "Mostrar más"
  // agrega uno más hacia atrás; así no se pinta todo el histórico de golpe.
  const [mesesVisibles, setMesesVisibles] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["compras-articulos", COD_EMPRESA],
    queryFn: () => listarComprasArticulos(COD_EMPRESA),
    retry: false,
  });

  const todas = useMemo(() => data ?? [], [data]);

  // Meses con datos (yyyy-mm) ordenados del más reciente al más antiguo.
  const meses = useMemo(() => {
    const set = new Set<string>();
    for (const r of todas) if (r.fec_comprobante) set.add(r.fec_comprobante.slice(0, 7));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [todas]);

  // Ventana de meses visibles (los `mesesVisibles` más recientes).
  const mesesMostrados = useMemo(
    () => new Set(meses.slice(0, mesesVisibles)),
    [meses, mesesVisibles],
  );
  const hayMasMeses = mesesVisibles < meses.length;

  // Registros dentro de la ventana de meses. Las facetas y el filtrado operan
  // sobre esto (no sobre todo el histórico).
  const filas = useMemo(
    () => todas.filter((r) => r.fec_comprobante && mesesMostrados.has(r.fec_comprobante.slice(0, 7))),
    [todas, mesesMostrados],
  );

  const coincide = (r: CompraArticulo, ignora: "prov" | "fecha" | "ref" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.descripcion ?? ""} ${r.codigo_oem ?? ""} ${r.referencia ?? ""} ${r.proveedor ?? ""} ${r.id_cod_proveedor ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "prov" && provSel.size > 0 && !provSel.has(r.proveedor ?? "")) return false;
    if (ignora !== "fecha" && fechaSel.size > 0 && !fechaSel.has(r.fec_comprobante ?? "")) return false;
    if (ignora !== "ref" && refSel.size > 0 && !refSel.has(r.referencia ?? "")) return false;
    return true;
  };

  const facet = (
    campo: "proveedor" | "fec_comprobante" | "referencia",
    ignora: "prov" | "fecha" | "ref",
  ) => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = r[campo];
      if (coincide(r, ignora) && v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    const items = [...c.entries()].map(([valor, n]) => ({ valor, n }));
    if (campo === "fec_comprobante") {
      items.sort((a, b) => fechaOrden(b.valor) - fechaOrden(a.valor));
    } else {
      items.sort((a, b) => a.valor.localeCompare(b.valor));
    }
    return items;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetProv = useMemo(() => facet("proveedor", "prov"), [filas, busqueda, provSel, fechaSel, refSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetFecha = useMemo(() => facet("fec_comprobante", "fecha"), [filas, busqueda, provSel, fechaSel, refSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetRef = useMemo(() => facet("referencia", "ref"), [filas, busqueda, provSel, fechaSel, refSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, provSel, fechaSel, refSel],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setProvSel(new Set());
    setFechaSel(new Set());
    setRefSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" || provSel.size > 0 || fechaSel.size > 0 || refSel.size > 0;

  const COLUMNAS: Column<CompraArticulo>[] = [
    {
      key: "img",
      header: "Img",
      sortable: false,
      filterable: false,
      className: "w-14",
      render: (r) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setImgArticulo(r)}
          aria-label="Ver imagen del artículo"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      ),
    },
    {
      key: "id_cod_proveedor",
      header: "Cód. Prov.",
      accessor: (r) => r.id_cod_proveedor ?? "",
      render: (r) => r.id_cod_proveedor || "—",
    },
    {
      key: "codigo_oem",
      header: "Cód. OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) => r.codigo_oem || "—",
    },
    {
      key: "proveedor",
      header: "Proveedor",
      accessor: (r) => r.proveedor ?? "",
      render: (r) => r.proveedor || "—",
    },
    {
      key: "fec_comprobante",
      header: "Fecha",
      accessor: (r) => fechaOrden(r.fec_comprobante),
      render: (r) => fmtFecha(r.fec_comprobante),
      footer: () => "Total",
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
    },
    {
      key: "referencia",
      header: "Referencia",
      accessor: (r) => r.referencia ?? "",
      render: (r) => r.referencia || "—",
    },
    {
      key: "cantidad",
      header: "Cant.",
      num: true,
      accessor: (r) => r.cantidad ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.cantidad)}</span>,
    },
    {
      key: "precio",
      header: "Precio",
      num: true,
      accessor: (r) => r.precio ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.precio)}</span>,
    },
    {
      key: "total",
      header: "Total",
      num: true,
      accessor: (r) => r.total ?? 0,
      render: (r) => <span className="font-mono font-semibold">{fmtNum(r.total)}</span>,
      footer: (rows) => (
        <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))}</span>
      ),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Compras por Artículos</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} líneas
            {meses.length > 0 &&
              ` · ${mesesVisibles} ${mesesVisibles === 1 ? "mes" : "meses"} cargado${mesesVisibles === 1 ? "" : "s"}`}
          </p>
        </div>
        {hayFiltro && (
          <Button variant="outline" size="sm" onClick={limpiar} className="shrink-0">
            <X className="mr-2 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar las compras"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin compras para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="pl-10"
              />
            </div>
            <Faceta
              titulo="Proveedor"
              valores={facetProv}
              seleccion={provSel}
              onToggle={(v) => toggle(provSel, setProvSel, v)}
            />
            <Faceta
              titulo="Fecha"
              valores={facetFecha}
              seleccion={fechaSel}
              onToggle={(v) => toggle(fechaSel, setFechaSel, v)}
            />
            <Faceta
              titulo="Referencia"
              valores={facetRef}
              seleccion={refSel}
              onToggle={(v) => toggle(refSel, setRefSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r, i) => `${r.id_factura}|${r.nro_linea}|${i}`}
              exportName="compras-articulos"
              initialSort={{ key: "fec_comprobante", dir: "desc" }}
            />
            {hayMasMeses && (
              <div className="mt-4 flex flex-col items-center gap-1">
                <p className="text-xs text-muted-foreground">
                  Mostrando {mesesVisibles} {mesesVisibles === 1 ? "mes" : "meses"} de{" "}
                  {meses.length}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMesesVisibles((n) => n + 1)}
                >
                  Mostrar más
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <ArticuloImgModal
        open={!!imgArticulo}
        id={imgArticulo ? String(imgArticulo.id_articulo) : null}
        titulo={imgArticulo?.descripcion}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}
