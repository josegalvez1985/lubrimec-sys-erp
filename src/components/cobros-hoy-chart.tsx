import { useQuery } from "@tanstack/react-query";
import { Wallet, Loader2, TrendingUp } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { listarCierreDia } from "@/lib/api";

const COD_EMPRESA = 24;

// Paleta categórica CVD-safe (validada con la skill dataviz, orden fijo).
// La identidad no es solo-color: la leyenda muestra el nombre de cada forma.
const COLORES = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
];

const fmtGs = (n: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// Fecha de hoy en dd/mm/yyyy (mismo formato que V_COBROS_CLIENTES).
const hoyDDMMYYYY = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Cobranza de hoy: KPI del total en tarjeta + dona por forma de cobro. Usa el
// MISMO endpoint que la página "Cierre del Día" (listarCierreDia, sin filtro de
// fecha en SQL, por eso funciona) y filtra "hoy" + agrupa por forma en el front.
export function CobrosHoyChart() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cierre-dia", COD_EMPRESA],
    queryFn: () => listarCierreDia(COD_EMPRESA),
    retry: false,
  });

  const hoy = hoyDDMMYYYY();
  const deHoy = (data ?? []).filter((r) => r.fecha === hoy);

  const porForma = new Map<string, number>();
  for (const r of deHoy) {
    const k = r.desc_forma ?? "Sin forma";
    porForma.set(k, (porForma.get(k) ?? 0) + (r.total ?? 0));
  }
  const filas = [...porForma.entries()]
    .map(([nombre, valor], i) => ({ nombre, valor, color: COLORES[i % COLORES.length] }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = filas.reduce((a, f) => a + f.valor, 0);
  const formasCount = filas.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* KPI: total cobrado hoy */}
      <div className="flex flex-col justify-between rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-5 shadow-elegant">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Cobranza de hoy</span>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <p className="font-display text-4xl font-bold tabular-nums">{fmtGs(total)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Guaraníes · {hoy}
              </p>
            </>
          )}
        </div>
        {!isLoading && formasCount > 0 && (
          <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            {formasCount} {formasCount === 1 ? "forma de cobro" : "formas de cobro"}
          </div>
        )}
      </div>

      {/* Dona: composición por forma de cobro */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
        <div className="mb-2">
          <h3 className="font-display text-lg font-bold">Por forma de cobro</h3>
          <p className="text-sm text-muted-foreground">Composición de la caja del día</p>
        </div>

        {isLoading ? (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando...
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-destructive">
            No se pudo cargar la cobranza de hoy
          </p>
        ) : filas.length === 0 ? (
          <div className="grid h-56 place-items-center text-center">
            <div>
              <p className="font-medium">Sin cobros hoy</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aún no hay cobros registrados en el día.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="relative h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filas}
                    dataKey="valor"
                    nameKey="nombre"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    {filas.map((d) => (
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
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="font-display text-lg font-bold tabular-nums">{fmtGs(total)}</span>
              </div>
            </div>

            {/* Leyenda con montos y % — etiqueta directa, identidad no solo-color */}
            <ul className="space-y-2 text-sm">
              {filas.map((d) => (
                <li key={d.nombre} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="flex-1 truncate">{d.nombre}</span>
                  <span className="font-mono font-semibold tabular-nums">{fmtGs(d.valor)}</span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {total > 0 ? Math.round((d.valor / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
