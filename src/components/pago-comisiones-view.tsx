import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { listarAniosVentas, listarComisiones, type Comision } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

export function PagoComisionesView() {
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState<string | undefined>(undefined);
  const [busqueda, setBusqueda] = useState("");
  const [semanaSel, setSemanaSel] = useState<Set<string>>(new Set());
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [vendedorSel, setVendedorSel] = useState<Set<string>>(new Set());

  const aniosQuery = useQuery({
    queryKey: ["ventas-anios", COD_EMPRESA],
    queryFn: () => listarAniosVentas(COD_EMPRESA),
    retry: false,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["comisiones", COD_EMPRESA, anio, mes],
    queryFn: () => listarComisiones(anio, mes, COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data?.comisiones ?? [], [data]);

  const coincide = (r: Comision, ignora: "semana" | "rubro" | "vendedor" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (
      q &&
      !`${r.descripcion ?? ""} ${r.mes_anio ?? ""} ${r.fec_comprobante_filtro ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (ignora !== "semana" && semanaSel.size > 0 && !semanaSel.has(r.semana)) return false;
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(r.rubro ?? "")) return false;
    if (ignora !== "vendedor" && vendedorSel.size > 0 && !vendedorSel.has(r.vendedor ?? ""))
      return false;
    return true;
  };

  const facet = (campo: (r: Comision) => string, ignora: "semana" | "rubro" | "vendedor") => {
    const vals = new Set<string>();
    for (const r of filas) {
      const v = campo(r);
      if (coincide(r, ignora) && v) vals.add(v);
    }
    return [...vals].sort().map((valor) => ({ valor, n: 0 }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deps = [filas, busqueda, semanaSel, rubroSel, vendedorSel];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetSemana = useMemo(() => facet((r) => r.semana, "semana"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetRubro = useMemo(() => facet((r) => r.rubro ?? "", "rubro"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetVendedor = useMemo(() => facet((r) => r.vendedor ?? "", "vendedor"), deps);

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
    setSemanaSel(new Set());
    setRubroSel(new Set());
    setVendedorSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" || semanaSel.size > 0 || rubroSel.size > 0 || vendedorSel.size > 0;

  const MESES = [
    ["01", "Ene"], ["02", "Feb"], ["03", "Mar"], ["04", "Abr"],
    ["05", "May"], ["06", "Jun"], ["07", "Jul"], ["08", "Ago"],
    ["09", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dic"],
  ] as const;

  const COLUMNAS: Column<Comision>[] = [
    {
      key: "fec_comprobante",
      header: "Fecha",
      accessor: (r) => r.fec_comprobante_filtro,
      className: "w-32",
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
    },
    {
      key: "cantidad",
      header: "Cant.",
      num: true,
      accessor: (r) => r.cantidad ?? 0,
      render: (r) => fmtNum(r.cantidad),
    },
    {
      key: "total",
      header: "Total Venta",
      num: true,
      accessor: (r) => r.total ?? 0,
      render: (r) => fmtNum(r.total),
    },
    {
      key: "vendedor",
      header: "Vendedor",
      accessor: (r) => r.vendedor ?? "",
      render: (r) => r.vendedor || "—",
    },
    {
      key: "porc_comision",
      header: "% Comisión",
      num: true,
      accessor: (r) => r.porc_comision,
      render: (r) => `${r.porc_comision}%`,
    },
    {
      key: "comision",
      header: "Comisión",
      num: true,
      accessor: (r) => r.comision ?? 0,
      render: (r) => <span className="font-medium">{fmtNum(r.comision)}</span>,
      footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.comision ?? 0), 0)),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Pago de Comisiones</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} ventas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {(aniosQuery.data ?? [{ anio: String(new Date().getFullYear()) }]).map((a) => (
              <option key={a.anio} value={a.anio}>
                {a.anio}
              </option>
            ))}
          </select>
          <select
            value={mes ?? ""}
            onChange={(e) => setMes(e.target.value || undefined)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los meses</option>
            {MESES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          {hayFiltro && (
            <Button variant="outline" size="sm" onClick={limpiar} className="shrink-0">
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
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
          {error instanceof Error ? error.message : "No se pudieron cargar las comisiones"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <HandCoins className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin ventas en el período seleccionado</p>
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
              titulo="Vendedor"
              valores={facetVendedor}
              seleccion={vendedorSel}
              onToggle={(v) => toggle(vendedorSel, setVendedorSel, v)}
            />
            <Faceta
              titulo="Rubro"
              valores={facetRubro}
              seleccion={rubroSel}
              onToggle={(v) => toggle(rubroSel, setRubroSel, v)}
            />
            <Faceta
              titulo="Semana"
              valores={facetSemana}
              seleccion={semanaSel}
              onToggle={(v) => toggle(semanaSel, setSemanaSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => `${r.fec_comprobante}-${r.descripcion}-${r.vendedor}`}
              exportName="pago-comisiones"
              initialSort={{ key: "fec_comprobante", dir: "desc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
