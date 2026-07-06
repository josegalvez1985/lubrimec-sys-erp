import { useQuery } from "@tanstack/react-query";
import { Wallet, Loader2 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { cobrosHoyPorForma } from "@/lib/api";

const COD_EMPRESA = 24;

const COLORES = [
  "#f97316", // naranja (primario)
  "#3b82f6", // azul
  "#22c55e", // verde
  "#eab308", // amarillo
  "#ec4899", // rosa
  "#8b5cf6", // violeta
  "#06b6d4", // cian
  "#ef4444", // rojo
];

const fmtGs = (n: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// Dona de cobros de HOY por forma de cobro (V_COBROS_CLIENTES). Widget del
// dashboard: composición de la caja del día + total al centro. Datos: endpoint
// cierre-dia/hoy-por-forma (ORDS).
export function CobrosHoyChart() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cobros-hoy-forma", COD_EMPRESA],
    queryFn: () => cobrosHoyPorForma(COD_EMPRESA),
    retry: false,
  });

  const filas = (data ?? []).filter((f) => (f.total ?? 0) > 0);
  const total = filas.reduce((a, f) => a + (f.total ?? 0), 0);
  const chart = filas.map((f, i) => ({
    nombre: f.desc_forma ?? "Sin forma",
    valor: f.total ?? 0,
    color: COLORES[i % COLORES.length],
  }));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold">Cobranza de hoy</h3>
          <p className="text-sm text-muted-foreground">Por forma de cobro</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando...
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          No se pudo cargar la cobranza de hoy
        </p>
      ) : chart.length === 0 ? (
        <div className="grid h-64 place-items-center text-center">
          <div>
            <p className="font-medium">Sin cobros hoy</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Aún no hay cobros registrados en el día.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="valor"
                  nameKey="nombre"
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {chart.map((d) => (
                    <Cell key={d.nombre} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [fmtGs(Number(v)), String(n)]}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--foreground)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Total al centro */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="font-display text-xl font-bold tabular-nums">{fmtGs(total)}</span>
            </div>
          </div>

          {/* Leyenda con montos */}
          <ul className="space-y-2 text-sm">
            {chart.map((d) => (
              <li key={d.nombre} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                <span className="flex-1 truncate">{d.nombre}</span>
                <span className="font-mono font-semibold tabular-nums">{fmtGs(d.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
