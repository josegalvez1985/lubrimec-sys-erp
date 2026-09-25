import {
  cloneElement,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
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
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { exportarPdfReporte, graficoAPng, type GraficoPdf } from "@/lib/export";
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
// barras), contexto = serie de referencia (costo) en gris a propósito, series =
// las 8 categóricas para comparar artículos (orden fijo, una por artículo).
type Paleta = {
  acento: string;
  contexto: string;
  series: string[];
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
  series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--viz-serie-${i})`),
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
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
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

const pct = (nuevo: number | null, anterior: number | null) =>
  nuevo == null || !anterior ? null : ((nuevo - anterior) / anterior) * 100;

// ─── Datos ──────────────────────────────────────────────────────────────────

// Un registro de PRECIOS_VENTAS con los datos del registro anterior del mismo
// artículo (lo que en SQL sería LAG() OVER (PARTITION BY id_articulo ...)).
type Cambio = PrecioVenta & {
  dia: string; // yyyy-mm-dd
  precio_anterior: number | null;
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

// Comparación de artículos: precio de venta y costo de cada uno, en Gs. Un solo
// dataset con dos columnas por artículo (`v<id>` venta, `k<id>` costo) con el valor
// vigente en cada fecha, para que el tooltip muestre todos en la misma fecha;
// `c<id>` marca los puntos donde ese artículo tuvo un registro de precio.
const MAX_COMPARAR = 8; // uno por color categórico: no se inventa un 9.º color

type SerieComparada = { id: number; slot: number; nombre: string; puntos: PuntoArticulo[] };
type PuntoComparado = { t: number; [clave: string]: number | boolean | null };

function armarComparacion(series: SerieComparada[]): PuntoComparado[] {
  const tiempos = [...new Set(series.flatMap((s) => s.puntos.map((p) => p.t)))].sort(
    (a, b) => a - b,
  );
  return tiempos.map((t) => {
    const fila: PuntoComparado = { t };
    for (const s of series) {
      let vigente: PuntoArticulo | undefined;
      for (const p of s.puntos) {
        if (p.t > t) break;
        vigente = p;
      }
      fila[`v${s.id}`] = vigente?.venta ?? null;
      fila[`k${s.id}`] = vigente?.costo ?? null;
      fila[`c${s.id}`] = s.puntos.some((p) => p.t === t && p.cambio);
    }
    return fila;
  });
}

// ─── Gráficos ───────────────────────────────────────────────────────────────
// Cada gráfico se dibuja igual en pantalla (ocupa su contenedor) y en el PDF
// (tamaño fijo, con PAL_PDF, vía graficoAPng). Sin animación: al filtrar se
// redibuja al instante y el PDF no captura un cuadro a medio animar.

type Fijo = { ancho: number; alto: number };

// Qué líneas dibujar: el selector del panel permite ocultar el costo o el precio.
type Lineas = "ambos" | "venta" | "costo";
const LINEAS: { valor: Lineas; etiqueta: string }[] = [
  { valor: "ambos", etiqueta: "Ambos" },
  { valor: "venta", etiqueta: "Precio venta" },
  { valor: "costo", etiqueta: "Costo" },
];
const QUE_SE_VE: Record<Lineas, string> = {
  ambos: "Precio de venta y costo",
  venta: "Precio de venta",
  costo: "Costo",
};

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

// Línea ESCALONADA (stepAfter): un precio rige hasta el cambio siguiente; una
// línea inclinada inventaría subas graduales que no existieron. Precio de venta
// en el acento, costo en gris de contexto; el hueco entre ambas es el margen.
function GraficoArticulo({
  datos,
  pal,
  fijo,
  lineas = "ambos",
}: {
  datos: PuntoArticulo[];
  pal: Paleta;
  fijo?: Fijo;
  lineas?: Lineas;
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
        {lineas !== "venta" && (
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
        )}
        {lineas !== "costo" && (
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
        )}
      </LineChart>
    </Lienzo>
  );
}

// Dos líneas escalonadas por artículo, en su color: precio de venta llena y costo
// punteada (el color dice QUÉ artículo, el trazo dice QUÉ medida; 16 colores no
// se distinguirían). Un solo eje en Gs. Con hasta 4 líneas el valor final va
// rotulado al lado de cada una; con más se pisarían y queda la leyenda.
function GraficoComparacion({
  datos,
  series,
  pal,
  fijo,
  lineas = "ambos",
}: {
  datos: PuntoComparado[];
  series: SerieComparada[];
  pal: Paleta;
  fijo?: Fijo;
  lineas?: Lineas;
}) {
  const n = datos.length;
  const conRotulo = series.length * (lineas === "ambos" ? 2 : 1) <= 4;
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
    (id: number, color: string) =>
    (props: { cx?: number; cy?: number; index?: number; payload?: PuntoComparado }) =>
      props.payload?.[`c${id}`] ? (
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
      <LineChart data={datos} margin={{ top: 12, right: conRotulo ? 64 : 16, left: 0, bottom: 0 }}>
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
          formatter={(v, nombre) => [fmtGs(Number(v)), String(nombre)]}
        />
        {series.flatMap((s) => [
          lineas !== "venta" && (
            <Line
              key={`k${s.id}`}
              type="stepAfter"
              dataKey={`k${s.id}`}
              name={`${s.nombre} · costo`}
              stroke={pal.series[s.slot]}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={punto(s.id, pal.series[s.slot])}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
              label={conRotulo ? rotuloFinal : false}
            />
          ),
          lineas !== "costo" && (
            <Line
              key={`v${s.id}`}
              type="stepAfter"
              dataKey={`v${s.id}`}
              name={`${s.nombre} · venta`}
              stroke={pal.series[s.slot]}
              strokeWidth={2}
              dot={punto(s.id, pal.series[s.slot])}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              label={conRotulo ? rotuloFinal : false}
            />
          ),
        ])}
      </LineChart>
    </Lienzo>
  );
}

// ─── Piezas de la pantalla ──────────────────────────────────────────────────

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

// Opciones de una faceta: primero las que más cambios de precio tienen, pero SIN
// mostrar el conteo (regla del proyecto, ver GUIA_FRONT "Facetas SIN conteo").
function contarOpciones(filas: Cambio[], valor: (c: Cambio) => string) {
  const n = new Map<string, number>();
  for (const c of filas) n.set(valor(c), (n.get(valor(c)) ?? 0) + (c.real ? 1 : 0));
  return [...n]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v]) => ({ valor: v, n: 0 }));
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
  const [viscosidades, setViscosidades] = useState<Set<string>>(() => new Set());
  const [soloCambios, setSoloCambios] = useState(true);
  const [idElegido, setIdElegido] = useState<number | null>(null);
  // Filtro por artículo (multi): cada uno guarda su color (slot) al elegirlo, así
  // quitar uno no repinta a los demás.
  const [elegidos, setElegidos] = useState<{ id: number; slot: number }[]>([]);
  const [generando, setGenerando] = useState(false);
  const [lineas, setLineas] = useState<Lineas>("ambos");
  const refArticulo = useRef<HTMLElement>(null);

  const historial = useMemo(() => armarHistorial(data ?? []), [data]);

  const primerDia = useMemo(() => {
    let min = hoy;
    for (const lista of historial.values()) if (lista[0].dia < min) min = lista[0].dia;
    return min;
  }, [historial, hoy]);

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

  // La faceta Viscosidad se muestra solo si el backend manda el campo (hace falta
  // re-ejecutar db/precios_ventas_sql.sql) y algún artículo la tiene cargada.
  const hayViscosidad = useMemo(() => (data ?? []).some((p) => p.viscosidad), [data]);

  // Facetas dependientes: cada una ofrece solo valores compatibles con las otras.
  const { filtrados, opcionesRubro, opcionesMarca, opcionesViscosidad } = useMemo(() => {
    const pasaRubro = (c: Cambio) => rubros.size === 0 || rubros.has(c.rubro ?? SIN_DATO);
    const pasaMarca = (c: Cambio) => marcas.size === 0 || marcas.has(c.marca ?? SIN_DATO);
    const pasaViscosidad = (c: Cambio) =>
      viscosidades.size === 0 || viscosidades.has(c.viscosidad ?? SIN_DATO);
    return {
      filtrados: delPeriodo.filter((c) => pasaRubro(c) && pasaMarca(c) && pasaViscosidad(c)),
      opcionesRubro: contarOpciones(
        delPeriodo.filter((c) => pasaMarca(c) && pasaViscosidad(c)),
        (c) => c.rubro ?? SIN_DATO,
      ),
      opcionesMarca: contarOpciones(
        delPeriodo.filter((c) => pasaRubro(c) && pasaViscosidad(c)),
        (c) => c.marca ?? SIN_DATO,
      ),
      opcionesViscosidad: contarOpciones(
        delPeriodo.filter((c) => pasaRubro(c) && pasaMarca(c)),
        (c) => c.viscosidad ?? SIN_DATO,
      ),
    };
  }, [delPeriodo, rubros, marcas, viscosidades]);

  const filasBase = useMemo(
    () => (soloCambios ? filtrados.filter((c) => c.real) : filtrados),
    [filtrados, soloCambios],
  );

  // Artículos que pasan los demás filtros: opciones del filtro por artículo. Se
  // arman antes de ese filtro (si no, al elegir uno la lista quedaría solo con él).
  const catalogo = useMemo(() => {
    const porId = new Map<
      number,
      { id_articulo: number; descripcion: string; codigo_oem: string | null }
    >();
    for (const c of filasBase) {
      if (porId.has(c.id_articulo)) continue;
      porId.set(c.id_articulo, {
        id_articulo: c.id_articulo,
        descripcion: c.descripcion_articulo ?? `Artículo ${c.id_articulo}`,
        codigo_oem: c.codigo_oem,
      });
    }
    return [...porId.values()].sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  }, [filasBase]);

  // Elegidos que siguen pasando los demás filtros (los otros quedan como chip
  // atenuado, sin desaparecer de golpe).
  const vigentes = useMemo(() => {
    const enCatalogo = new Set(catalogo.map((a) => a.id_articulo));
    return elegidos.filter((e) => enCatalogo.has(e.id));
  }, [catalogo, elegidos]);

  const filasTabla = useMemo(() => {
    if (!elegidos.length) return filasBase;
    const ids = new Set(vigentes.map((e) => e.id));
    return filasBase.filter((c) => ids.has(c.id_articulo));
  }, [filasBase, elegidos, vigentes]);

  const nombreDe = (id: number) => {
    const h = historial.get(id);
    return h?.[h.length - 1].descripcion_articulo ?? `Artículo ${id}`;
  };

  function agregarArticulo(id: number) {
    if (elegidos.some((e) => e.id === id)) return;
    if (elegidos.length >= MAX_COMPARAR) {
      toast.error(`Se pueden comparar hasta ${MAX_COMPARAR} artículos`);
      return;
    }
    const usados = new Set(elegidos.map((e) => e.slot));
    let slot = 0;
    while (usados.has(slot)) slot++;
    setElegidos([...elegidos, { id, slot }]);
  }

  // Artículo del gráfico de evolución: el elegido o, por defecto, el del cambio
  // más reciente (la primera fila de la tabla, que arranca ordenada por fecha).
  const masReciente = useMemo(
    () =>
      filasTabla.reduce<Cambio | null>(
        (m, c) =>
          m == null || c.fecha > m.fecha || (c.fecha === m.fecha && c.id_precio > m.id_precio)
            ? c
            : m,
        null,
      ),
    [filasTabla],
  );

  // Con 2 o más artículos filtrados el gráfico los compara. Si no, muestra uno: el
  // filtrado, o el tocado en la tabla, o por defecto el del cambio más reciente.
  // Si un filtro deja afuera al tocado, vuelve al más reciente (nunca muestra un
  // artículo que ya no aplica).
  const comparar = vigentes.length >= 2;
  const tocadoVigente =
    idElegido != null && filasTabla.some((c) => c.id_articulo === idElegido) ? idElegido : null;
  const idArticulo =
    vigentes.length === 1
      ? vigentes[0].id
      : elegidos.length
        ? null
        : (tocadoVigente ?? masReciente?.id_articulo ?? null);
  const histArticulo = idArticulo != null ? historial.get(idArticulo) : undefined;
  const articulo = histArticulo?.[histArticulo.length - 1];
  const serie = useMemo(
    () => (histArticulo ? serieArticulo(histArticulo, desde, hasta, hoy) : []),
    [histArticulo, desde, hasta, hoy],
  );
  const nombreArticulo =
    articulo?.descripcion_articulo ?? (articulo ? `Artículo ${articulo.id_articulo}` : "");

  const comparacion = useMemo(() => {
    if (!comparar) return null;
    const series: SerieComparada[] = vigentes
      .map((e) => {
        const hist = historial.get(e.id) ?? [];
        return {
          id: e.id,
          slot: e.slot,
          nombre: hist[hist.length - 1]?.descripcion_articulo ?? `Artículo ${e.id}`,
          puntos: serieArticulo(hist, desde, hasta, hoy),
        };
      })
      .filter((s) => s.puntos.length > 0);
    const datos = armarComparacion(series);
    const ultima = datos[datos.length - 1];
    const finales = new Map(
      series.map((s) => [
        s.id,
        {
          venta: (ultima?.[`v${s.id}`] as number | null) ?? null,
          costo: (ultima?.[`k${s.id}`] as number | null) ?? null,
        },
      ]),
    );
    return { datos, series, finales };
  }, [comparar, vigentes, historial, desde, hasta, hoy]);

  // Valores finales de un artículo en la leyenda, según las líneas visibles.
  const valoresFinales = (fin?: { venta: number | null; costo: number | null }) =>
    [
      lineas !== "costo" ? `venta ${fmtGs(fin?.venta)}` : null,
      lineas !== "venta" ? `costo ${fmtGs(fin?.costo)}` : null,
    ]
      .filter(Boolean)
      .join(" / ");

  // Selector de líneas: va en el encabezado del panel del gráfico.
  const selectorLineas = (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Líneas del gráfico">
      {LINEAS.map((l) => (
        <Button
          key={l.valor}
          type="button"
          size="sm"
          variant={lineas === l.valor ? "secondary" : "outline"}
          aria-pressed={lineas === l.valor}
          onClick={() => setLineas(l.valor)}
        >
          {l.etiqueta}
        </Button>
      ))}
    </div>
  );

  function verArticulo(id: number) {
    setIdElegido(id);
    refArticulo.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function elegirRango(meses: number | null) {
    setDesde(meses == null ? primerDia : haceMeses(meses));
    setHasta(hoy);
  }

  function descripcionFiltros(): string {
    const partes = [`Período: del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`];
    if (rubros.size) partes.push(`Rubro: ${[...rubros].join(", ")}`);
    if (marcas.size) partes.push(`Marca: ${[...marcas].join(", ")}`);
    if (viscosidades.size) partes.push(`Viscosidad: ${[...viscosidades].join(", ")}`);
    if (elegidos.length)
      partes.push(`Artículos: ${elegidos.map((e) => nombreDe(e.id)).join(", ")}`);
    if (texto.trim()) partes.push(`Búsqueda: "${texto.trim()}"`);
    if (!soloCambios) partes.push("Incluye precios sin cambio");
    return partes.join(" · ");
  }

  async function exportarPdf() {
    setGenerando(true);
    try {
      // Único gráfico del PDF: va a lo ancho de la hoja, así que se dibuja apaisado.
      const fijo = { ancho: 1200, alto: 330 };
      const relacion = fijo.alto / fijo.ancho;
      const png = (g: ReactElement) => graficoAPng(g, fijo.ancho, fijo.alto);
      const graficos: GraficoPdf[] = [];

      if (comparacion) {
        graficos.push({
          titulo: `Comparación de ${comparacion.series.length} artículos`,
          subtitulo:
            lineas === "ambos"
              ? "Precio de venta (línea llena) y costo (línea punteada) de cada artículo"
              : `${QUE_SE_VE[lineas]} de cada artículo`,
          png: await png(
            <GraficoComparacion
              datos={comparacion.datos}
              series={comparacion.series}
              pal={PAL_PDF}
              fijo={fijo}
              lineas={lineas}
            />,
          ),
          relacion,
          leyenda: comparacion.series.map((s) => ({
            color: PAL_PDF.series[s.slot],
            texto: paraPdf(`${s.nombre} (${valoresFinales(comparacion.finales.get(s.id))})`),
          })),
        });
      } else if (serie.length > 1) {
        graficos.push({
          titulo: `Evolución: ${nombreArticulo}`,
          subtitulo: `${QUE_SE_VE[lineas]} en cada registro`,
          png: await png(
            <GraficoArticulo datos={serie} pal={PAL_PDF} fijo={fijo} lineas={lineas} />,
          ),
          relacion,
          leyenda: [
            ...(lineas !== "costo" ? [{ color: PAL_PDF.acento, texto: "Precio venta" }] : []),
            ...(lineas !== "venta" ? [{ color: PAL_PDF.contexto, texto: "Costo" }] : []),
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

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {/* Filtros: una sola fila que acota gráficos y tabla */}
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

      {/* Filtro por artículo (multi): acota la tabla y, con 2 o más, el gráfico los compara */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <BuscadorSelect
            placeholder={
              elegidos.length ? "Agregar otro artículo..." : "Filtrar / comparar artículos..."
            }
            emptyLabel="Sin artículos con estos filtros"
            value={null}
            label=""
            buscar={async () =>
              catalogo.filter((a) => !elegidos.some((e) => e.id === a.id_articulo))
            }
            itemKey={(a) => a.id_articulo}
            itemTitle={(a) => a.descripcion}
            itemSub={(a) => (a.codigo_oem ? `OEM ${a.codigo_oem}` : `#${a.id_articulo}`)}
            onSelect={(a) => agregarArticulo(a.id_articulo)}
            disabled={elegidos.length >= MAX_COMPARAR}
          />
        </div>
        {elegidos.map((e) => {
          const vigente = vigentes.some((v) => v.id === e.id);
          const nombre = nombreDe(e.id);
          return (
            <span
              key={e.id}
              title={vigente ? nombre : `${nombre}: no pasa los otros filtros`}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1 text-xs",
                !vigente && "opacity-50",
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: PAL_PANTALLA.series[e.slot] }}
              />
              <span className={cn("truncate sm:max-w-[16rem]", !vigente && "line-through")}>
                {nombre}
              </span>
              <button
                type="button"
                onClick={() => setElegidos(elegidos.filter((x) => x.id !== e.id))}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Quitar ${nombre}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
        {elegidos.length > 1 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setElegidos([])}>
            Quitar todos
          </Button>
        )}
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
          {hayViscosidad && (
            <Faceta
              titulo="Viscosidad"
              valores={opcionesViscosidad}
              seleccion={viscosidades}
              onToggle={(v) => setViscosidades((s) => alternar(s, v))}
            />
          )}
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {comparacion ? (
            <Panel
              panelRef={refArticulo}
              titulo={`Comparación de ${comparacion.series.length} artículos`}
              subtitulo={`${QUE_SE_VE[lineas]} de cada artículo en cada registro`}
              extra={selectorLineas}
            >
              <div className="h-80">
                <GraficoComparacion
                  datos={comparacion.datos}
                  series={comparacion.series}
                  pal={PAL_PANTALLA}
                  lineas={lineas}
                />
              </div>
              {/* Clave del trazo (neutra) + un renglón por artículo con su color y
                  sus valores finales. */}
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {lineas !== "costo" && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 border-t-2 border-muted-foreground" />
                      Precio venta
                    </span>
                  )}
                  {lineas !== "venta" && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 border-t-2 border-dashed border-muted-foreground" />
                      Costo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {comparacion.series.map((s) => {
                    const fin = comparacion.finales.get(s.id);
                    return (
                      <span key={s.id} className="inline-flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: PAL_PANTALLA.series[s.slot] }}
                        />
                        <span className="truncate">{s.nombre}</span>
                        <span className="shrink-0 text-foreground">{valoresFinales(fin)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </Panel>
          ) : (
            <Panel
              panelRef={refArticulo}
              titulo={nombreArticulo ? `Evolución: ${nombreArticulo}` : "Evolución de un artículo"}
              subtitulo={`${QUE_SE_VE[lineas]} en cada registro`}
              extra={selectorLineas}
            >
              <div className="h-72">
                {serie.length > 1 ? (
                  <GraficoArticulo datos={serie} pal={PAL_PANTALLA} lineas={lineas} />
                ) : (
                  <Vacio
                    texto={
                      elegidos.length && !vigentes.length
                        ? "Los artículos elegidos no pasan los otros filtros."
                        : idArticulo == null
                          ? "Elegí un artículo para ver su evolución."
                          : "El artículo no tiene precios en el período."
                    }
                  />
                )}
              </div>
              {serie.length > 1 && (
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  {lineas !== "costo" && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-0.5 w-4 rounded"
                        style={{ background: PAL_PANTALLA.acento }}
                      />
                      Precio venta
                    </span>
                  )}
                  {lineas !== "venta" && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-0.5 w-4 rounded"
                        style={{ background: PAL_PANTALLA.contexto }}
                      />
                      Costo
                    </span>
                  )}
                </div>
              )}
            </Panel>
          )}

          <DataTable
            columns={COLUMNAS}
            rows={filasTabla}
            getRowId={(r) => r.id_precio}
            initialSort={{ key: "fecha", dir: "desc" }}
            globalSearch={false}
            exportName="evolucion-precios"
            emptyText="Sin cambios de precio en el período."
            actionsHeader=""
            actions={
              comparar
                ? undefined
                : (r) => (
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
                  )
            }
          />
        </div>
      </div>
    </div>
  );
}
