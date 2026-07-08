import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { listarAguinaldos, type Aguinaldo } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (ddmmyyyy: string | null) => ddmmyyyy ?? "—"; // ya viene DD/MM/YYYY del backend

export function AguinaldosView() {
  const [busqueda, setBusqueda] = useState("");
  const [anioSel, setAnioSel] = useState<Set<string>>(new Set());
  const [nombreSel, setNombreSel] = useState<Set<string>>(new Set());
  const [conceptoSel, setConceptoSel] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["aguinaldos", COD_EMPRESA],
    queryFn: () => listarAguinaldos(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  const coincide = (r: Aguinaldo, ignora: "anio" | "nombre" | "concepto" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (
      q &&
      !`${r.nombre ?? ""} ${r.fec_comprobante ?? ""} ${r.descripcion ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (ignora !== "anio" && anioSel.size > 0 && !anioSel.has(r.anio ?? "")) return false;
    if (ignora !== "nombre" && nombreSel.size > 0 && !nombreSel.has(r.nombre ?? "")) return false;
    if (ignora !== "concepto" && conceptoSel.size > 0 && !conceptoSel.has(r.descripcion ?? ""))
      return false;
    return true;
  };

  const facet = (campo: (r: Aguinaldo) => string | null, ignora: "anio" | "nombre" | "concepto") => {
    const vals = new Set<string>();
    for (const r of filas) {
      const v = campo(r);
      if (coincide(r, ignora) && v) vals.add(v);
    }
    return [...vals].sort().map((valor) => ({ valor, n: 0 }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deps = [filas, busqueda, anioSel, nombreSel, conceptoSel];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetAnio = useMemo(() => facet((r) => r.anio, "anio").sort((a, b) => b.valor.localeCompare(a.valor)), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetNombre = useMemo(() => facet((r) => r.nombre, "nombre"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetConcepto = useMemo(() => facet((r) => r.descripcion, "concepto"), deps);

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
    setAnioSel(new Set());
    setNombreSel(new Set());
    setConceptoSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" || anioSel.size > 0 || nombreSel.size > 0 || conceptoSel.size > 0;

  const COLUMNAS: Column<Aguinaldo>[] = [
    {
      key: "nombre",
      header: "Nombre",
      accessor: (r) => r.nombre ?? "",
      hideable: false,
      footer: () => "Total",
    },
    {
      key: "fec_comprobante",
      header: "Fecha",
      accessor: (r) => r.fec_comprobante ?? "",
      render: (r) => fmtFecha(r.fec_comprobante),
      className: "w-32",
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
    },
    {
      key: "total",
      header: "Total",
      num: true,
      accessor: (r) => r.total ?? 0,
      render: (r) => fmtNum(r.total),
      footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0)),
    },
    {
      key: "total_aguinaldo",
      header: "Total Aguinaldo",
      num: true,
      accessor: (r) => r.total_aguinaldo ?? 0,
      render: (r) => <span className="font-medium">{fmtNum(r.total_aguinaldo)}</span>,
      footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.total_aguinaldo ?? 0), 0)),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Aguinaldos</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} registros
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
          {error instanceof Error ? error.message : "No se pudieron cargar los aguinaldos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin registros de aguinaldo</p>
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
            <Faceta titulo="Año" valores={facetAnio} seleccion={anioSel} onToggle={(v) => toggle(anioSel, setAnioSel, v)} />
            <Faceta titulo="Nombre, Apellido" valores={facetNombre} seleccion={nombreSel} onToggle={(v) => toggle(nombreSel, setNombreSel, v)} />
            <Faceta titulo="Concepto" valores={facetConcepto} seleccion={conceptoSel} onToggle={(v) => toggle(conceptoSel, setConceptoSel, v)} />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => `${r.nombre}-${r.fec_comprobante}-${r.descripcion}`}
              exportName="aguinaldos"
              initialSort={{ key: "fec_comprobante", dir: "desc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
