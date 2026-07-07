import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Search, X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import { listarInventarios, type Inventario } from "@/lib/api";

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

type FacetKey = "fecha" | "rubro" | "marca" | "cerrado" | "dif" | "activo";

// Filtro binario como botones (Si/No), single-select.
function FiltroBinario({
  titulo,
  valor,
  onChange,
  labelSi = "Si",
  labelNo = "No",
  valSi = "S",
  valNo = "N",
}: {
  titulo: string;
  valor: string | null;
  onChange: (v: string | null) => void;
  labelSi?: string;
  labelNo?: string;
  valSi?: string;
  valNo?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{titulo}</p>
      <div className="flex gap-2">
        {[
          { v: valSi, label: labelSi },
          { v: valNo, label: labelNo },
        ].map(({ v, label }) => (
          <Button
            key={v}
            type="button"
            variant={valor === v ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(valor === v ? null : v)}
            className="flex-1"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ConsultaInventariosView() {
  const [busqueda, setBusqueda] = useState("");
  const [fechaSel, setFechaSel] = useState<Set<string>>(new Set());
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [marcaSel, setMarcaSel] = useState<Set<string>>(new Set());
  const [cerradoSel, setCerradoSel] = useState<string | null>(null);
  const [difSel, setDifSel] = useState<string | null>(null); // 'Si' | 'No'
  const [activoSel, setActivoSel] = useState<string | null>(null);
  const [imgArticulo, setImgArticulo] = useState<Inventario | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventarios", COD_EMPRESA],
    queryFn: () => listarInventarios(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  const coincide = (r: Inventario, ignora: FacetKey | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.descripcion ?? ""} ${r.codigo_oem ?? ""} ${r.marca ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "fecha" && fechaSel.size > 0 && !fechaSel.has(r.fecha ?? "")) return false;
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(r.rubro ?? "")) return false;
    if (ignora !== "marca" && marcaSel.size > 0 && !marcaSel.has(r.marca ?? "")) return false;
    if (ignora !== "cerrado" && cerradoSel != null && (r.cerrado ?? "N") !== cerradoSel) return false;
    if (ignora !== "dif" && difSel != null && (r.con_diferencia ?? "No") !== difSel) return false;
    if (ignora !== "activo" && activoSel != null && (r.es_activo ?? "") !== activoSel) return false;
    return true;
  };

  const facet = (campo: "fecha" | "rubro" | "marca", ignora: FacetKey) => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = r[campo];
      if (coincide(r, ignora) && v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    const items = [...c.entries()].map(([valor, n]) => ({ valor, n }));
    if (campo === "fecha") items.sort((a, b) => fechaOrden(b.valor) - fechaOrden(a.valor));
    else items.sort((a, b) => a.valor.localeCompare(b.valor));
    return items;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deps = [filas, busqueda, fechaSel, rubroSel, marcaSel, cerradoSel, difSel, activoSel];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetFecha = useMemo(() => facet("fecha", "fecha"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetRubro = useMemo(() => facet("rubro", "rubro"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetMarca = useMemo(() => facet("marca", "marca"), deps);

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

  const fmtFechaFaceta = (iso: string) => fmtFecha(iso);

  const limpiar = () => {
    setBusqueda("");
    setFechaSel(new Set());
    setRubroSel(new Set());
    setMarcaSel(new Set());
    setCerradoSel(null);
    setDifSel(null);
    setActivoSel(null);
  };

  const hayFiltro =
    busqueda.trim() !== "" ||
    fechaSel.size > 0 ||
    rubroSel.size > 0 ||
    marcaSel.size > 0 ||
    cerradoSel != null ||
    difSel != null ||
    activoSel != null;

  const COLUMNAS: Column<Inventario>[] = [
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
      key: "descripcion",
      header: "Artículo",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
    },
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => fechaOrden(r.fecha),
      render: (r) => fmtFecha(r.fecha),
    },
    {
      key: "cantidad_fisica",
      header: "Física",
      num: true,
      accessor: (r) => r.cantidad_fisica ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.cantidad_fisica)}</span>,
    },
    {
      key: "cantidad_sistema",
      header: "Sistema",
      num: true,
      accessor: (r) => r.cantidad_sistema ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.cantidad_sistema)}</span>,
    },
    {
      key: "diferencia",
      header: "Diferencia",
      num: true,
      accessor: (r) => r.diferencia ?? 0,
      render: (r) => {
        const d = r.diferencia ?? 0;
        return (
          <span
            className={`font-mono font-semibold ${
              d === 0 ? "" : d > 0 ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {d > 0 ? "+" : ""}
            {fmtNum(d)}
          </span>
        );
      },
    },
    {
      key: "cerrado",
      header: "Cerrado",
      accessor: (r) => r.cerrado ?? "",
      render: (r) =>
        r.cerrado === "S" ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
            Sí
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
            No
          </Badge>
        ),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Consulta de Inventarios</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} artículos
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
          {error instanceof Error ? error.message : "No se pudo cargar el inventario"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin inventarios para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar artículo, OEM o marca..."
                className="pl-10"
              />
            </div>
            <FiltroBinario titulo="¿Con diferencia?" valor={difSel} onChange={setDifSel} labelSi="Si" labelNo="No" valSi="Si" valNo="No" />
            <FiltroBinario titulo="¿Cerrado?" valor={cerradoSel} onChange={setCerradoSel} labelSi="Sí" labelNo="No" />
            <FiltroBinario titulo="¿Es activo?" valor={activoSel} onChange={setActivoSel} labelSi="Sí" labelNo="No" />
            <Faceta
              titulo="Fecha"
              valores={facetFecha.map((f) => ({ valor: fmtFechaFaceta(f.valor), n: f.n }))}
              seleccion={new Set([...fechaSel].map(fmtFechaFaceta))}
              onToggle={(fechaFmt) => {
                // Mapear la fecha formateada de vuelta al ISO original.
                const iso = facetFecha.find((f) => fmtFechaFaceta(f.valor) === fechaFmt)?.valor ?? fechaFmt;
                toggle(fechaSel, setFechaSel, iso);
              }}
            />
            <Faceta
              titulo="Rubro"
              valores={facetRubro}
              seleccion={rubroSel}
              onToggle={(v) => toggle(rubroSel, setRubroSel, v)}
            />
            <Faceta
              titulo="Marca"
              valores={facetMarca}
              seleccion={marcaSel}
              onToggle={(v) => toggle(marcaSel, setMarcaSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_inventario}
              exportName="inventarios"
              initialSort={{ key: "fecha", dir: "desc" }}
            />
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
