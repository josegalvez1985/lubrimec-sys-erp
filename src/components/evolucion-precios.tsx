import {
  cloneElement,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileDown,
  LineChart as IconoLinea,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Faceta } from "@/components/ui/faceta";
import { DataTable, type Column } from "@/components/ui/data-table";
import { BuscadorSelect } from "@/components/ui/buscador-select";
import { getSesion, listarPreciosVentas, type PrecioVenta } from "@/lib/api";
import { exportarPdfReporte, graficoAPng, type GraficoPdf, type KpiPdf } from "@/lib/export";
import { cn } from "@/lib/utils";

// Reporte "Evolución de Precios" (pestaña de Precios de Ventas, pág 34): cómo
// cambió el precio de venta en cada registro de PRECIOS_VENTAS.
//
// Sin endpoint propio: reusa listarPreciosVentas (el historial completo son ~2000
// filas) y calcula en el front lo que sería un LAG() en SQL — precio anterior,
// variación, días entre cambios—. El precio anterior se toma del historial
// ENTERO y recién después se filtra el período: si se filtrara antes, el primer
// cambio del período quedaría sin precio anterior y sin variación.

const COD_EMPRESA = 24;
const SIN_DATO = "(sin dato)";

// ─── Paletas ────────────────────────────────────────────────────────────────
// Validadas con la skill dataviz: acento = serie protagonista (precio de venta y
// barras), contexto = serie de referencia (costo) en gris a propósito.
type Paleta = {
  acento: string;
  contexto: string;
  tinta: string;
  tintaSuave: string;
  grilla: string;
  eje: string;
  superficie: string;
};

// Pantalla: tokens de styles.css, que cambian solos con el tema claro/oscuro.
const PAL_PANTALLA: Paleta = {
  acento: "var(--viz-acento)",
  contexto: "var(--viz-contexto)",
  tinta: "var(--foreground)",
  tintaSuave: "var(--muted-foreground)",
  grilla: "var(--viz-grilla)",
  eje: "var(--viz-eje)",
  superficie: "var(--card)",
};

// PDF: los mismos roles en hex del modo claro (dentro de la imagen no hay var(--x)).
const PAL_PDF: Paleta = {
  acento: "#eb6834",
  contexto: "#898781",
  tinta: "#0b0b0b",
  tintaSuave: "#52514e",
  grilla: "#e1e0d9",
  eje: "#c3c2b7",
  superficie: "#ffffff",
};

// ─── Formato ────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtGs = (n: number | null | undefined) => (n == null ? "—" : nf0.format(n));
const fmtSigno = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${nf0.format(n)}`);
// Espacio duro antes del "%": recharts y la tabla parten el texto en los espacios
// y dejaban el "%" solo en un segundo renglón.
const NBSP = String.fromCharCode(160);
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${nf1.format(n)}${NBSP}%`;
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const fmtFechaHora = (iso: string) => `${fmtFecha(iso)} ${iso.slice(11, 16)}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const p2 = (n: number) => String(n).padStart(2, "0");
const isoDia = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const fmtFechaCorta = (t: number) => {
  const d = new Date(t);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
// Las fuentes estándar de jsPDF no tienen la raya larga (ver export.ts); el
// espacio duro sí existe, pero se normaliza por las dudas.
const paraPdf = (s: string) => s.replace(/—/g, "-").split(NBSP).join(" ");

function haceMeses(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return isoDia(d);
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // saca las tildes
const sinSeparadores = (s: string) => s.replace(/[-/.\s]/g, "");
const recortarTexto = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const pct = (nuevo: number | null, anterior: number | null) =>
  nuevo == null || !anterior ? null : ((nuevo - anterior) / anterior) * 100;
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ─── Datos ──────────────────────────────────────────────────────────────────

// Un registro de PRECIOS_VENTAS con los datos del registro anterior del mismo
// artículo (lo que en SQL sería LAG() OVER (PARTITION BY id_articulo ...)).
type Cambio = PrecioVenta & {
  dia: string; // yyyy-mm-dd
  precio_anterior: number | null;
  margen_anterior: number | null;
  variacion: number | null; // Gs.
  variacion_pct: number | null;
  variacion_costo_pct: number | null;
  dias: number | null; // desde el registro anterior
  real: boolean; // el precio de venta cambió (no es el primero ni repite el anterior)
};

function armarHistorial(precios: PrecioVenta[]): Map<number, Cambio[]> {
  const grupos = new Map<number, PrecioVenta[]>();
  for (const p of precios) {
    const g = grupos.get(p.id_articulo);
    if (g) g.push(p);
    else grupos.set(p.id_articulo, [p]);
  }
  const res = new Map<number, Cambio[]>();
  for (const [id, lista] of grupos) {
    // Mismo orden que el ORDER BY fecha, id_precio de la consulta propuesta.
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id_precio - b.id_precio);
    res.set(
      id,
      lista.map((p, i) => {
        const ant = i > 0 ? lista[i - 1] : null;
        return {
          ...p,
          dia: p.fecha.slice(0, 10),
          precio_anterior: ant?.precio_venta ?? null,
          margen_anterior: ant?.margen ?? null,
          variacion: ant ? p.precio_venta - ant.precio_venta : null,
          variacion_pct: pct(p.precio_venta, ant?.precio_venta ?? null),
          variacion_costo_pct: pct(p.precio_compra, ant?.precio_compra ?? null),
          dias: ant
            ? Math.round(
                (Date.parse(p.fecha.slice(0, 10)) - Date.parse(ant.fecha.slice(0, 10))) /
                  86_400_000,
              )
            : null,
          real: ant != null && p.precio_venta !== ant.precio_venta,
        };
      }),
    );
  }
  return res;
}

// Resumen del período por artículo (solo los que cambiaron de precio).
type ResumenArticulo = {
  id_articulo: number;
  descripcion: string;
  rubro: string;
  cambios: number;
  acum_pct: number | null; // precio final del período vs. el vigente al inicio
  margen_ini: number | null;
  margen_fin: number | null;
};

type PuntoMes = { etiqueta: string; cambios: number; variacion: number | null };
type Barra = { clave: string; nombre: string; valor: number };

function mesesEntre(desde: string, hasta: string): string[] {
  const res: string[] = [];
  let y = Number(desde.slice(0, 4));
  let m = Number(desde.slice(5, 7));
  const yh = Number(hasta.slice(0, 4));
  const mh = Number(hasta.slice(5, 7));
  while ((y < yh || (y === yh && m <= mh)) && res.length < 240) {
    res.push(`${y}-${p2(m)}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return res;
}

