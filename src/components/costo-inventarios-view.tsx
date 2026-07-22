import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listarCostoInventarios, type CostoInventario } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Filtro binario como botones (Si/No), single-select.
function FiltroBinario({
  titulo,
  valor,
  onChange,
  valSi = "S",
  valNo = "N",
}: {
  titulo: string;
  valor: string | null;
  onChange: (v: string | null) => void;
  valSi?: string;
  valNo?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{titulo}</p>
      <div className="flex gap-2">
        {[
          { v: valSi, label: "Sí" },
          { v: valNo, label: "No" },
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

export function CostoInventariosView() {
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState(""); // YYYY-MM-DD; vacío = default del backend
  const [hasta, setHasta] = useState("");
  const [cerradoSel, setCerradoSel] = useState<string | null>(null);
  const [difSel, setDifSel] = useState<string | null>(null); // 'Si' | 'No'

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["costo-inventarios", COD_EMPRESA, desde, hasta],
    queryFn: () => listarCostoInventarios(COD_EMPRESA, desde || undefined, hasta || undefined),
    retry: false,
  });

  const filas = useMemo(() => data?.data ?? [], [data]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((r) => {
      if (q) {
        const txt = `${r.descripcion ?? ""} ${r.codigo_oem ?? ""}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      if (cerradoSel != null && (r.cerrado ?? "N") !== cerradoSel) return false;
      if (difSel != null && (r.con_diferencia ?? "No") !== difSel) return false;
      return true;
    });
  }, [filas, busqueda, cerradoSel, difSel]);

  const limpiar = () => {
    setBusqueda("");
    setDesde("");
    setHasta("");
    setCerradoSel(null);
    setDifSel(null);
  };

  const hayFiltro =
    busqueda.trim() !== "" || desde !== "" || hasta !== "" || cerradoSel != null || difSel != null;

  const COLUMNAS: Column<CostoInventario>[] = [
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha ?? "",
      render: (r) => fmtFecha(r.fecha),
      className: "w-28",
      footer: () => "Total",
    },
    {
      key: "descripcion",
      header: "Artículo",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
    },
    {
      key: "cantidad_sistema",
      header: "Cantidad Sistema",
      num: true,
      accessor: (r) => r.cantidad_sistema ?? 0,
      render: (r) => fmtNum(r.cantidad_sistema),
    },
    {
      key: "cantidad_fisica",
      header: "Cantidad Física",
      num: true,
      accessor: (r) => r.cantidad_fisica ?? 0,
      render: (r) => fmtNum(r.cantidad_fisica),
    },
    {
      key: "diferencia",
      header: "Diferencia",
      num: true,
      accessor: (r) => r.diferencia ?? 0,
      render: (r) => {
        const d = r.diferencia ?? 0;
        return (
          <span className={d === 0 ? "" : d > 0 ? "text-emerald-600" : "text-destructive"}>
            {d > 0 ? "+" : ""}
            {fmtNum(d)}
          </span>
        );
      },
    },
    {
      key: "costo_ultimo",
      header: "Costo Último",
      num: true,
      accessor: (r) => r.costo_ultimo ?? 0,
      render: (r) => fmtNum(r.costo_ultimo),
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
          <h2 className="font-display text-xl font-bold">Costo de Inventarios</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} registros
            {data?.fecha_desde && data?.fecha_hasta && (
              <>
                {" "}
                · {fmtFecha(data.fecha_desde)} a {fmtFecha(data.fecha_hasta)}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.fecha_inicio_inventario && (
            <span className="rounded-lg bg-sky-100 px-3 py-1.5 text-sm font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
              Inicio de Inventario: {data.fecha_inicio_inventario}
            </span>
          )}
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
          {error instanceof Error ? error.message : "No se pudo cargar el costo de inventarios"}
        </p>
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
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Fecha Desde</p>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Fecha Hasta</p>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <FiltroBinario titulo="¿Cerrado?" valor={cerradoSel} onChange={setCerradoSel} />
            <FiltroBinario
              titulo="¿Con diferencia?"
              valor={difSel}
              onChange={setDifSel}
              valSi="Si"
              valNo="No"
            />
          </aside>

          <div className="min-w-0">
            {filas.length === 0 ? (
              <div className="grid place-items-center py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <CircleDollarSign className="h-6 w-6" />
                </div>
                <p className="mt-4 font-medium">Sin registros de inventario en el rango</p>
              </div>
            ) : (
              <DataTable
                columns={COLUMNAS}
                rows={filasFiltradas}
                getRowId={(r) => r.id_inventario}
                exportName="costo-inventarios"
                initialSort={{ key: "fecha", dir: "desc" }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
