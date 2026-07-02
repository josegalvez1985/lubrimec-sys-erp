import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LineChart as LineChartIcon, AreaChart as AreaChartIcon, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listarAniosVentas, listarMesesVentas, ventasPorDia } from "@/lib/api";

const COD_EMPRESA = 24;

// Paleta para distinguir cada día (cicla si hay más días que colores).
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
const colorDia = (i: number) => COLORES[i % COLORES.length];

// Gráfico de ventas por día del dashboard. Filtros año/mes (desde la BD) y
// selector de formato (barras / línea / área). Datos: ventas/por-dia (ORDS).
export function VentasDashboardChart() {
  const [anio, setAnio] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"barras" | "linea" | "area">("barras");

  // Por defecto se carga la fecha actual; si el año/mes de hoy no tiene ventas,
  // cae al más reciente disponible (las listas vienen desc).
  const hoy = new Date();
  const anioHoy = String(hoy.getFullYear());
  const mesHoy = String(hoy.getMonth() + 1).padStart(2, "0");

  const aniosQuery = useQuery({
    queryKey: ["ventas-anios", COD_EMPRESA],
    queryFn: () => listarAniosVentas(COD_EMPRESA),
    retry: false,
  });
  const anioActivo =
    anio ??
    (aniosQuery.data?.some((a) => a.anio === anioHoy) ? anioHoy : aniosQuery.data?.[0]?.anio) ??
    null;

  const mesesQuery = useQuery({
    queryKey: ["ventas-meses", COD_EMPRESA, anioActivo],
    queryFn: () => listarMesesVentas(anioActivo!, COD_EMPRESA),
    enabled: anioActivo != null,
    retry: false,
  });
  const mesActivo =
    mes ??
    (anioActivo === anioHoy && mesesQuery.data?.some((m) => m.mes_num === mesHoy)
      ? mesHoy
      : mesesQuery.data?.[0]?.mes_num) ??
    null;

  const diasQuery = useQuery({
    queryKey: ["ventas-por-dia", COD_EMPRESA, anioActivo, mesActivo],
    queryFn: () => ventasPorDia(anioActivo!, mesActivo!, COD_EMPRESA),
    enabled: anioActivo != null && mesActivo != null,
    retry: false,
  });

  const datos = diasQuery.data ?? [];
  const total = datos.reduce((acc, d) => acc + d.monto, 0);
  const fmt = (n: number) => Math.round(n).toLocaleString("es-PY", { maximumFractionDigits: 0 });

  const selectCls =
    "h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold">Ventas por día</h2>
          <p className="text-sm text-muted-foreground">
            {diasQuery.isSuccess && datos.length > 0
              ? `Total del mes: ₲ ${fmt(total)}`
              : "Total diario del mes seleccionado"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Año"
            className={selectCls}
            value={anioActivo ?? ""}
            onChange={(e) => {
              setAnio(e.target.value);
              setMes(null); // el año nuevo trae otros meses
            }}
            disabled={aniosQuery.isLoading}
          >
            {(aniosQuery.data ?? []).map((a) => (
              <option key={a.anio} value={a.anio}>
                {a.anio}
              </option>
            ))}
          </select>

          <select
            aria-label="Mes"
            className={selectCls}
            value={mesActivo ?? ""}
            onChange={(e) => setMes(e.target.value)}
            disabled={mesesQuery.isLoading || anioActivo == null}
          >
            {(mesesQuery.data ?? []).map((m) => (
              <option key={m.mes_num} value={m.mes_num}>
                {m.mes}
              </option>
            ))}
          </select>

          <Tabs value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <TabsList>
              <TabsTrigger value="barras" aria-label="Barras">
                <BarChart3 className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="linea" aria-label="Línea">
                <LineChartIcon className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="area" aria-label="Área">
                <AreaChartIcon className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="mt-4 h-72">
        {diasQuery.isLoading || aniosQuery.isLoading ? (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : aniosQuery.isError || diasQuery.isError ? (
          <p className="grid h-full place-items-center text-sm text-destructive">
            {(aniosQuery.error ?? diasQuery.error) instanceof Error
              ? ((aniosQuery.error ?? diasQuery.error) as Error).message
              : "No se pudieron cargar las ventas"}
          </p>
        ) : datos.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">
            Sin ventas en el período seleccionado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {tipo === "barras" ? (
              <BarChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} width={70} />
                <Tooltip
                  formatter={(v) => [`₲ ${fmt(Number(v))}`, "Monto"]}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                  {datos.map((d, i) => (
                    <Cell key={d.fecha} fill={colorDia(i)} />
                  ))}
                </Bar>
              </BarChart>
            ) : tipo === "linea" ? (
              <LineChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} width={70} />
                <Tooltip
                  formatter={(v) => [`₲ ${fmt(Number(v))}`, "Monto"]}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="monto"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={({ cx, cy, index }) => (
                    <circle key={index} cx={cx} cy={cy} r={4} fill={colorDia(index ?? 0)} />
                  )}
                />
              </LineChart>
            ) : (
              <AreaChart data={datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmt} width={70} />
                <Tooltip
                  formatter={(v) => [`₲ ${fmt(Number(v))}`, "Monto"]}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="monto"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="var(--primary)"
                  fillOpacity={0.25}
                  dot={({ cx, cy, index }) => (
                    <circle key={index} cx={cx} cy={cy} r={4} fill={colorDia(index ?? 0)} />
                  )}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
