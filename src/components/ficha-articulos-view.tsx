import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search, X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import { listarFichaExistencia, type FichaExistencia } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const fechaOrden = (iso: string | null): number =>
  iso ? Number(iso.replace(/-/g, "")) || 0 : 0;

function Faceta({
  titulo,
  valores,
  seleccion,
  onToggle,
}: {
  titulo: string;
  valores: { valor: string; n: number }[];
  seleccion: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold">{titulo}</div>
      <div className="max-h-52 space-y-1 overflow-auto p-2">
        {valores.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">Sin valores</p>
        ) : (
          valores.map(({ valor, n }) => (
            <label
              key={valor}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={seleccion.has(valor)} onCheckedChange={() => onToggle(valor)} />
              <span className="flex-1 truncate">{valor}</span>
              <span className="text-xs text-muted-foreground">{n}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

type FacetKey = "rubro" | "activo" | "tipo" | "fecha";

export function FichaArticulosView() {
  const [busqueda, setBusqueda] = useState("");
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [activoSel, setActivoSel] = useState<Set<string>>(new Set());
  const [tipoSel, setTipoSel] = useState<Set<string>>(new Set());
  const [fechaSel, setFechaSel] = useState<Set<string>>(new Set());
  const [imgArticulo, setImgArticulo] = useState<FichaExistencia | null>(null);
  const [mesesVisibles, setMesesVisibles] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ficha-existencia", COD_EMPRESA],
    queryFn: () => listarFichaExistencia(COD_EMPRESA),
    retry: false,
  });

  const todas = useMemo(() => data ?? [], [data]);

  // Meses con datos (yyyy-mm) del más reciente al más antiguo.
  const meses = useMemo(() => {
    const set = new Set<string>();
    for (const r of todas) if (r.fec_comprobante) set.add(r.fec_comprobante.slice(0, 7));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [todas]);

  const mesesMostrados = useMemo(
    () => new Set(meses.slice(0, mesesVisibles)),
    [meses, mesesVisibles],
  );
  const hayMasMeses = mesesVisibles < meses.length;

  // Registros dentro de la ventana de meses (las facetas operan sobre esto).
  const filas = useMemo(
    () => todas.filter((r) => r.fec_comprobante && mesesMostrados.has(r.fec_comprobante.slice(0, 7))),
    [todas, mesesMostrados],
  );

  const coincide = (r: FichaExistencia, ignora: FacetKey | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.desc_articulo ?? ""} ${r.codigo_oem ?? ""} ${r.tipo ?? ""} ${r.desc_rubro ?? ""} ${r.nro_comprobante ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(r.desc_rubro ?? "")) return false;
    if (ignora !== "activo" && activoSel.size > 0 && !activoSel.has(r.es_activo ?? "")) return false;
    if (ignora !== "tipo" && tipoSel.size > 0 && !tipoSel.has(r.tipo ?? "")) return false;
    if (ignora !== "fecha" && fechaSel.size > 0 && !fechaSel.has(r.fec_comprobante ?? "")) return false;
    return true;
  };

  const facet = (
    campo: "desc_rubro" | "es_activo" | "tipo" | "fec_comprobante",
    ignora: FacetKey,
  ) => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = r[campo];
      if (coincide(r, ignora) && v) c.set(String(v), (c.get(String(v)) ?? 0) + 1);
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
  const deps = [filas, busqueda, rubroSel, activoSel, tipoSel, fechaSel];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetRubro = useMemo(() => facet("desc_rubro", "rubro"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetActivo = useMemo(() => facet("es_activo", "activo"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetTipo = useMemo(() => facet("tipo", "tipo"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetFecha = useMemo(() => facet("fec_comprobante", "fecha"), deps);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setRubroSel(new Set());
    setActivoSel(new Set());
    setTipoSel(new Set());
    setFechaSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" ||
    rubroSel.size > 0 ||
    activoSel.size > 0 ||
    tipoSel.size > 0 ||
    fechaSel.size > 0;

  const COLUMNAS: Column<FichaExistencia>[] = [
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
      key: "codigo_oem",
      header: "Cód. OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) => r.codigo_oem || "—",
    },
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => fechaOrden(r.fec_comprobante),
      render: (r) => fmtFecha(r.fec_comprobante),
      footer: () => "Total",
    },
    {
      key: "tipo",
      header: "Tipo",
      accessor: (r) => r.tipo ?? "",
      render: (r) => r.tipo || "—",
    },
    {
      key: "desc_articulo",
      header: "Artículo",
      accessor: (r) => r.desc_articulo ?? "",
      hideable: false,
    },
    {
      key: "nro_comprobante",
      header: "Nro.",
      num: true,
      accessor: (r) => r.nro_comprobante ?? 0,
      render: (r) => (r.nro_comprobante == null ? "—" : <span className="font-mono">{r.nro_comprobante}</span>),
    },
    {
      key: "cantidad",
      header: "Cantidad",
      num: true,
      accessor: (r) => r.cantidad ?? 0,
      render: (r) => <span className="font-mono font-semibold">{fmtNum(r.cantidad)}</span>,
      footer: (rows) => (
        <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.cantidad ?? 0), 0))}</span>
      ),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Ficha de Artículos</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} movimientos
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
          {error instanceof Error ? error.message : "No se pudo cargar la ficha"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin movimientos para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-4">
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
              titulo="Rubro"
              valores={facetRubro}
              seleccion={rubroSel}
              onToggle={(v) => toggle(rubroSel, setRubroSel, v)}
            />
            <Faceta
              titulo="Tipo"
              valores={facetTipo}
              seleccion={tipoSel}
              onToggle={(v) => toggle(tipoSel, setTipoSel, v)}
            />
            <Faceta
              titulo="¿Activo?"
              valores={facetActivo}
              seleccion={activoSel}
              onToggle={(v) => toggle(activoSel, setActivoSel, v)}
            />
            <Faceta
              titulo="Fecha"
              valores={facetFecha}
              seleccion={fechaSel}
              onToggle={(v) => toggle(fechaSel, setFechaSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r, i) => `${r.id_articulo}|${r.nro_comprobante}|${r.fec_comprobante}|${i}`}
              exportName="ficha-articulos"
              initialSort={{ key: "fecha", dir: "desc" }}
            />
            {hayMasMeses && (
              <div className="mt-4 flex flex-col items-center gap-1">
                <p className="text-xs text-muted-foreground">
                  Mostrando {mesesVisibles} {mesesVisibles === 1 ? "mes" : "meses"} de {meses.length}
                </p>
                <Button variant="outline" size="sm" onClick={() => setMesesVisibles((n) => n + 1)}>
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
        titulo={imgArticulo?.desc_articulo}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}
