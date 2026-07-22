import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { listarComisionesBanco } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const MESES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

export function ComisionesBancoView() {
  const [busqueda, setBusqueda] = useState("");
  const [anioSel, setAnioSel] = useState<Set<string>>(new Set());
  const [mesSel, setMesSel] = useState<Set<string>>(new Set());
  const [formaSel, setFormaSel] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["comisiones-banco", COD_EMPRESA],
    queryFn: () => listarComisionesBanco(COD_EMPRESA),
    retry: false,
  });

  // mesLabel se deriva una sola vez: la faceta y el filtro usan el mismo valor.
  const filas = useMemo(
    () => (data ?? []).map((r) => ({ ...r, mesLabel: MESES[r.mes ?? ""] ?? r.mes ?? "" })),
    [data],
  );
  type Fila = (typeof filas)[number];

  const coincide = (r: Fila, ignora: "anio" | "mes" | "forma" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (
      q &&
      !`${r.forma_pago ?? ""} ${r.nro_transaccion ?? ""} ${r.observacion ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (ignora !== "anio" && anioSel.size > 0 && !anioSel.has(r.anio ?? "")) return false;
    if (ignora !== "mes" && mesSel.size > 0 && !mesSel.has(r.mesLabel)) return false;
    if (ignora !== "forma" && formaSel.size > 0 && !formaSel.has(r.forma_pago ?? "")) return false;
    return true;
  };

  const facet = (campo: (r: Fila) => string, ignora: "anio" | "mes" | "forma") => {
    const vals = new Set<string>();
    for (const r of filas) {
      const v = campo(r);
      if (coincide(r, ignora) && v) vals.add(v);
    }
    return [...vals].sort().map((valor) => ({ valor, n: 0 }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deps = [filas, busqueda, anioSel, mesSel, formaSel];
  const facetAnio = useMemo(
    () => facet((r) => r.anio ?? "", "anio").sort((a, b) => b.valor.localeCompare(a.valor)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetMes = useMemo(() => facet((r) => r.mesLabel, "mes"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetForma = useMemo(() => facet((r) => r.forma_pago ?? "", "forma"), deps);

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
    setMesSel(new Set());
    setFormaSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" || anioSel.size > 0 || mesSel.size > 0 || formaSel.size > 0;

  const COLUMNAS: Column<Fila>[] = [
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha ?? "",
      render: (r) => fmtFecha(r.fecha),
      className: "w-28",
      footer: () => "Total",
    },
    {
      key: "forma_pago",
      header: "Forma",
      accessor: (r) => r.forma_pago ?? "",
      hideable: false,
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
      key: "monto_acreditado",
      header: "Monto Acreditado",
      num: true,
      accessor: (r) => r.monto_acreditado ?? 0,
      render: (r) => fmtNum(r.monto_acreditado),
      footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.monto_acreditado ?? 0), 0)),
    },
    {
      key: "comision_banco",
      header: "Comisión Banco",
      num: true,
      accessor: (r) => r.comision_banco ?? 0,
      render: (r) => <span className="font-medium">{fmtNum(r.comision_banco)}</span>,
      footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.comision_banco ?? 0), 0)),
    },
    {
      key: "porc_comision",
      header: "Comisión %",
      num: true,
      accessor: (r) => r.porc_comision ?? 0,
      render: (r) => (r.porc_comision == null ? "—" : `${r.porc_comision}%`),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Comisiones al Banco</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} cobros
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
          {error instanceof Error ? error.message : "No se pudieron cargar las comisiones"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Banknote className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin cobros con comisión bancaria</p>
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
            <Faceta titulo="Mes" valores={facetMes} seleccion={mesSel} onToggle={(v) => toggle(mesSel, setMesSel, v)} />
            <Faceta titulo="Forma Pago" valores={facetForma} seleccion={formaSel} onToggle={(v) => toggle(formaSel, setFormaSel, v)} />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_cobro}
              exportName="comisiones-banco"
              initialSort={{ key: "fecha", dir: "desc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