// KPIs, series mensuales y rankings sobre las filas ya filtradas. `filas` viene
// agrupado por artículo y en orden cronológico dentro de cada uno.
function analizar(filas: Cambio[], desde: string, hasta: string) {
  const reales = filas.filter((c) => c.real);

  const porArticulo = new Map<number, Cambio[]>();
  for (const c of filas) {
    const g = porArticulo.get(c.id_articulo);
    if (g) g.push(c);
    else porArticulo.set(c.id_articulo, [c]);
  }
  const resumen: ResumenArticulo[] = [];
  for (const [id, lista] of porArticulo) {
    const cambios = lista.filter((c) => c.real).length;
    if (!cambios) continue;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    // Base = precio vigente al empezar el período (el anterior al primer registro
    // del período); si el artículo recién aparece, su primer precio.
    const conAnterior = primero.precio_anterior != null;
    resumen.push({
      id_articulo: id,
      descripcion: ultimo.descripcion_articulo ?? `Artículo ${id}`,
      rubro: ultimo.rubro ?? SIN_DATO,
      cambios,
      acum_pct: pct(ultimo.precio_venta, primero.precio_anterior ?? primero.precio_venta),
      margen_ini: conAnterior ? primero.margen_anterior : primero.margen,
      margen_fin: ultimo.margen,
    });
  }

  const buckets = new Map<string, number[]>(mesesEntre(desde, hasta).map((m) => [m, []]));
  for (const c of reales) buckets.get(c.dia.slice(0, 7))?.push(c.variacion_pct ?? 0);
  const porMes: PuntoMes[] = [...buckets].map(([mes, vs]) => ({
    etiqueta: fmtMes(mes),
    cambios: vs.length,
    variacion: promedio(vs),
  }));

  const conAcum = resumen.filter((r) => r.acum_pct != null);
  const top: Barra[] = [...conAcum]
    .sort((a, b) => b.acum_pct! - a.acum_pct!)
    .slice(0, 10)
    .map((r) => ({ clave: String(r.id_articulo), nombre: r.descripcion, valor: r.acum_pct! }));

  const rubros = new Map<string, number[]>();
  for (const r of conAcum) {
    const g = rubros.get(r.rubro);
    if (g) g.push(r.acum_pct!);
    else rubros.set(r.rubro, [r.acum_pct!]);
  }
  const porRubro: Barra[] = [...rubros]
    .map(([rubro, vs]) => ({ clave: rubro, nombre: rubro, valor: promedio(vs)! }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12);

  const mayor = conAcum.reduce<ResumenArticulo | null>(
    (m, r) => (m == null || r.acum_pct! > m.acum_pct! ? r : m),
    null,
  );
  const variaciones = reales.map((c) => c.variacion_pct).filter((v): v is number => v != null);

  return {
    reales,
    resumen,
    porMes,
    top,
    porRubro,
    totalRubros: rubros.size,
    promedio: promedio(variaciones),
    aumentos: variaciones.filter((v) => v > 0).length,
    bajas: variaciones.filter((v) => v < 0).length,
    mayor: mayor && mayor.acum_pct! > 0 ? mayor : null,
    // Margen redondeado a 1 decimal para no contar diferencias de coma flotante.
    margenEnBaja: resumen.filter(
      (r) =>
        r.margen_ini != null &&
        r.margen_fin != null &&
        Math.round(r.margen_fin * 10) < Math.round(r.margen_ini * 10),
    ).length,
  };
}

// Serie escalonada de un artículo en el período: arranca con el precio vigente
// al inicio (si ya tenía), un punto por registro y se estira hasta el final del
// período (o hoy) con el último precio.
type PuntoArticulo = { t: number; venta: number; costo: number | null; cambio: boolean };

function serieArticulo(hist: Cambio[], desde: string, hasta: string, hoy: string): PuntoArticulo[] {
  const puntos: PuntoArticulo[] = [];
  const previos = hist.filter((c) => c.dia < desde);
  const previo = previos[previos.length - 1];
  if (previo) {
    puntos.push({
      t: Date.parse(`${desde}T00:00:00`),
      venta: previo.precio_venta,
      costo: previo.precio_compra,
      cambio: false,
    });
  }
  for (const c of hist) {
    if (c.dia < desde || c.dia > hasta) continue;
    puntos.push({
      t: Date.parse(c.fecha),
      venta: c.precio_venta,
      costo: c.precio_compra,
      cambio: true,
    });
  }
  const ultimo = puntos[puntos.length - 1];
  const fin = hasta >= hoy ? Date.now() : Date.parse(`${hasta}T23:59:59`);
  if (ultimo && fin > ultimo.t) puntos.push({ ...ultimo, t: fin, cambio: false });
  return puntos;
}

// ─── Gráficos ───────────────────────────────────────────────────────────────
// Cada gráfico se dibuja igual en pantalla (ocupa su contenedor) y en el PDF
// (tamaño fijo, con PAL_PDF, vía graficoAPng). Sin animación: al filtrar se
// redibuja al instante y el PDF no captura un cuadro a medio animar.

type Fijo = { ancho: number; alto: number };

function Lienzo({
  fijo,
  children,
}: {
  fijo?: Fijo;
  children: ReactElement<{ width?: number; height?: number }>;
}) {
  if (fijo) return cloneElement(children, { width: fijo.ancho, height: fijo.alto });
  return (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );
}

const TOOLTIP = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--foreground)" },
};

