import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { listarSaldosProveedores, type SaldoProveedor } from "@/lib/api";

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

type FacetKey = "nombre" | "factura" | "saldo";

export function SaldosProveedoresView() {
  const [busqueda, setBusqueda] = useState("");
  const [nombreSel, setNombreSel] = useState<Set<string>>(new Set());
  const [facturaSel, setFacturaSel] = useState<Set<string>>(new Set());
  const [saldoSel, setSaldoSel] = useState<string | null>(null); // single-select

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["saldos-proveedores", COD_EMPRESA],
    queryFn: () => listarSaldosProveedores(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  const coincide = (r: SaldoProveedor, ignora: FacetKey | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.nro_factura ?? ""} ${r.nombre ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "nombre" && nombreSel.size > 0 && !nombreSel.has(r.nombre ?? "")) return false;
    if (ignora !== "factura" && facturaSel.size > 0 && !facturaSel.has(r.nro_factura ?? "")) return false;
    if (ignora !== "saldo" && saldoSel != null && (r.saldo ?? "") !== saldoSel) return false;
    return true;
  };

  const facet = (campo: "nombre" | "nro_factura", ignora: FacetKey) => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = r[campo];
      if (coincide(r, ignora) && v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    return [...c.entries()]
      .map(([valor, n]) => ({ valor, n }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deps = [filas, busqueda, nombreSel, facturaSel, saldoSel];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetNombre = useMemo(() => facet("nombre", "nombre"), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetFactura = useMemo(() => facet("nro_factura", "factura"), deps);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  // Saldo total pendiente = SUM(total_factura) − SUM(total_pago) de lo filtrado.
  const totalFactura = filasFiltradas.reduce((a, r) => a + (r.total_factura ?? 0), 0);
  const totalPago = filasFiltradas.reduce((a, r) => a + (r.total_pago ?? 0), 0);
  const saldoPendiente = totalFactura - totalPago;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setNombreSel(new Set());
    setFacturaSel(new Set());
    setSaldoSel(null);
  };

  const hayFiltro =
    busqueda.trim() !== "" || nombreSel.size > 0 || facturaSel.size > 0 || saldoSel != null;

  const COLUMNAS: Column<SaldoProveedor>[] = [
    {
      key: "fec_comprobante",
      header: "Fec. Comprobante",
      accessor: (r) => fechaOrden(r.fec_comprobante),
      render: (r) => fmtFecha(r.fec_comprobante),
      footer: () => "Total",
    },
    {
      key: "nro_factura",
      header: "Nro. Factura",
      accessor: (r) => r.nro_factura ?? "",
      render: (r) => <span className="font-mono">{r.nro_factura || "—"}</span>,
      hideable: false,
    },
    {
      key: "nombre",
      header: "Proveedor",
      accessor: (r) => r.nombre ?? "",
      render: (r) => r.nombre || "—",
    },
    {
      key: "fec_proximo_pago",
      header: "Próx. Pago",
      accessor: (r) => fechaOrden(r.fec_proximo_pago),
      render: (r) => fmtFecha(r.fec_proximo_pago),
    },
    {
      key: "fec_pago",
      header: "Fecha Pago",
      accessor: (r) => fechaOrden(r.fec_pago),
      render: (r) => fmtFecha(r.fec_pago),
    },
    {
      key: "forma_pago",
      header: "Forma Pago",
      accessor: (r) => r.forma_pago ?? "",
      render: (r) => r.forma_pago || "—",
    },
    {
      key: "total_factura",
      header: "Total Factura",
      num: true,
      accessor: (r) => r.total_factura ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.total_factura)}</span>,
      footer: (rows) => (
        <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total_factura ?? 0), 0))}</span>
      ),
    },
    {
      key: "total_pago",
      header: "Total Pago",
      num: true,
      accessor: (r) => r.total_pago ?? 0,
      render: (r) => <span className="font-mono">{fmtNum(r.total_pago)}</span>,
      footer: (rows) => (
        <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total_pago ?? 0), 0))}</span>
      ),
    },
    {
      key: "saldo",
      header: "Saldo",
      accessor: (r) => r.saldo ?? "",
      render: (r) =>
        r.saldo === "S" ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
            Pendiente
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
            Pagada
          </Badge>
        ),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Saldos de Proveedores</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} movimientos
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
          {error instanceof Error ? error.message : "No se pudieron cargar los saldos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin movimientos para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar factura o proveedor..."
                className="pl-10"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">¿Saldo?</p>
              <div className="flex gap-2">
                {[
                  { v: "S", label: "Pendiente" },
                  { v: "N", label: "Pagada" },
                ].map(({ v, label }) => (
                  <Button
                    key={v}
                    type="button"
                    variant={saldoSel === v ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSaldoSel((prev) => (prev === v ? null : v))}
                    className="flex-1"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <Faceta
              titulo="Proveedor"
              valores={facetNombre}
              seleccion={nombreSel}
              onToggle={(v) => toggle(nombreSel, setNombreSel, v)}
            />
            <Faceta
              titulo="Factura"
              valores={facetFactura}
              seleccion={facturaSel}
              onToggle={(v) => toggle(facturaSel, setFacturaSel, v)}
            />
          </aside>

          <div className="min-w-0 space-y-4">
            {/* Saldo total pendiente */}
            <div
              className={`rounded-xl border p-4 ${
                saldoPendiente > 0
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-emerald-500/30 bg-emerald-500/10"
              }`}
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Saldo total pendiente
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                ₲ {fmtNum(saldoPendiente)}
              </p>
            </div>

            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r, i) => `${r.id_factura}|${r.fec_pago ?? ""}|${i}`}
              exportName="saldos-proveedores"
              initialSort={{ key: "fec_comprobante", dir: "asc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
