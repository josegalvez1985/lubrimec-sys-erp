import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { listarAniosVentas, listarPagosProveedoresVentas, type PagoProveedorVenta } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

const MESES = [
  ["01", "Ene"], ["02", "Feb"], ["03", "Mar"], ["04", "Abr"],
  ["05", "May"], ["06", "Jun"], ["07", "Jul"], ["08", "Ago"],
  ["09", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dic"],
] as const;

export function PagosProveedoresVentasView() {
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [busqueda, setBusqueda] = useState("");
  const [proveedorSel, setProveedorSel] = useState<Set<string>>(new Set());

  const aniosQuery = useQuery({
    queryKey: ["ventas-anios", COD_EMPRESA],
    queryFn: () => listarAniosVentas(COD_EMPRESA),
    retry: false,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pagos-proveedores-ventas", COD_EMPRESA, anio, mes],
    queryFn: () => listarPagosProveedoresVentas(anio, mes, COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data?.pagos ?? [], [data]);

  const coincide = (r: PagoProveedorVenta, ignora: "proveedor" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q && !`${r.descripcion ?? ""} ${r.nombre ?? ""}`.toLowerCase().includes(q)) return false;
    if (ignora !== "proveedor" && proveedorSel.size > 0 && !proveedorSel.has(r.nombre ?? ""))
      return false;
    return true;
  };

  const facetProveedor = useMemo(() => {
    const vals = new Set<string>();
    for (const r of filas) {
      if (coincide(r, "proveedor") && r.nombre) vals.add(r.nombre);
    }
    return [...vals].sort().map((valor) => ({ valor, n: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, proveedorSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, proveedorSel],
  );

  const toggle = (v: string) => {
    const next = new Set(proveedorSel);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setProveedorSel(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setProveedorSel(new Set());
  };

  const hayFiltro = busqueda.trim() !== "" || proveedorSel.size > 0;

  const COLUMNAS: Column<PagoProveedorVenta>[] = [
    {
      key: "id_articulo",
      header: "ID Artículo",
      num: true,
      accessor: (r) => r.id_articulo,
      render: (r) => <span className="font-mono">{r.id_articulo}</span>,
      className: "w-28",
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
      footer: () => "Total",
    },
    {
      key: "nombre",
      header: "Proveedor",
      accessor: (r) => r.nombre ?? "",
      render: (r) => r.nombre || "—",
    },
    {
      key: "total",
      header: "Total",
      num: true,
      accessor: (r) => r.total ?? 0,
      render: (r) => <span className="font-medium">{fmtNum(r.total)}</span>,
      footer: (rows) => fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0)),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Pagos a Proveedores por Ventas</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} artículos
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
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
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
          {error instanceof Error ? error.message : "No se pudieron cargar los pagos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <HandCoins className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin artículos con saldo pendiente en el período</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar artículo o proveedor..."
                className="pl-10"
              />
            </div>
            <Faceta
              titulo="Proveedor"
              valores={facetProveedor}
              seleccion={proveedorSel}
              onToggle={toggle}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => `${r.id_articulo}-${r.nombre}`}
              exportName="pagos-proveedores-ventas"
              initialSort={{ key: "descripcion", dir: "asc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
