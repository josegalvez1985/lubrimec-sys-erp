import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listarMarcasVsDescripcion, type MarcaVsDescripcion } from "@/lib/api";

const COD_EMPRESA = 24;

const COLUMNAS: Column<MarcaVsDescripcion>[] = [
  {
    key: "id_articulo",
    header: "ID",
    num: true,
    accessor: (r) => r.id_articulo,
    render: (r) => <span className="font-mono">{r.id_articulo}</span>,
    className: "w-20",
  },
  {
    key: "descripcion",
    header: "Descripción",
    accessor: (r) => r.descripcion ?? "",
    hideable: false,
  },
  {
    key: "marca",
    header: "Marca (falta en la descripción)",
    accessor: (r) => r.marca ?? "",
    render: (r) => r.marca || "—",
  },
];

export function MarcasVsDescripcionView() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["marcas-vs-descripcion", COD_EMPRESA],
    queryFn: () => listarMarcasVsDescripcion(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold">Marcas Vs Descripción de Artículos</h2>
        <p className="text-sm text-muted-foreground">
          {filas.length} artículos cuya descripción no incluye su marca
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los artículos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ListChecks className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Todas las descripciones incluyen su marca</p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_articulo}
            exportName="marcas-vs-descripcion"
            initialSort={{ key: "id_articulo", dir: "desc" }}
          />
        </div>
      )}
    </div>
  );
}
