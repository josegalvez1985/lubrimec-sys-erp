import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import {
  comprasVsVentas,
  type CompraVsFila,
  type VentaVsFila,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const mesDe = (iso: string | null) => (iso ? iso.slice(5, 7) : "");

const MESES: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};
const nombreMes = (mm: string) => MESES[mm] ?? mm;

export function ComprasVsVentasView() {
  const anioActual = String(new Date().getFullYear());
  const mesActual = String(new Date().getMonth() + 1).padStart(2, "0");
  // Año, mes y activo son single-select (a lo sumo un valor cada uno).
  // Por defecto: año y mes actuales.
  const [anioSel, setAnioSel] = useState(anioActual);
  const [mesSel, setMesSel] = useState<string | null>(mesActual);
  const [activoSel, setActivoSel] = useState<string | null>(null);
  // Artículo cuya imagen se muestra (de cualquiera de las dos grillas).
  const [imgArticulo, setImgArticulo] = useState<{ id: number; desc: string | null } | null>(null);

  const anioQuery = anioSel;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["compras-vs-ventas", COD_EMPRESA, anioQuery],
    queryFn: () => comprasVsVentas(COD_EMPRESA, anioQuery),
    retry: false,
  });

  const comprasTodas = useMemo(() => data?.compras ?? [], [data]);
  const ventasTodas = useMemo(() => data?.ventas ?? [], [data]);
  const anios = data?.anios ?? [];

  // Filtro por mes (front). Activo aplica solo a compras (el APEX filtra compras
  // por es_activo; ventas no tienen ese filtro).
  const pasaMes = (iso: string | null) => mesSel == null || mesSel === mesDe(iso);
  const pasaActivo = (v: string | null) => activoSel == null || activoSel === (v ?? "");

  const compras = useMemo(
    () => comprasTodas.filter((c) => pasaMes(c.fec_comprobante) && pasaActivo(c.es_activo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comprasTodas, mesSel, activoSel],
  );
  const ventas = useMemo(
    () => ventasTodas.filter((v) => pasaMes(v.fec_comprobante)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventasTodas, mesSel],
  );

  // Toggle single-select: si el valor ya está elegido lo deselecciona, si no lo fija.
  const single = (actual: string | null, v: string) => (actual === v ? null : v);

  // Resumen: ganancia = SUM(rentabilidad ventas) − SUM(total compras).
  const totalCompras = compras.reduce((a, c) => a + (c.total ?? 0), 0);
  const totalRent = ventas.reduce((a, v) => a + (v.rentabilidad ?? 0), 0);
  const ganancia = totalRent - totalCompras;

  // Meses disponibles (de ambos datasets del año), para la faceta. Sin conteo.
  const facetMes = useMemo(() => {
    const set = new Set<string>();
    for (const r of [...comprasTodas, ...ventasTodas]) {
      const mm = mesDe(r.fec_comprobante);
      if (mm) set.add(mm);
    }
    return [...set].sort((a, b) => b.localeCompare(a)).map((mm) => ({ valor: mm, n: 0 }));
  }, [comprasTodas, ventasTodas]);

  const limpiar = () => {
    setAnioSel(anioActual);
    setMesSel(mesActual);
    setActivoSel(null);
  };
  const hayFiltro =
    activoSel != null || anioQuery !== anioActual || mesSel !== mesActual;

  // Columna de imagen del artículo (misma para ambas grillas).
  const colImg = <T extends { id_articulo: number | null; descripcion: string | null }>(): Column<T> => ({
    key: "img",
    header: "Img",
    sortable: false,
    filterable: false,
    className: "w-14",
    render: (r) =>
      r.id_articulo == null ? (
        "—"
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setImgArticulo({ id: r.id_articulo as number, desc: r.descripcion })}
          aria-label="Ver imagen del artículo"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      ),
  });

  const COLS_COMPRAS: Column<CompraVsFila>[] = [
    colImg<CompraVsFila>(),
    { key: "referencia", header: "Referencia", accessor: (r) => r.referencia ?? "", render: (r) => r.referencia || "—" },
    { key: "proveedor", header: "Proveedor", accessor: (r) => r.proveedor ?? "", render: (r) => r.proveedor || "—" },
    {
      key: "fec",
      header: "Fecha",
      accessor: (r) => r.fec_comprobante ?? "",
      render: (r) => fmtFecha(r.fec_comprobante),
      footer: () => "Total",
    },
    { key: "descripcion", header: "Descripción", accessor: (r) => r.descripcion ?? "", hideable: false },
    { key: "cantidad", header: "Cant.", num: true, accessor: (r) => r.cantidad ?? 0, render: (r) => <span className="font-mono">{fmtNum(r.cantidad)}</span> },
    { key: "precio", header: "Precio", num: true, accessor: (r) => r.precio ?? 0, render: (r) => <span className="font-mono">{fmtNum(r.precio)}</span> },
    {
      key: "total",
      header: "Total",
      num: true,
      accessor: (r) => r.total ?? 0,
      render: (r) => <span className="font-mono font-semibold">{fmtNum(r.total)}</span>,
      footer: (rows) => <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))}</span>,
    },
  ];

  const COLS_VENTAS: Column<VentaVsFila>[] = [
    colImg<VentaVsFila>(),
    { key: "descripcion", header: "Artículo", accessor: (r) => r.descripcion ?? "", hideable: false, footer: () => "Total" },
    {
      key: "fec",
      header: "Fecha",
      accessor: (r) => r.fec_comprobante ?? "",
      render: (r) => fmtFecha(r.fec_comprobante),
    },
    { key: "costo_ultimo", header: "Costo", num: true, accessor: (r) => r.costo_ultimo ?? 0, render: (r) => <span className="font-mono">{fmtNum(r.costo_ultimo)}</span> },
    { key: "cantidad", header: "Cant.", num: true, accessor: (r) => r.cantidad ?? 0, render: (r) => <span className="font-mono">{fmtNum(r.cantidad)}</span> },
    {
      key: "total_costo",
      header: "Total Costo",
      num: true,
      accessor: (r) => r.total_costo ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.total_costo)}</span>,
      footer: (rows) => <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total_costo ?? 0), 0))}</span>,
    },
    { key: "precio", header: "Precio", num: true, accessor: (r) => r.precio ?? 0, render: (r) => <span className="font-mono">{fmtNum(r.precio)}</span> },
    {
      key: "total",
      header: "Total",
      num: true,
      accessor: (r) => r.total ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.total)}</span>,
      footer: (rows) => <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))}</span>,
    },
    {
      key: "rentabilidad",
      header: "Rent.",
      num: true,
      accessor: (r) => r.rentabilidad ?? 0,
      render: (r) => <span className="font-mono font-semibold">{fmtNum(r.rentabilidad)}</span>,
      footer: (rows) => <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.rentabilidad ?? 0), 0))}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">Compras Vs Ventas</h2>
              <p className="text-sm text-muted-foreground">Rentabilidad del período</p>
            </div>
          </div>
          {hayFiltro && (
            <Button variant="outline" size="sm" onClick={limpiar}>
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Faceta
            titulo="Año"
            valores={anios.map((a) => ({ valor: a, n: 0 }))}
            seleccion={new Set([anioSel])}
            onToggle={(v) => setAnioSel(v)}
            limite={1}
          />
          <Faceta
            titulo="Mes"
            valores={facetMes.map((f) => ({ valor: nombreMes(f.valor), n: f.n }))}
            seleccion={new Set(mesSel ? [nombreMes(mesSel)] : [])}
            onToggle={(nombre) => {
              const mm = Object.keys(MESES).find((k) => MESES[k] === nombre) ?? nombre;
              setMesSel((prev) => single(prev, mm));
            }}
            limite={1}
          />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">¿Activos/Gastos?</p>
            <div className="flex gap-2">
              {[
                { v: "S", label: "Si" },
                { v: "N", label: "No" },
              ].map(({ v, label }) => (
                <Button
                  key={v}
                  type="button"
                  variant={activoSel === v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActivoSel((prev) => single(prev, v))}
                  className="flex-1"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resumen de ganancia */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ResumenCard label="Rentabilidad (ventas)" valor={totalRent} tono="azul" />
        <ResumenCard label="Compras (gastos)" valor={totalCompras} tono="rojo" />
        <ResumenCard label="Ganancia" valor={ganancia} tono={ganancia < 0 ? "rojo" : "verde"} resaltar />
      </div>

      {isError ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudo cargar el reporte"}
        </p>
      ) : isLoading ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Grilla Compras */}
          <div className="rounded-2xl border border-border bg-card shadow-elegant">
            <div className="border-b border-border p-4 sm:p-5">
              <h3 className="font-display text-lg font-bold">Compras</h3>
              <p className="text-sm text-muted-foreground">{compras.length} líneas</p>
            </div>
            <div className="p-4 sm:p-5">
              <DataTable
                columns={COLS_COMPRAS}
                rows={compras}
                getRowId={(r, i) => `${r.referencia}|${r.descripcion}|${i}`}
                exportName="compras"
                initialSort={{ key: "fec", dir: "desc" }}
              />
            </div>
          </div>

          {/* Grilla Ventas */}
          <div className="rounded-2xl border border-border bg-card shadow-elegant">
            <div className="border-b border-border p-4 sm:p-5">
              <h3 className="font-display text-lg font-bold">Ventas</h3>
              <p className="text-sm text-muted-foreground">{ventas.length} líneas</p>
            </div>
            <div className="p-4 sm:p-5">
              <DataTable
                columns={COLS_VENTAS}
                rows={ventas}
                getRowId={(r, i) => `${r.descripcion}|${r.fec_comprobante}|${i}`}
                exportName="ventas"
                initialSort={{ key: "fec", dir: "desc" }}
              />
            </div>
          </div>
        </>
      )}

      <ArticuloImgModal
        open={!!imgArticulo}
        id={imgArticulo ? String(imgArticulo.id) : null}
        titulo={imgArticulo?.desc}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}

const TONOS: Record<string, string> = {
  verde: "bg-emerald-500/10 border-emerald-500/30",
  azul: "bg-sky-500/10 border-sky-500/30",
  rojo: "bg-red-500/10 border-red-500/30",
};

function ResumenCard({
  label,
  valor,
  tono,
  resaltar,
}: {
  label: string;
  valor: number;
  tono: keyof typeof TONOS;
  resaltar?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-elegant ${TONOS[tono] ?? ""}`}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-bold tabular-nums ${resaltar ? "text-3xl" : "text-2xl"}`}>
        ₲ {fmtNum(valor)}
      </p>
    </div>
  );
}