const tick = (pal: Paleta) => ({ fontSize: 11, fill: pal.tintaSuave });

// Móvil (<640px, el mismo corte de styles.css): los gráficos se compactan —sin
// rótulos que se pisarían, nombres más cortos—. El PDF siempre va completo.
const MEDIA_MOVIL = "(max-width: 639px)";
function useEsMovil(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(MEDIA_MOVIL);
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia(MEDIA_MOVIL).matches,
    () => false,
  );
}

function GraficoCambiosMes({ datos, pal, fijo }: { datos: PuntoMes[]; pal: Paleta; fijo?: Fijo }) {
  // Valor en la tapa de cada columna solo si entran (hasta ~1 año de meses).
  const conValores = datos.length <= 13;
  return (
    <Lienzo fijo={fijo}>
      <BarChart data={datos} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={pal.grilla} />
        <XAxis
          dataKey="etiqueta"
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          width={36}
          tick={tick(pal)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          formatter={(v) => [nf0.format(Number(v)), "Cambios"]}
        />
        <Bar
          dataKey="cambios"
          fill={pal.acento}
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        >
          {conValores && (
            <LabelList
              dataKey="cambios"
              position="top"
              offset={6}
              style={{ fontSize: 10, fill: pal.tintaSuave }}
              formatter={(v: unknown) => (Number(v) > 0 ? nf0.format(Number(v)) : "")}
            />
          )}
        </Bar>
      </BarChart>
    </Lienzo>
  );
}

function GraficoVariacionMes({
  datos,
  pal,
  fijo,
  compacto,
}: {
  datos: PuntoMes[];
  pal: Paleta;
  fijo?: Fijo;
  compacto?: boolean;
}) {
  // "+12,5 %" es más ancho que una columna en móvil: ahí el valor queda en el tooltip.
  const conValores = !compacto && datos.length <= 13;
  return (
    <Lienzo fijo={fijo}>
      <BarChart data={datos} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={pal.grilla} />
        <XAxis
          dataKey="etiqueta"
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
        />
        <YAxis
          width={44}
          tick={tick(pal)}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${nf0.format(v)} %`}
        />
        <ReferenceLine y={0} stroke={pal.eje} />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          formatter={(v) => [fmtPct(Number(v)), "Variación promedio"]}
        />
        <Bar
          dataKey="variacion"
          fill={pal.acento}
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        >
          {conValores && (
            <LabelList
              dataKey="variacion"
              position="top"
              offset={6}
              style={{ fontSize: 10, fill: pal.tintaSuave }}
              formatter={(v: unknown) => (v == null ? "" : fmtPct(Number(v)))}
            />
          )}
        </Bar>
      </BarChart>
    </Lienzo>
  );
}

// Barras horizontales ordenadas (mayores aumentos, rubros). `onElegir` hace
// clickeable cada barra.
function GraficoRanking({
  datos,
  pal,
  fijo,
  onElegir,
  compacto,
}: {
  datos: Barra[];
  pal: Paleta;
  fijo?: Fijo;
  onElegir?: (b: Barra) => void;
  compacto?: boolean;
}) {
  return (
    <Lienzo fijo={fijo}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: compacto ? 48 : 56, left: 4, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={pal.grilla} />
        <XAxis
          type="number"
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
          domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
          tickFormatter={(v: number) => `${nf0.format(v)} %`}
        />
        <YAxis
          type="category"
          dataKey="nombre"
          width={compacto ? 104 : 170}
          interval={0}
          axisLine={false}
          tickLine={false}
          // Tick propio: el de recharts parte en dos renglones los nombres largos.
          tick={(p: { x: number | string; y: number | string; payload: { value: string } }) => (
            <text
              x={Number(p.x) - 4}
              y={Number(p.y)}
              dy={4}
              textAnchor="end"
              fontSize={11}
              fill={pal.tintaSuave}
            >
              {recortarTexto(p.payload.value, compacto ? 15 : 26)}
            </text>
          )}
        />
        <ReferenceLine x={0} stroke={pal.eje} />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          formatter={(v) => [fmtPct(Number(v)), "Variación"]}
        />
        <Bar
          dataKey="valor"
          fill={pal.acento}
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          isAnimationActive={false}
          cursor={onElegir ? "pointer" : undefined}
          onClick={onElegir ? (_, i) => onElegir(datos[i]) : undefined}
        >
          <LabelList
            dataKey="valor"
            position="right"
            offset={6}
            style={{ fontSize: 10, fill: pal.tinta }}
            formatter={(v: unknown) => fmtPct(Number(v))}
          />
        </Bar>
      </BarChart>
    </Lienzo>
  );
}

// Línea ESCALONADA (stepAfter): un precio rige hasta el cambio siguiente; una
// línea inclinada inventaría subas graduales que no existieron. Precio de venta
// en el acento, costo en gris de contexto; el hueco entre ambas es el margen.
function GraficoArticulo({
  datos,
  pal,
  fijo,
}: {
  datos: PuntoArticulo[];
  pal: Paleta;
  fijo?: Fijo;
}) {
  const n = datos.length;
  // Valor rotulado solo al final de cada línea (no en cada punto).
  const rotuloFinal = (props: {
    x?: number | string;
    y?: number | string;
    index?: number;
    value?: unknown;
  }) =>
    props.index === n - 1 && props.value != null ? (
      <text
        x={Number(props.x ?? 0) + 6}
        y={Number(props.y ?? 0) + 4}
        fontSize={11}
        fill={pal.tinta}
      >
        {nf0.format(Number(props.value))}
      </text>
    ) : (
      <g />
    );
  const punto =
    (color: string) =>
    (props: { cx?: number; cy?: number; index?: number; payload?: PuntoArticulo }) =>
      props.payload?.cambio ? (
        <circle
          key={props.index}
          cx={props.cx}
          cy={props.cy}
          r={4}
          fill={color}
          stroke={pal.superficie}
          strokeWidth={2}
        />
      ) : (
        <g key={props.index} />
      );

  return (
    <Lienzo fijo={fijo}>
      <LineChart data={datos} margin={{ top: 12, right: 64, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={pal.grilla} />
        <XAxis
          type="number"
          dataKey="t"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickCount={6}
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
          tickFormatter={fmtFechaCorta}
        />
        <YAxis
          width={64}
          domain={["auto", "auto"]}
          tick={tick(pal)}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => nf0.format(v)}
        />
        <Tooltip
          {...TOOLTIP}
          labelFormatter={(v) => fmtFechaCorta(Number(v))}
          formatter={(v) => fmtGs(Number(v))}
        />
        <Line
          type="stepAfter"
          dataKey="costo"
          name="Costo"
          stroke={pal.contexto}
          strokeWidth={2}
          dot={punto(pal.contexto)}
          activeDot={{ r: 5 }}
          connectNulls
          isAnimationActive={false}
          label={rotuloFinal}
        />
        <Line
          type="stepAfter"
          dataKey="venta"
          name="Precio venta"
          stroke={pal.acento}
          strokeWidth={2}
          dot={punto(pal.acento)}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
          label={rotuloFinal}
        />
      </LineChart>
    </Lienzo>
  );
}

// ─── Piezas de la pantalla ──────────────────────────────────────────────────

function Kpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-xl font-semibold">{valor}</p>
      {detalle && <p className="truncate text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function Panel({
  titulo,
  subtitulo,
  extra,
  panelRef,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  extra?: ReactNode;
  panelRef?: Ref<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <section ref={panelRef} className="min-w-0 rounded-xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Vacio({ texto = "Sin cambios de precio en el período." }: { texto?: string }) {
  return (
    <p className="grid h-full place-items-center text-center text-sm text-muted-foreground">
      {texto}
    </p>
  );
}

// Variación con flecha: el ícono lleva el color (y su aria-label), el número va
// en la tinta normal.
function Delta({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-muted-foreground">—</span>;
  const Icono = valor > 0 ? TrendingUp : valor < 0 ? TrendingDown : null;
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap font-mono">
      {Icono && (
        <Icono
          className={cn("h-3.5 w-3.5", valor > 0 ? "text-destructive" : "text-emerald-600")}
          aria-label={valor > 0 ? "Aumento" : "Baja"}
        />
      )}
      {fmtPct(valor)}
    </span>
  );
}

const COLUMNAS: Column<Cambio>[] = [
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha,
    render: (r) => fmtFechaHora(r.fecha),
  },
  {
    key: "articulo",
    header: "Artículo",
    accessor: (r) => r.descripcion_articulo ?? `Artículo ${r.id_articulo}`,
    render: (r) => (
      <div className="flex flex-col">
        <span>{r.descripcion_articulo ?? "—"}</span>
        <span className="font-mono text-xs text-muted-foreground">
          #{r.id_articulo}
          {r.codigo_oem ? ` · OEM ${r.codigo_oem}` : ""}
        </span>
      </div>
    ),
    hideable: false,
  },
  { key: "rubro", header: "Rubro", accessor: (r) => r.rubro ?? "", render: (r) => r.rubro || "—" },
  {
    key: "precio_anterior",
    header: "Precio anterior",
    num: true,
    accessor: (r) => r.precio_anterior ?? 0,
    render: (r) => <span className="font-mono">{fmtGs(r.precio_anterior)}</span>,
  },
  {
    key: "precio_venta",
    header: "Precio nuevo",
    num: true,
    accessor: (r) => r.precio_venta,
    render: (r) => <span className="font-mono font-semibold">{fmtGs(r.precio_venta)}</span>,
    hideable: false,
  },
  {
    key: "variacion",
    header: "Variación",
    num: true,
    accessor: (r) => r.variacion ?? 0,
    render: (r) => <span className="font-mono">{fmtSigno(r.variacion)}</span>,
  },
  {
    key: "variacion_pct",
    header: "Var. %",
    num: true,
    accessor: (r) => r.variacion_pct ?? 0,
    render: (r) => <Delta valor={r.variacion_pct} />,
  },
  {
    key: "precio_compra",
    header: "Costo",
    num: true,
    accessor: (r) => r.precio_compra ?? 0,
    render: (r) => <span className="font-mono">{fmtGs(r.precio_compra)}</span>,
  },
  {
    key: "variacion_costo_pct",
    header: "Var. costo %",
    num: true,
    accessor: (r) => r.variacion_costo_pct ?? 0,
    render: (r) => <Delta valor={r.variacion_costo_pct} />,
  },
  {
    key: "margen",
    header: "Margen %",
    num: true,
    accessor: (r) => r.margen ?? 0,
    render: (r) => (r.margen == null ? "—" : `${nf1.format(r.margen)} %`),
  },
  {
    key: "dias",
    header: "Días",
    num: true,
    accessor: (r) => r.dias ?? 0,
    render: (r) => (r.dias == null ? "—" : nf0.format(r.dias)),
  },
];

// Rangos rápidos; `null` = desde el primer precio registrado.
const RANGOS = [
  { etiqueta: "3 meses", meses: 3 },
  { etiqueta: "6 meses", meses: 6 },
  { etiqueta: "12 meses", meses: 12 },
  { etiqueta: "Todo", meses: null },
] as const;

function contarOpciones(filas: Cambio[], valor: (c: Cambio) => string) {
  const n = new Map<string, number>();
  for (const c of filas) n.set(valor(c), (n.get(valor(c)) ?? 0) + (c.real ? 1 : 0));
  return [...n]
    .map(([v, cant]) => ({ valor: v, n: cant }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor));
}

function alternar(set: Set<string>, v: string): Set<string> {
  const nuevo = new Set(set);
  if (nuevo.has(v)) nuevo.delete(v);
  else nuevo.add(v);
  return nuevo;
}

// ─── Vista ──────────────────────────────────────────────────────────────────

export function EvolucionPrecios() {
  // Misma queryKey que la lista sin filtro de artículo: una sola descarga del historial.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["precios-ventas", COD_EMPRESA, null],
    queryFn: () => listarPreciosVentas(COD_EMPRESA),
    retry: false,
  });

  const hoy = isoDia(new Date());
  const [desde, setDesde] = useState(() => haceMeses(12));
  const [hasta, setHasta] = useState(hoy);
  const [texto, setTexto] = useState("");
  const textoFiltro = useDeferredValue(texto);
  const [rubros, setRubros] = useState<Set<string>>(() => new Set());
  const [marcas, setMarcas] = useState<Set<string>>(() => new Set());
  const [soloCambios, setSoloCambios] = useState(true);
  const [idElegido, setIdElegido] = useState<number | null>(null);
  const [generando, setGenerando] = useState(false);
  const refArticulo = useRef<HTMLElement>(null);
  const esMovil = useEsMovil();

  const historial = useMemo(() => armarHistorial(data ?? []), [data]);

  const primerDia = useMemo(() => {
    let min = hoy;
    for (const lista of historial.values()) if (lista[0].dia < min) min = lista[0].dia;
    return min;
  }, [historial, hoy]);

  // Artículos con historial, para el selector del gráfico de evolución.
  const catalogo = useMemo(
    () =>
      [...historial.values()]
        .map((l) => l[l.length - 1])
        .map((a) => ({
          id_articulo: a.id_articulo,
          descripcion: a.descripcion_articulo ?? `Artículo ${a.id_articulo}`,
          codigo_oem: a.codigo_oem,
        }))
        .sort((a, b) => a.descripcion.localeCompare(b.descripcion)),
    [historial],
  );

  // Registros del período que pasan la búsqueda (antes de las facetas). Rubro,
  // marca y descripción vienen del JOIN a ARTICULOS: iguales en todo el historial.
  const delPeriodo = useMemo(() => {
    const palabras = normalizar(textoFiltro).split(/\s+/).filter(Boolean);
    const res: Cambio[] = [];
    for (const lista of historial.values()) {
      if (palabras.length) {
        const a = lista[lista.length - 1];
        const texto = normalizar(
          `${a.descripcion_articulo ?? ""} ${a.codigo_oem ?? ""} ${a.id_articulo}`,
        );
        const textoSin = sinSeparadores(texto);
        const pasa = palabras.every(
          (p) => texto.includes(p) || textoSin.includes(sinSeparadores(p)),
        );
        if (!pasa) continue;
      }
      for (const c of lista) if (c.dia >= desde && c.dia <= hasta) res.push(c);
    }
    return res;
  }, [historial, textoFiltro, desde, hasta]);

  // Facetas dependientes: cada una ofrece solo valores compatibles con la otra.
  const { filtrados, opcionesRubro, opcionesMarca } = useMemo(() => {
    const pasaRubro = (c: Cambio) => rubros.size === 0 || rubros.has(c.rubro ?? SIN_DATO);
    const pasaMarca = (c: Cambio) => marcas.size === 0 || marcas.has(c.marca ?? SIN_DATO);
    return {
      filtrados: delPeriodo.filter((c) => pasaRubro(c) && pasaMarca(c)),
      opcionesRubro: contarOpciones(delPeriodo.filter(pasaMarca), (c) => c.rubro ?? SIN_DATO),
      opcionesMarca: contarOpciones(delPeriodo.filter(pasaRubro), (c) => c.marca ?? SIN_DATO),
    };
  }, [delPeriodo, rubros, marcas]);

  const analisis = useMemo(() => analizar(filtrados, desde, hasta), [filtrados, desde, hasta]);

  // Artículo del gráfico de evolución: el elegido o, por defecto, el que más subió.
  const idArticulo = idElegido ?? (analisis.top[0] ? Number(analisis.top[0].clave) : null);
  const histArticulo = idArticulo != null ? historial.get(idArticulo) : undefined;
  const articulo = histArticulo?.[histArticulo.length - 1];
  const serie = useMemo(
    () => (histArticulo ? serieArticulo(histArticulo, desde, hasta, hoy) : []),
    [histArticulo, desde, hasta, hoy],
  );
  const nombreArticulo =
    articulo?.descripcion_articulo ?? (articulo ? `Artículo ${articulo.id_articulo}` : "");

  const filasTabla = useMemo(
    () => (soloCambios ? filtrados.filter((c) => c.real) : filtrados),
    [filtrados, soloCambios],
  );

  function verArticulo(id: number) {
    setIdElegido(id);
    refArticulo.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function elegirRango(meses: number | null) {
    setDesde(meses == null ? primerDia : haceMeses(meses));
    setHasta(hoy);
  }

  const kpis: KpiPdf[] = [
    {
      etiqueta: "Cambios de precio",
      valor: nf0.format(analisis.reales.length),
      detalle: `en ${nf0.format(analisis.resumen.length)} artículo${analisis.resumen.length === 1 ? "" : "s"}`,
    },
    {
      etiqueta: "Variación promedio por cambio",
      valor: fmtPct(analisis.promedio),
      detalle: `${analisis.aumentos} aumentos · ${analisis.bajas} bajas`,
    },
    {
      etiqueta: "Mayor aumento del período",
      valor: fmtPct(analisis.mayor?.acum_pct),
      detalle: analisis.mayor?.descripcion ?? "Sin aumentos",
    },
    {
      etiqueta: "Artículos con margen en baja",
      valor: nf0.format(analisis.margenEnBaja),
      detalle: "margen actual menor que al inicio",
    },
  ];

  function descripcionFiltros(): string {
    const partes = [`Período: del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`];
    if (rubros.size) partes.push(`Rubro: ${[...rubros].join(", ")}`);
    if (marcas.size) partes.push(`Marca: ${[...marcas].join(", ")}`);
    if (texto.trim()) partes.push(`Búsqueda: "${texto.trim()}"`);
    if (!soloCambios) partes.push("Incluye precios sin cambio");
    return partes.join(" · ");
  }

  async function exportarPdf() {
    setGenerando(true);
    try {
      const fijo = { ancho: 640, alto: 290 };
      const relacion = fijo.alto / fijo.ancho;
      const png = (g: ReactElement) => graficoAPng(g, fijo.ancho, fijo.alto);
      const graficos: GraficoPdf[] = [
        {
          titulo: "Cambios de precio por mes",
          subtitulo: "Cantidad de veces que cambió un precio de venta",
          png: await png(<GraficoCambiosMes datos={analisis.porMes} pal={PAL_PDF} fijo={fijo} />),
          relacion,
        },
        {
          titulo: "Variación promedio por mes",
          subtitulo: "Promedio del % de los cambios de cada mes",
          png: await png(<GraficoVariacionMes datos={analisis.porMes} pal={PAL_PDF} fijo={fijo} />),
          relacion,
        },
      ];
      if (analisis.top.length) {
        graficos.push({
          titulo: "Mayores aumentos del período",
          subtitulo: "Último precio del período vs. el vigente al inicio",
          png: await png(<GraficoRanking datos={analisis.top} pal={PAL_PDF} fijo={fijo} />),
          relacion,
        });
      }
      if (analisis.porRubro.length) {
        graficos.push({
          titulo: "Variación promedio por rubro",
          subtitulo: `Aumento promedio de los artículos que cambiaron (${analisis.porRubro.length} de ${analisis.totalRubros} rubros)`,
          png: await png(<GraficoRanking datos={analisis.porRubro} pal={PAL_PDF} fijo={fijo} />),
          relacion,
        });
      }
      if (serie.length > 1) {
        graficos.push({
          titulo: `Evolución: ${nombreArticulo}`,
          subtitulo: "Precio de venta y costo en cada registro",
          png: await png(<GraficoArticulo datos={serie} pal={PAL_PDF} fijo={fijo} />),
          relacion,
          leyenda: [
            { color: PAL_PDF.acento, texto: "Precio venta" },
            { color: PAL_PDF.contexto, texto: "Costo" },
          ],
        });
      }

      const filas = [...filasTabla]
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id_precio - a.id_precio)
        .map((c) =>
          [
            fmtFechaHora(c.fecha),
            c.descripcion_articulo ?? `Artículo ${c.id_articulo}`,
            c.rubro ?? "—",
            fmtGs(c.precio_anterior),
            fmtGs(c.precio_venta),
            fmtSigno(c.variacion),
            fmtPct(c.variacion_pct),
            fmtGs(c.precio_compra),
            fmtPct(c.variacion_costo_pct),
            c.margen == null ? "—" : `${nf1.format(c.margen)} %`,
          ].map(paraPdf),
        );

      await exportarPdfReporte({
        titulo: "Evolución de Precios de Venta",
        subtitulo: descripcionFiltros(),
        archivo: `evolucion-precios-${hoy}`,
        usuario: getSesion()?.usuario,
        kpis: kpis.map((k) => ({
          etiqueta: k.etiqueta,
          valor: paraPdf(k.valor),
          detalle: k.detalle && paraPdf(k.detalle),
        })),
        graficos,
        tabla: {
          titulo: soloCambios ? "Detalle de cambios de precio" : "Detalle de precios registrados",
          columnas: [
            "Fecha",
            "Artículo",
            "Rubro",
            "Anterior",
            "Nuevo",
            "Var. Gs.",
            "Var. %",
            "Costo",
            "Var. costo %",
            "Margen %",
          ],
          filas,
          numericas: [3, 4, 5, 6, 7, 8, 9],
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="p-8 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "No se pudieron cargar los precios"}
      </p>
    );
  }

  const hayCambios = analisis.reales.length > 0;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {/* Filtros: una sola fila que acota KPIs, gráficos y tabla */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="evo-desde" className="text-xs">
            Desde
          </Label>
          <Input
            id="evo-desde"
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => e.target.value && setDesde(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="evo-hasta" className="text-xs">
            Hasta
          </Label>
          <Input
            id="evo-hasta"
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => e.target.value && setHasta(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGOS.map((r) => {
            const activo =
              hasta === hoy && desde === (r.meses == null ? primerDia : haceMeses(r.meses));
            return (
              <Button
                key={r.etiqueta}
                type="button"
                size="sm"
                variant={activo ? "secondary" : "outline"}
                onClick={() => elegirRango(r.meses)}
              >
                {r.etiqueta}
              </Button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar artículo u OEM..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Switch checked={soloCambios} onCheckedChange={setSoloCambios} />
          Solo cambios de precio
        </label>
        <Button
          type="button"
          onClick={exportarPdf}
          disabled={generando}
          className="gap-2 sm:ml-auto"
        >
          {generando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          PDF
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 space-y-5 lg:w-52">
          <Faceta
            titulo="Rubro"
            valores={opcionesRubro}
            seleccion={rubros}
            onToggle={(v) => setRubros((s) => alternar(s, v))}
          />
          <Faceta
            titulo="Marca"
            valores={opcionesMarca}
            seleccion={marcas}
            onToggle={(v) => setMarcas((s) => alternar(s, v))}
          />
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {kpis.map((k) => (
              <Kpi key={k.etiqueta} {...k} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Mismo eje de meses en los dos: se leen como un solo gráfico partido
                (dos medidas distintas nunca comparten eje Y). */}
            <Panel
              titulo="Por mes"
              subtitulo="Cantidad de cambios y variación promedio de esos cambios"
            >
              <p className="text-xs font-medium text-muted-foreground">Cambios de precio</p>
              <div className="h-36">
                {hayCambios ? (
                  <GraficoCambiosMes datos={analisis.porMes} pal={PAL_PANTALLA} />
                ) : (
                  <Vacio />
                )}
              </div>
              <p className="mt-3 text-xs font-medium text-muted-foreground">Variación promedio</p>
              <div className="h-36">
                {hayCambios ? (
                  <GraficoVariacionMes
                    datos={analisis.porMes}
                    pal={PAL_PANTALLA}
                    compacto={esMovil}
                  />
                ) : (
                  <Vacio />
                )}
              </div>
            </Panel>

            <Panel
              panelRef={refArticulo}
              titulo={nombreArticulo ? `Evolución: ${nombreArticulo}` : "Evolución de un artículo"}
              subtitulo="Precio de venta y costo en cada registro"
              extra={
                <div className="w-full sm:w-64">
                  <BuscadorSelect
                    placeholder="Elegir artículo del historial..."
                    emptyLabel="Sin artículos"
                    value={idArticulo}
                    label={nombreArticulo}
                    buscar={async () => catalogo}
                    itemKey={(a) => a.id_articulo}
                    itemTitle={(a) => a.descripcion}
                    itemSub={(a) => (a.codigo_oem ? `OEM ${a.codigo_oem}` : `#${a.id_articulo}`)}
                    onSelect={(a) => setIdElegido(a.id_articulo)}
                  />
                </div>
              }
            >
              <div className="h-72">
                {serie.length > 1 ? (
                  <GraficoArticulo datos={serie} pal={PAL_PANTALLA} />
                ) : (
                  <Vacio
                    texto={
                      idArticulo == null
                        ? "Elegí un artículo para ver su evolución."
                        : "El artículo no tiene precios en el período."
                    }
                  />
                )}
              </div>
              {serie.length > 1 && (
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-0.5 w-4 rounded"
                      style={{ background: PAL_PANTALLA.acento }}
                    />
                    Precio venta
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-0.5 w-4 rounded"
                      style={{ background: PAL_PANTALLA.contexto }}
                    />
                    Costo
                  </span>
                </div>
              )}
            </Panel>

            <Panel
              titulo="Mayores aumentos del período"
              subtitulo="Último precio vs. el vigente al inicio · tocá una barra para ver su evolución"
            >
              <div className="h-80">
                {analisis.top.length ? (
                  <GraficoRanking
                    datos={analisis.top}
                    pal={PAL_PANTALLA}
                    compacto={esMovil}
                    onElegir={(b) => verArticulo(Number(b.clave))}
                  />
                ) : (
                  <Vacio />
                )}
              </div>
            </Panel>

            <Panel
              titulo="Variación promedio por rubro"
              subtitulo={
                analisis.totalRubros > analisis.porRubro.length
                  ? `Los ${analisis.porRubro.length} rubros que más subieron, de ${analisis.totalRubros}`
                  : "Aumento promedio de los artículos que cambiaron"
              }
            >
              <div className="h-80">
                {analisis.porRubro.length ? (
                  <GraficoRanking datos={analisis.porRubro} pal={PAL_PANTALLA} compacto={esMovil} />
                ) : (
                  <Vacio />
                )}
              </div>
            </Panel>
          </div>

          <DataTable
            columns={COLUMNAS}
            rows={filasTabla}
            getRowId={(r) => r.id_precio}
            initialSort={{ key: "fecha", dir: "desc" }}
            globalSearch={false}
            exportName="evolucion-precios"
            emptyText="Sin cambios de precio en el período."
            actionsHeader=""
            actions={(r) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => verArticulo(r.id_articulo)}
                aria-label="Ver evolución del artículo"
                title="Ver evolución del artículo"
              >
                <IconoLinea className="h-4 w-4" />
              </Button>
            )}
          />
        </div>
      </div>
    </div>
  );
}
