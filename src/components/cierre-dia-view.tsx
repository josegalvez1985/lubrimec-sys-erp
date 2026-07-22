import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { listarCierreDia, type CierreDiaFila } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// "dd/mm/yyyy" -> 20260706 (número ordenable cronológicamente).
const fechaOrden = (f: string | null): number => {
  if (!f) return 0;
  const [d, m, y] = f.split("/");
  return Number(`${y}${m}${d}`) || 0;
};

// Fecha de hoy en dd/mm/yyyy (mismo formato que V_COBROS_CLIENTES).
const hoyDDMMYYYY = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const COLUMNAS: Column<CierreDiaFila>[] = [
  {
    key: "fecha",
    header: "Fecha",
    // accessor numérico (yyyymmdd) para ordenar cronológicamente, no alfabético
    accessor: (r) => fechaOrden(r.fecha),
    render: (r) => r.fecha ?? "—",
    footer: () => "Total",
  },
  {
    key: "desc_forma",
    header: "Forma de Cobro",
    accessor: (r) => r.desc_forma ?? "",
    hideable: false,
  },
  { key: "nombre_banco", header: "Banco", accessor: (r) => r.nombre_banco ?? "" },
  {
    key: "nro_transaccion",
    header: "Nro. Transacción",
    accessor: (r) => r.nro_transaccion ?? "",
    render: (r) => (r.nro_transaccion ? <span className="font-mono">{r.nro_transaccion}</span> : "—"),
  },
  { key: "nombre_vendedor", header: "Vendedor", accessor: (r) => r.nombre_vendedor ?? "" },
  {
    key: "total",
    header: "Total",
    num: true,
    accessor: (r) => r.total,
    render: (r) => <span className="font-mono font-semibold">{fmtNum(r.total)}</span>,
    footer: (rows) => (
      <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))}</span>
    ),
  },
];

function Faceta({
  titulo,
  valores,
  seleccion,
  onToggle,
}: {
  titulo: string;
  valores: { valor: string; n: number }[];
  seleccion: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold">{titulo}</div>
      <div className="max-h-52 space-y-1 overflow-auto p-2">
        {valores.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">Sin valores</p>
        ) : (
          valores.map(({ valor, n }) => (
            <label
              key={valor}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={seleccion.has(valor)} onCheckedChange={() => onToggle(valor)} />
              <span className="flex-1 truncate">{valor}</span>
              <span className="text-xs text-muted-foreground">{n}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function CierreDiaView() {
  const [busqueda, setBusqueda] = useState("");
  const [fechasSel, setFechasSel] = useState<Set<string>>(new Set());
  const [formasSel, setFormasSel] = useState<Set<string>>(new Set());
  const [vendSel, setVendSel] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cierre-dia", COD_EMPRESA],
    queryFn: () => listarCierreDia(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  // Por defecto, pre-marcar la fecha de hoy en la faceta (como el APEX). Solo una
  // vez, y solo si hoy tiene cobros; si no, deja sin filtro para no mostrar vacío.
  const [defaultAplicado, setDefaultAplicado] = useState(false);
  if (!defaultAplicado && filas.length > 0) {
    setDefaultAplicado(true);
    const hoy = hoyDDMMYYYY();
    if (filas.some((r) => r.fecha === hoy)) setFechasSel(new Set([hoy]));
  }

  const coincide = (r: CierreDiaFila, ignora: "fecha" | "forma" | "vend" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.fecha ?? ""} ${r.desc_forma ?? ""} ${r.nombre_banco ?? ""} ${r.nro_transaccion ?? ""} ${r.nombre_vendedor ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "fecha" && fechasSel.size > 0 && !fechasSel.has(r.fecha ?? "")) return false;
    if (ignora !== "forma" && formasSel.size > 0 && !formasSel.has(r.desc_forma ?? "")) return false;
    if (ignora !== "vend" && vendSel.size > 0 && !vendSel.has(r.nombre_vendedor ?? "")) return false;
    return true;
  };

  const facet = (campo: "fecha" | "desc_forma" | "nombre_vendedor", ignora: "fecha" | "forma" | "vend") => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = r[campo];
      if (coincide(r, ignora) && v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    const items = [...c.entries()].map(([valor, n]) => ({ valor, n }));
    // Fecha: cronológico descendente (hoy arriba). Resto: alfabético.
    if (campo === "fecha") {
      items.sort((a, b) => fechaOrden(b.valor) - fechaOrden(a.valor));
    } else {
      items.sort((a, b) => a.valor.localeCompare(b.valor));
    }
    return items;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetFechas = useMemo(() => facet("fecha", "fecha"), [filas, busqueda, fechasSel, formasSel, vendSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetFormas = useMemo(() => facet("desc_forma", "forma"), [filas, busqueda, fechasSel, formasSel, vendSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetVend = useMemo(() => facet("nombre_vendedor", "vend"), [filas, busqueda, fechasSel, formasSel, vendSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, fechasSel, formasSel, vendSel],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setFechasSel(new Set());
    setFormasSel(new Set());
    setVendSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" || fechasSel.size > 0 || formasSel.size > 0 || vendSel.size > 0;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Cierre del Día</h2>
          <p className="text-sm text-muted-foreground">Cobros por forma, banco y vendedor</p>
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
          {error instanceof Error ? error.message : "No se pudieron cargar los cobros"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin cobros para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
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
            <Faceta
              titulo="Fecha"
              valores={facetFechas}
              seleccion={fechasSel}
              onToggle={(v) => toggle(fechasSel, setFechasSel, v)}
            />
            <Faceta
              titulo="Forma de Cobro"
              valores={facetFormas}
              seleccion={formasSel}
              onToggle={(v) => toggle(formasSel, setFormasSel, v)}
            />
            <Faceta
              titulo="Vendedor"
              valores={facetVend}
              seleccion={vendSel}
              onToggle={(v) => toggle(vendSel, setVendSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r, i) =>
                `${r.fecha}|${r.id_forma}|${r.id_banco}|${r.nro_transaccion}|${r.nombre_vendedor}|${i}`
              }
              exportName="cierre-dia"
              initialSort={{ key: "fecha", dir: "desc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
