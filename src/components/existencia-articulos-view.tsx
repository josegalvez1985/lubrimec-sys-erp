import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Search, X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import { getSesion, listarExistencia, type ExistenciaArticulo } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

export function ExistenciaArticulosView() {
  const appUser = getSesion()?.app_user ?? "";
  const [busqueda, setBusqueda] = useState("");
  const [oemSel, setOemSel] = useState<Set<string>>(new Set());
  const [activoSel, setActivoSel] = useState<Set<string>>(new Set());
  const [imgArticulo, setImgArticulo] = useState<ExistenciaArticulo | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["existencia", COD_EMPRESA, appUser],
    queryFn: () => listarExistencia(COD_EMPRESA, appUser),
    retry: false,
  });

  const filas = useMemo(() => data?.filas ?? [], [data]);
  const veCosto = data?.ve_costo ?? false;

  const coincide = (r: ExistenciaArticulo, ignora: "oem" | "activo" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.desc_articulo ?? ""} ${r.codigo_oem ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "oem" && oemSel.size > 0 && !oemSel.has(r.codigo_oem ?? "")) return false;
    if (ignora !== "activo" && activoSel.size > 0 && !activoSel.has(r.es_activo ?? "")) return false;
    return true;
  };

  const facet = (campo: "codigo_oem" | "es_activo", ignora: "oem" | "activo") => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = r[campo];
      if (coincide(r, ignora) && v) c.set(String(v), (c.get(String(v)) ?? 0) + 1);
    }
    return [...c.entries()]
      .map(([valor, n]) => ({ valor, n }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetOem = useMemo(() => facet("codigo_oem", "oem"), [filas, busqueda, oemSel, activoSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetActivo = useMemo(() => facet("es_activo", "activo"), [filas, busqueda, oemSel, activoSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, oemSel, activoSel],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setOemSel(new Set());
    setActivoSel(new Set());
  };

  const hayFiltro = busqueda.trim() !== "" || oemSel.size > 0 || activoSel.size > 0;

  const COLUMNAS: Column<ExistenciaArticulo>[] = [
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
      key: "id_articulo",
      header: "ID",
      num: true,
      accessor: (r) => r.id_articulo,
      render: (r) => <span className="font-mono">{r.id_articulo}</span>,
      className: "w-20",
    },
    {
      key: "codigo_oem",
      header: "Cód. OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) => r.codigo_oem || "—",
    },
    {
      key: "desc_articulo",
      header: "Artículo",
      accessor: (r) => r.desc_articulo ?? "",
      hideable: false,
      footer: () => "Total",
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
    // Costos: solo si el usuario los ve (JOSEG).
    ...(veCosto
      ? ([
          {
            key: "costo_ultimo",
            header: "Costo Último",
            num: true,
            accessor: (r) => r.costo_ultimo ?? 0,
            render: (r) => <span className="font-mono">{fmtNum(r.costo_ultimo)}</span>,
          },
          {
            key: "total_costo",
            header: "Total Costo",
            num: true,
            accessor: (r) => r.total_costo ?? 0,
            render: (r) => <span className="font-mono font-semibold">{fmtNum(r.total_costo)}</span>,
            footer: (rows) => (
              <span className="font-mono">
                {fmtNum(rows.reduce((a, r) => a + (r.total_costo ?? 0), 0))}
              </span>
            ),
          },
        ] as Column<ExistenciaArticulo>[])
      : []),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Existencia de Artículos</h2>
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
          {error instanceof Error ? error.message : "No se pudo cargar la existencia"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Boxes className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin artículos para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar artículo u OEM..."
                className="pl-10"
              />
            </div>
            <Faceta
              titulo="Cód. OEM"
              valores={facetOem}
              seleccion={oemSel}
              onToggle={(v) => toggle(oemSel, setOemSel, v)}
            />
            <Faceta
              titulo="¿Activo?"
              valores={facetActivo}
              seleccion={activoSel}
              onToggle={(v) => toggle(activoSel, setActivoSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_articulo}
              exportName="existencia-articulos"
              initialSort={{ key: "cantidad", dir: "asc" }}
            />
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
