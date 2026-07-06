import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listarPostVenta, type PostVenta } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const COLUMNAS: Column<PostVenta>[] = [
  {
    key: "nro_telefono",
    header: "Nro Teléfono",
    accessor: (r) => r.nro_telefono,
    render: (r) => <span className="font-mono">{r.nro_telefono}</span>,
    hideable: false,
  },
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => (r.fecha ? fmtFecha(r.fecha) : "—"),
  },
];

export function PostVentaView() {
  const [busqueda, setBusqueda] = useState("");
  const [fechasSel, setFechasSel] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["post-venta", COD_EMPRESA],
    queryFn: () => listarPostVenta(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  // Facet de Fecha: valores distintos con su conteo (desc por fecha).
  const facetFechas = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const f of filas) if (f.fecha) conteo.set(f.fecha, (conteo.get(f.fecha) ?? 0) + 1);
    return [...conteo.entries()]
      .map(([fecha, n]) => ({ fecha, n }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [filas]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (fechasSel.size > 0 && !fechasSel.has(f.fecha)) return false;
      if (q && !`${f.nro_telefono} ${f.fecha}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filas, busqueda, fechasSel]);

  const toggleFecha = (fecha: string) =>
    setFechasSel((prev) => {
      const next = new Set(prev);
      if (next.has(fecha)) next.delete(fecha);
      else next.add(fecha);
      return next;
    });

  const limpiar = () => {
    setBusqueda("");
    setFechasSel(new Set());
  };

  const hayFiltro = busqueda.trim() !== "" || fechasSel.size > 0;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Post Venta</h2>
          <p className="text-sm text-muted-foreground">
            Teléfonos de clientes con ventas registradas
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los datos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Phone className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin teléfonos de post venta</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            No hay ventas con número de teléfono registrado.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          {/* Panel de búsqueda facetada */}
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

            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-semibold">Fecha</div>
              <div className="max-h-72 space-y-1 overflow-auto p-2">
                {facetFechas.map(({ fecha, n }) => (
                  <label
                    key={fecha}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={fechasSel.has(fecha)}
                      onCheckedChange={() => toggleFecha(fecha)}
                    />
                    <span className="flex-1">{fmtFecha(fecha)}</span>
                    <span className="text-xs text-muted-foreground">{n}</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* Resultados */}
          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => `${r.nro_telefono}|${r.fecha}`}
              exportName="post-venta"
              initialSort={{ key: "fecha", dir: "desc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
