import { cloneElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, FileDown, Loader2, Minus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BuscadorSelect } from "@/components/ui/buscador-select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { getSesion, listarConteoEfectivo, urlImagenBillete } from "@/lib/api";
import { exportarPdfReporte, graficoAPng, type GraficoPdf, type KpiPdf } from "@/lib/export";
import { cn } from "@/lib/utils";

// Pestaña "Comparación" de Conteo de Efectivo (pág 85): compara el conteo de una
// fecha contra el conteo anterior, los últimos 7/30 o fechas elegidas.
//
// Sin endpoint propio: pide el historial completo al mismo LISTAR del listado
// (dias=0) y agrupa en el front por fecha y por billete. Tres preguntas, de arriba
// hacia abajo: ¿cuánto cambió? (tarjeta), ¿qué billetes cambiaron? (gráfico por
// billete) y ¿es normal? (tendencia del total, solo contra varias fechas).

const COD_EMPRESA = 24;
// Hasta 7 fechas comparadas cada una tiene su barra y su color (+ el día analizado
// = los 8 colores categóricos). Con más (Últimos 30) se compara contra el promedio.
const POR_FECHA_MAX = 7;
const MAX_ELEGIDAS = POR_FECHA_MAX;

// ─── Paletas ────────────────────────────────────────────────────────────────
// Mismos roles que evolucion-precios (skill dataviz): acento = el día analizado,
// contexto = el promedio (gris a propósito), fechas = un color categórico por
// fecha comparada (los 7 de --viz-serie-* sin el naranja, que es del día; orden
// validado con el script de la skill en claro y oscuro).
type Paleta = {
  acento: string;
  contexto: string;
  fechas: string[];
  tinta: string;
  tintaSuave: string;
  grilla: string;
  eje: string;
  superficie: string;
};

const PAL_PANTALLA: Paleta = {
  acento: "var(--viz-acento)",
  contexto: "var(--viz-contexto)",
  fechas: [1, 3, 4, 5, 6, 7, 8].map((i) => `var(--viz-serie-${i})`),
  tinta: "var(--foreground)",
  tintaSuave: "var(--muted-foreground)",
  grilla: "var(--viz-grilla)",
  eje: "var(--viz-eje)",
  superficie: "var(--card)",
};

// PDF: hex del modo claro (dentro de la imagen no se resuelven variables CSS).
const PAL_PDF: Paleta = {
  acento: "#eb6834",
  contexto: "#898781",
  fechas: ["#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  tinta: "#0b0b0b",
  tintaSuave: "#52514e",
  grilla: "#e1e0d9",
  eje: "#c3c2b7",
  superficie: "#ffffff",
};

// ─── Formato ────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtNum = (n: number | null | undefined) => (n == null ? "—" : nf0.format(n));
const fmtSigno = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${nf0.format(n)}`;
// Cantidad de billetes: el promedio puede tener decimales ("+2,3"), un conteo no.
const fmtCant = (n: number | null | undefined) =>
  n == null ? "—" : Number.isInteger(n) ? nf0.format(n) : nf1.format(n);
const fmtCantSigno = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${fmtCant(n)}`;
// Espacio duro antes del "%" (si no, el "%" queda solo en otro renglón).
const NBSP = String.fromCharCode(160);
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${nf1.format(n)}${NBSP}%`;
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const fmtFechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtFechaLarga = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${DIAS_SEMANA[new Date(y, m - 1, d).getDay()]} ${fmtFecha(iso)}`;
};
// Las fuentes estándar de jsPDF no tienen la raya larga (ver export.ts).
const paraPdf = (s: string) => s.replace(/—/g, "-").split(NBSP).join(" ");
const nombreDiaCorto = (d?: { fecha: string }) => (d ? fmtFecha(d.fecha) : "");
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ─── Datos ──────────────────────────────────────────────────────────────────

// Un conteo = todas las filas de CONTEO_EFECTIVO de una fecha (una por billete).
type Dia = { fecha: string; total: number; billetes: number; porValor: Map<number, number> };

// Una fila por billete: cantidad del día analizado contra la referencia (la
// cantidad del conteo anterior, o el promedio de las fechas comparadas).
type FilaBillete = {
  valor: number;
  etiqueta: string;
  dia: number;
  // No se llama "ref": recharts pasa los campos de la fila como props del <path> de
  // la barra y React toma "ref" como referencia ("Expected ref to be a function").
  referencia: number;
  dif: number; // billetes
  difMonto: number; // Gs.
};

type Modo = "anterior" | "7" | "30" | "elegir";
const MODOS: { valor: Modo; etiqueta: string }[] = [
  { valor: "anterior", etiqueta: "Conteo anterior" },
  { valor: "7", etiqueta: "Últimos 7" },
  { valor: "30", etiqueta: "Últimos 30" },
  { valor: "elegir", etiqueta: "Elegir fechas" },
];

// Una barra por serie: el día analizado, cada fecha comparada o el promedio.
type SerieBarra = {
  i: number;
  nombre: string;
  tipo: "dia" | "fecha" | "promedio";
  slot: number;
  fecha?: string; // YYYY-MM-DD (el promedio no tiene)
};
// Una fila por billete con el monto (`m<i>`) y la cantidad (`c<i>`) de cada serie.
type FilaBarras = {
  valor: number;
  etiqueta: string;
  difMonto: number;
  [k: string]: number | string;
};

const colorSerie = (pal: Paleta, s: SerieBarra) =>
  s.tipo === "dia" ? pal.acento : s.tipo === "promedio" ? pal.contexto : pal.fechas[s.slot];

// Alto del gráfico de billetes según cuántas barras lleva cada billete.
// Compacto (PDF): barras más finas para que el gráfico entre en la hoja debajo de
// los KPIs; con el grosor de pantalla, 8 barras por billete pasaban a la hoja 2.
const grosorBarra = (series: number, compacto = false) =>
  compacto ? (series > 4 ? 8 : 12) : series > 4 ? 10 : 14;
const separacion = (compacto = false) => (compacto ? 1 : 2);
const altoBilletes = (filas: number, series: number, compacto = false) =>
  Math.max(
    220,
    filas * (series * (grosorBarra(series, compacto) + separacion(compacto)) + 12) + 40,
  );

// ─── Gráficos ───────────────────────────────────────────────────────────────
// Igual que en evolucion-precios: el mismo componente dibuja en pantalla (ocupa
// su contenedor) y en el PDF (tamaño fijo, PAL_PDF, vía graficoAPng). Sin
// animación: el PDF no captura un cuadro a medio animar.

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

// Por billete, una barra por serie (día analizado, cada fecha o el promedio), con
// largo = monto (cantidad × valor) y el monto escrito al final. En el eje Y, la
// foto del billete al lado del valor; a la derecha, en una columna fija, la
// diferencia en plata del día contra la referencia (al lado de la barra se pisaba).
function GraficoBilletes({
  datos,
  series,
  pal,
  fijo,
  imagenDe,
  compacto = false,
}: {
  datos: FilaBarras[];
  series: SerieBarra[];
  pal: Paleta;
  fijo?: Fijo;
  imagenDe: (valor: number) => string | undefined;
  compacto?: boolean;
}) {
  const grosor = grosorBarra(series.length, compacto);
  return (
    <Lienzo fijo={fijo}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
        barGap={separacion(compacto)}
        barCategoryGap={10}
      >
        <CartesianGrid horizontal={false} stroke={pal.grilla} />
        <XAxis
          type="number"
          // Aire a la derecha para el monto rotulado de la barra más larga.
          domain={[0, (max: number) => max * 1.25]}
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
          tickFormatter={(v: number) => nf0.format(v)}
        />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={112}
          interval={0}
          axisLine={false}
          tickLine={false}
          tick={(p: {
            x: number | string;
            y: number | string;
            index: number;
            payload: { value: string };
          }) => {
            const x = Number(p.x);
            const y = Number(p.y);
            const img = imagenDe(datos[p.index]?.valor);
            return (
              <g>
                {img && (
                  <image
                    href={img}
                    x={x - 106}
                    y={y - 12}
                    width={44}
                    height={24}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
                <text x={x - 4} y={y} dy={4} textAnchor="end" fontSize={11} fill={pal.tinta}>
                  {p.payload.value}
                </text>
              </g>
            );
          }}
        />
        <YAxis
          yAxisId="dif"
          orientation="right"
          type="category"
          dataKey="etiqueta"
          width={72}
          interval={0}
          axisLine={false}
          tickLine={false}
          tick={(p: { x: number | string; y: number | string; index: number }) => {
            const d = datos[p.index]?.difMonto ?? 0;
            return (
              <text x={Number(p.x) + 6} y={Number(p.y)} dy={4} fontSize={10} fill={pal.tinta}>
                {Math.round(d) ? fmtSigno(d) : "0"}
              </text>
            );
          }}
        />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          // Fecha descendente (recharts 3 ordena por nombre si no se le dice: con el
          // día de la semana adelante quedaba "jue, lun, mar…"). Ordena de menor a
          // mayor, así que la fecha va en negativo; el promedio, sin fecha, al final.
          itemSorter={(item) => {
            const s = series.find((x) => `m${x.i}` === String(item.dataKey));
            return s?.fecha ? -Number(s.fecha.replaceAll("-", "")) : 1;
          }}
          formatter={(v, nombre, item) => {
            const cant = item?.payload?.[String(item.dataKey ?? "").replace(/^m/, "c")];
            return [`${fmtNum(Number(v))} (${fmtCant(Number(cant))} billetes)`, String(nombre)];
          }}
        />
        {series.map((s) => (
          <Bar
            key={s.i}
            dataKey={`m${s.i}`}
            name={s.nombre}
            fill={colorSerie(pal, s)}
            radius={[0, 4, 4, 0]}
            barSize={grosor}
            isAnimationActive={false}
          >
            <LabelList
              dataKey={`m${s.i}`}
              position="right"
              offset={4}
              style={{ fontSize: series.length > 4 ? 9 : 10, fill: pal.tinta }}
              formatter={(v: unknown) => (Number(v) ? fmtNum(Number(v)) : "")}
            />
          </Bar>
        ))}
      </BarChart>
    </Lienzo>
  );
}

// Total de cada conteo en orden cronológico: el día analizado en color, las fechas
// comparadas en gris y una línea punteada en su promedio.
function GraficoTendencia({
  puntos,
  referencia,
  pal,
  fijo,
  slots,
}: {
  puntos: { fecha: string; etiqueta: string; total: number; esDia: boolean }[];
  referencia: number;
  pal: Paleta;
  fijo?: Fijo;
  slots?: Map<string, number>; // fecha -> color, el mismo del gráfico de billetes
}) {
  return (
    <Lienzo fijo={fijo}>
      <BarChart data={puntos} margin={{ top: 12, right: 56, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={pal.grilla} />
        <XAxis
          dataKey="etiqueta"
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          width={76}
          tick={tick(pal)}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => nf0.format(v)}
        />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          labelFormatter={(_, p) => (p?.[0] ? fmtFechaLarga(String(p[0].payload.fecha)) : "")}
          formatter={(v) => [fmtNum(Number(v)), "Total contado"]}
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
          {puntos.map((p) => (
            <Cell
              key={p.fecha}
              fill={
                p.esDia
                  ? pal.acento
                  : slots?.has(p.fecha)
                    ? pal.fechas[slots.get(p.fecha)!]
                    : pal.contexto
              }
            />
          ))}
        </Bar>
        <ReferenceLine
          y={referencia}
          stroke={pal.tinta}
          strokeDasharray="4 4"
          label={{ value: "Promedio", position: "right", fontSize: 10, fill: pal.tintaSuave }}
        />
      </BarChart>
    </Lienzo>
  );
}

// ─── Piezas de la pantalla ──────────────────────────────────────────────────

function Panel({
  titulo,
  subtitulo,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border p-4", className)}>
      <h3 className="font-semibold leading-tight">{titulo}</h3>
      {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Clave de color de los gráficos (el color nunca es la única pista: va rotulada).
function Clave({ items }: { items: { color: string; texto: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: i.color }} />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

// Foto chica del billete (endpoint público de MONEDAS_DETALLE); sin foto, un hueco.
function FotoBillete({ codMoneda, valor }: { codMoneda: number; valor: number }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return <span className="h-7 w-14 shrink-0" aria-hidden />;
  return (
    <img
      src={urlImagenBillete(codMoneda, valor)}
      alt=""
      loading="lazy"
      onError={() => setFallo(true)}
      className="h-7 w-14 shrink-0 rounded border border-border bg-muted/30 object-contain"
    />
  );
}

async function fotosComoDataUrl(codMoneda: number, valores: number[]) {
  const fotos = new Map<number, string>();
  await Promise.all(
    valores.map(async (valor) => {
      try {
        const res = await fetch(urlImagenBillete(codMoneda, valor));
        if (!res.ok) return;
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) return;
        const dataUrl = await new Promise<string>((ok, mal) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result));
          r.onerror = mal;
          r.readAsDataURL(blob);
        });
        fotos.set(valor, dataUrl);
      } catch {
        // sin foto: el PDF sale igual, con el valor solo
      }
    }),
  );
  return fotos;
}

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ─── Vista ──────────────────────────────────────────────────────────────────

export function ComparacionConteo() {
  const appUser = getSesion()?.app_user ?? "";
  // Misma queryKey que el listado con "Mostrar todos": si ya se pidió, no se repite,
  // y las altas/bajas del listado (que invalidan "conteo-efectivo") la refrescan.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["conteo-efectivo", COD_EMPRESA, appUser, "", 0],
    queryFn: () => listarConteoEfectivo(COD_EMPRESA, appUser, undefined, 0),
    retry: false,
  });

  const [codMonedaSel, setCodMonedaSel] = useState<number | null>(null);
  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("anterior");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [generando, setGenerando] = useState(false);

  // Monedas con conteos, la más usada primero (la de por defecto). No se suman
  // monedas distintas: el selector solo aparece si hay más de una.
  const monedas = useMemo(() => {
    const m = new Map<number, { cod: number; nombre: string; filas: number }>();
    for (const r of data ?? []) {
      const g = m.get(r.cod_moneda);
      if (g) g.filas++;
      else
        m.set(r.cod_moneda, {
          cod: r.cod_moneda,
          nombre: r.moneda ?? `Moneda ${r.cod_moneda}`,
          filas: 1,
        });
    }
    return [...m.values()].sort((a, b) => b.filas - a.filas);
  }, [data]);
  const moneda = monedas.find((m) => m.cod === codMonedaSel) ?? monedas[0];

  // Un Dia por fecha (de la moneda elegida), de la más reciente a la más vieja.
  const dias = useMemo(() => {
    const porFecha = new Map<string, Dia>();
    for (const r of data ?? []) {
      if (!moneda || r.cod_moneda !== moneda.cod) continue;
      const f = r.fecha.slice(0, 10);
      let d = porFecha.get(f);
      if (!d) {
        d = { fecha: f, total: 0, billetes: 0, porValor: new Map() };
        porFecha.set(f, d);
      }
      d.total += r.total ?? 0;
      d.billetes += r.cantidad ?? 0;
      d.porValor.set(r.valor, (d.porValor.get(r.valor) ?? 0) + (r.cantidad ?? 0));
    }
    return [...porFecha.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [data, moneda]);

  // Día analizado: el elegido o, por defecto, el último con conteo.
  const dia = dias.find((d) => d.fecha === fechaSel) ?? dias[0];
  const anteriores = useMemo(
    () => (dia ? dias.filter((d) => d.fecha < dia.fecha) : []),
    [dias, dia],
  );
  const comparadas = useMemo(() => {
    if (!dia) return [];
    if (modo === "anterior") return anteriores.slice(0, 1);
    if (modo === "7") return anteriores.slice(0, 7);
    if (modo === "30") return anteriores.slice(0, 30);
    return dias.filter((d) => d.fecha !== dia.fecha && elegidas.includes(d.fecha));
  }, [dia, modo, anteriores, dias, elegidas]);
  const n = comparadas.length;

  // Referencia: el total del conteo comparado, o el promedio de los comparados.
  const refTotal = promedio(comparadas.map((c) => c.total));
  const refBilletes = promedio(comparadas.map((c) => c.billetes));
  const dif = dia && n ? dia.total - refTotal : null;
  const difPct = dif != null && refTotal ? (dif / refTotal) * 100 : null;

  const filas = useMemo<FilaBillete[]>(() => {
    if (!dia) return [];
    const valores = new Set<number>(dia.porValor.keys());
    for (const c of comparadas) for (const v of c.porValor.keys()) valores.add(v);
    return [...valores]
      .sort((a, b) => b - a)
      .map((valor) => {
        const cantDia = dia.porValor.get(valor) ?? 0;
        const cants = comparadas.map((c) => c.porValor.get(valor) ?? 0);
        const ref = promedio(cants);
        return {
          valor,
          etiqueta: nf0.format(valor),
          dia: cantDia,
          referencia: ref,
          dif: cantDia - ref,
          difMonto: (cantDia - ref) * valor,
        };
      });
  }, [dia, comparadas]);

  // Series de barras: el día y, hasta 7 fechas, una por fecha (la más reciente
  // primero); con más, el promedio.
  const porFecha = n > 0 && n <= POR_FECHA_MAX;
  const series = useMemo<SerieBarra[]>(() => {
    if (!dia || !n) return [];
    const base: SerieBarra = {
      i: 0,
      nombre: `${fmtFechaLarga(dia.fecha)} (analizado)`,
      tipo: "dia",
      slot: 0,
      fecha: dia.fecha,
    };
    return porFecha
      ? [
          base,
          ...comparadas.map<SerieBarra>((c, k) => ({
            i: k + 1,
            nombre: fmtFechaLarga(c.fecha),
            tipo: "fecha",
            slot: k,
            fecha: c.fecha,
          })),
        ]
      : [base, { i: 1, nombre: `Promedio de ${n} conteos`, tipo: "promedio", slot: 0 }];
  }, [dia, n, porFecha, comparadas]);
  const slots = useMemo(
    () => new Map(porFecha ? comparadas.map((c, k) => [c.fecha, k] as const) : []),
    [porFecha, comparadas],
  );
  const datosBarras = useMemo<FilaBarras[]>(
    () =>
      filas.map((f) => {
        const fila: FilaBarras = { valor: f.valor, etiqueta: f.etiqueta, difMonto: f.difMonto };
        fila.m0 = f.dia * f.valor;
        fila.c0 = f.dia;
        if (porFecha) {
          comparadas.forEach((c, k) => {
            const q = c.porValor.get(f.valor) ?? 0;
            fila[`m${k + 1}`] = q * f.valor;
            fila[`c${k + 1}`] = q;
          });
        } else {
          fila.m1 = f.referencia * f.valor;
          fila.c1 = f.referencia;
        }
        return fila;
      }),
    [filas, porFecha, comparadas],
  );
  const subtituloBilletes = !n
    ? ""
    : porFecha
      ? n === 1
        ? `Monto de cada billete (cantidad × valor): el ${nombreDiaCorto(dia)} contra el ${fmtFecha(comparadas[0].fecha)}. A la derecha, la diferencia en plata.`
        : `Monto de cada billete (cantidad × valor) en cada fecha. A la derecha, la diferencia en plata del día analizado contra el promedio de las ${n} fechas.`
      : `Monto de cada billete (cantidad × valor): el día analizado contra el promedio de los ${n} conteos. A la derecha, la diferencia en plata.`;

  // El billete que más movió la diferencia (en plata, no en cantidad).
  const masMovio = useMemo(
    () =>
      filas.reduce<FilaBillete | null>(
        (m, f) => (Math.abs(f.difMonto) > Math.abs(m?.difMonto ?? 0) ? f : m),
        null,
      ),
    [filas],
  );

  const tendencia = useMemo(
    () =>
      dia
        ? [...comparadas, dia]
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map((d) => ({
              fecha: d.fecha,
              etiqueta: fmtFechaCorta(d.fecha),
              total: d.total,
              esDia: d.fecha === dia.fecha,
            }))
        : [],
    [comparadas, dia],
  );

  const nombreDia = dia ? fmtFecha(dia.fecha) : "";
  const textoRef =
    n === 1
      ? `el conteo del ${fmtFechaLarga(comparadas[0].fecha)}`
      : `el promedio de ${n} conteos${modo === "elegir" ? " elegidos" : " anteriores"}`;

  function descripcionComparacion(): string {
    if (!n) return "sin fechas para comparar";
    if (n === 1) return `conteo del ${fmtFecha(comparadas[0].fecha)}`;
    const desde = comparadas[comparadas.length - 1].fecha;
    const hasta = comparadas[0].fecha;
    return `promedio de ${n} conteos (del ${fmtFecha(desde)} al ${fmtFecha(hasta)})`;
  }

  const columnas = useMemo<Column<FilaBillete>[]>(
    () => [
      {
        key: "valor",
        header: "Billete",
        num: true,
        hideable: false,
        accessor: (r) => r.valor,
        render: (r) => (
          <span className="inline-flex items-center justify-end gap-2">
            {moneda && <FotoBillete codMoneda={moneda.cod} valor={r.valor} />}
            <span className="font-mono">{fmtNum(r.valor)}</span>
          </span>
        ),
        footer: () => "Total",
      },
      {
        key: "dia",
        header: nombreDia || "Día",
        num: true,
        accessor: (r) => r.dia,
        render: (r) => <span className="font-mono">{fmtCant(r.dia)}</span>,
        footer: (rows) => (
          <span className="font-mono">{fmtCant(rows.reduce((a, r) => a + r.dia, 0))}</span>
        ),
      },
      {
        key: "referencia",
        header: n === 1 ? fmtFecha(comparadas[0].fecha) : "Promedio",
        num: true,
        accessor: (r) => r.referencia,
        render: (r) => <span className="font-mono">{fmtCant(r.referencia)}</span>,
        footer: (rows) => (
          <span className="font-mono">{fmtCant(rows.reduce((a, r) => a + r.referencia, 0))}</span>
        ),
      },
      {
        key: "dif",
        header: "Dif. billetes",
        num: true,
        accessor: (r) => r.dif,
        render: (r) => <span className="font-mono">{fmtCantSigno(r.dif)}</span>,
        footer: (rows) => (
          <span className="font-mono">{fmtCantSigno(rows.reduce((a, r) => a + r.dif, 0))}</span>
        ),
      },
      {
        key: "difMonto",
        header: "Dif. monto",
        num: true,
        accessor: (r) => r.difMonto,
        render: (r) => <span className="font-mono font-semibold">{fmtSigno(r.difMonto)}</span>,
        footer: (rows) => (
          <span className="font-mono">{fmtSigno(rows.reduce((a, r) => a + r.difMonto, 0))}</span>
        ),
      },
    ],
    [moneda, nombreDia, n, comparadas],
  );

  function agregarFecha(f: string) {
    if (elegidas.includes(f)) return;
    if (elegidas.length >= MAX_ELEGIDAS) {
      toast.error(`Se pueden comparar hasta ${MAX_ELEGIDAS} fechas`);
      return;
    }
    setElegidas([...elegidas, f].sort((a, b) => b.localeCompare(a)));
  }

  async function exportarPdf() {
    if (!dia) return;
    setGenerando(true);
    try {
      const relacionDe = (f: Fijo) => f.alto / f.ancho;
      const png = (g: ReactElement, f: Fijo) => graficoAPng(g, f.ancho, f.alto);
      const graficos: GraficoPdf[] = [];
      if (n) {
        const fotos = moneda
          ? await fotosComoDataUrl(
              moneda.cod,
              filas.map((x) => x.valor),
            )
          : new Map();
        const fijo = { ancho: 1200, alto: altoBilletes(filas.length, series.length, true) };
        graficos.push({
          titulo: "Billetes por denominación",
          subtitulo: paraPdf(subtituloBilletes),
          png: await png(
            <GraficoBilletes
              datos={datosBarras}
              series={series}
              pal={PAL_PDF}
              fijo={fijo}
              imagenDe={(v) => fotos.get(v)}
              compacto
            />,
            fijo,
          ),
          relacion: relacionDe(fijo),
          anchoCompleto: true,
          leyenda: series.map((x) => ({ color: colorSerie(PAL_PDF, x), texto: paraPdf(x.nombre) })),
        });
      }
      if (n > 1) {
        const fijo = { ancho: 640, alto: 290 };
        graficos.push({
          titulo: "Total de cada conteo",
          subtitulo: porFecha
            ? "Cada fecha con el mismo color que en el gráfico de billetes; la línea punteada es el promedio de las fechas comparadas"
            : "El día analizado en color; la línea punteada es el promedio de las otras fechas",
          png: await png(
            <GraficoTendencia
              puntos={tendencia}
              referencia={refTotal}
              pal={PAL_PDF}
              fijo={fijo}
              slots={slots}
            />,
            fijo,
          ),
          relacion: relacionDe(fijo),
        });
      }

      const kpis: KpiPdf[] = [
        {
          etiqueta: `Total del ${nombreDia}`,
          valor: fmtNum(dia.total),
          detalle: `${fmtNum(dia.billetes)} billetes`,
        },
      ];
      if (n) {
        kpis.push(
          {
            etiqueta:
              n === 1 ? `Conteo del ${fmtFecha(comparadas[0].fecha)}` : `Promedio de ${n} conteos`,
            valor: fmtNum(refTotal),
            detalle: `${fmtCant(refBilletes)} billetes`,
          },
          { etiqueta: "Diferencia", valor: fmtSigno(dif), detalle: fmtPct(difPct) },
        );
        if (masMovio && masMovio.difMonto) {
          kpis.push({
            etiqueta: "Lo que más la explica",
            valor: `Billetes de ${fmtNum(masMovio.valor)}`,
            detalle: `${fmtCantSigno(masMovio.dif)} billetes (${fmtSigno(masMovio.difMonto)})`,
          });
        }
      }

      await exportarPdfReporte({
        titulo: "Comparación de Conteo de Efectivo",
        subtitulo: [
          moneda ? `Moneda: ${moneda.nombre}` : null,
          `Fecha: ${fmtFechaLarga(dia.fecha)}`,
          `Comparado con: ${descripcionComparacion()}`,
        ]
          .filter(Boolean)
          .join(" · "),
        archivo: `comparacion-conteo-${dia.fecha}`,
        usuario: getSesion()?.usuario,
        kpis: kpis.map((k) => ({
          etiqueta: paraPdf(k.etiqueta),
          valor: paraPdf(k.valor),
          detalle: k.detalle && paraPdf(k.detalle),
        })),
        graficos,
        tabla: {
          titulo: "Detalle por billete",
          columnas: [
            "Billete",
            nombreDia,
            n === 1 ? fmtFecha(comparadas[0].fecha) : "Promedio",
            "Dif. billetes",
            "Dif. monto",
          ],
          filas: filas.map((f) =>
            [
              fmtNum(f.valor),
              fmtCant(f.dia),
              fmtCant(f.referencia),
              fmtCantSigno(f.dif),
              fmtSigno(f.difMonto),
            ].map(paraPdf),
          ),
          numericas: [0, 1, 2, 3, 4],
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }

  const cabecera = (
    <div className="border-b border-border p-4 sm:p-5">
      <h2 className="font-display text-xl font-bold">Conteo de Efectivo</h2>
      <p className="text-sm text-muted-foreground">
        Comparación del conteo de una fecha con fechas anteriores
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-elegant">
        {cabecera}
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }
  if (isError || !dia) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-elegant">
        {cabecera}
        <p
          className={cn(
            "p-8 text-center text-sm",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isError
            ? error instanceof Error
              ? error.message
              : "No se pudieron cargar los conteos"
            : "Todavía no hay conteos registrados."}
        </p>
      </div>
    );
  }

  const IconoDif = dif == null || dif === 0 ? Minus : dif > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      {cabecera}

      <div className="space-y-4 p-4 sm:p-5">
        {/* Controles: qué fecha se analiza y contra qué se compara */}
        <div className="flex flex-wrap items-end gap-3">
          {monedas.length > 1 && (
            <div className="w-full space-y-1 sm:w-44">
              <Label htmlFor="cmp-moneda" className="text-xs">
                Moneda
              </Label>
              <select
                id="cmp-moneda"
                value={moneda?.cod ?? ""}
                onChange={(e) => {
                  setCodMonedaSel(Number(e.target.value));
                  setFechaSel(null);
                  setElegidas([]);
                }}
                className={selectCls}
              >
                {monedas.map((m) => (
                  <option key={m.cod} value={m.cod}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="w-full space-y-1 sm:w-56">
            <Label htmlFor="cmp-fecha" className="text-xs">
              Fecha a analizar
            </Label>
            <select
              id="cmp-fecha"
              value={dia.fecha}
              onChange={(e) => {
                setFechaSel(e.target.value);
                setElegidas((xs) => xs.filter((x) => x !== e.target.value));
              }}
              className={selectCls}
            >
              {dias.map((d) => (
                <option key={d.fecha} value={d.fecha}>
                  {fmtFechaLarga(d.fecha)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Comparar con</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Comparar con">
              {MODOS.map((m) => (
                <Button
                  key={m.valor}
                  type="button"
                  size="sm"
                  variant={modo === m.valor ? "secondary" : "outline"}
                  aria-pressed={modo === m.valor}
                  onClick={() => setModo(m.valor)}
                >
                  {m.etiqueta}
                </Button>
              ))}
            </div>
          </div>
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

        {/* Elegir fechas: buscador para agregar + chips para quitar */}
        {modo === "elegir" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-72">
              <BuscadorSelect
                placeholder={
                  elegidas.length ? "Agregar otra fecha..." : "Agregar fecha a comparar..."
                }
                emptyLabel="No hay más fechas con conteo"
                value={null}
                label=""
                buscar={async () =>
                  dias.filter((d) => d.fecha !== dia.fecha && !elegidas.includes(d.fecha))
                }
                itemKey={(d) => d.fecha}
                itemTitle={(d) => fmtFechaLarga(d.fecha)}
                itemSub={(d) => `Total ${fmtNum(d.total)}`}
                onSelect={(d) => agregarFecha(d.fecha)}
                disabled={elegidas.length >= MAX_ELEGIDAS}
              />
            </div>
            {elegidas
              .filter((f) => f !== dia.fecha)
              .map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1 text-xs"
                >
                  {fmtFechaLarga(f)}
                  <button
                    type="button"
                    onClick={() => setElegidas(elegidas.filter((x) => x !== f))}
                    className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Quitar ${fmtFecha(f)}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            {elegidas.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setElegidas([])}>
                Quitar todas
              </Button>
            )}
          </div>
        )}

        {/* 1) ¿Cuánto cambió? */}
        <section className="rounded-xl border border-border p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">
            Total contado el {fmtFechaLarga(dia.fecha)}
            {monedas.length > 1 && moneda ? ` · ${moneda.nombre}` : ""}
          </p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {fmtNum(dia.total)}
          </p>
          {n ? (
            <>
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm">
                <IconoDif className="h-4 w-4 shrink-0" aria-hidden />
                <span className="font-semibold">{fmtSigno(dif)}</span>
                <span className="text-muted-foreground">({fmtPct(difPct)})</span>
                <span className="text-muted-foreground">
                  vs. {textoRef}: {fmtNum(refTotal)}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmtNum(dia.billetes)} billetes contados ({fmtCantSigno(dia.billetes - refBilletes)}{" "}
                vs. {n === 1 ? "ese conteo" : "el promedio"})
                {masMovio && masMovio.difMonto ? (
                  <>
                    {" · "}Lo que más explica la diferencia: billetes de{" "}
                    <span className="font-medium text-foreground">{fmtNum(masMovio.valor)}</span> (
                    {fmtCantSigno(masMovio.dif)}, {fmtSigno(masMovio.difMonto)})
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {modo === "elegir"
                ? "Agregá una o más fechas para comparar."
                : "No hay conteos anteriores a esta fecha para comparar."}
            </p>
          )}
        </section>

        {n > 0 && (
          <div className="grid gap-4">
            {/* 2) ¿Qué billetes cambiaron? */}
            <Panel titulo="Billetes por denominación" subtitulo={subtituloBilletes}>
              <div style={{ height: altoBilletes(filas.length, series.length) }}>
                <GraficoBilletes
                  datos={datosBarras}
                  series={series}
                  pal={PAL_PANTALLA}
                  imagenDe={(v) => (moneda ? urlImagenBillete(moneda.cod, v) : undefined)}
                />
              </div>
              <Clave
                items={series.map((x) => ({ color: colorSerie(PAL_PANTALLA, x), texto: x.nombre }))}
              />
            </Panel>

            {/* 3) ¿Es normal? (solo contra varias fechas) */}
            {n > 1 && (
              <Panel
                titulo="Total de cada conteo"
                subtitulo={
                  porFecha
                    ? "Cada fecha con el mismo color que en el gráfico de billetes; la línea punteada es el promedio de las fechas comparadas"
                    : "El día analizado en color; la línea punteada es el promedio de las fechas comparadas"
                }
              >
                <div className="h-72">
                  <GraficoTendencia
                    puntos={tendencia}
                    referencia={refTotal}
                    pal={PAL_PANTALLA}
                    slots={slots}
                  />
                </div>
              </Panel>
            )}
          </div>
        )}

        {n > 0 && (
          <DataTable
            columns={columnas}
            rows={filas}
            getRowId={(r) => r.valor}
            initialSort={{ key: "valor", dir: "desc" }}
            globalSearch={false}
            exportName={`comparacion-conteo-${dia.fecha}`}
          />
        )}
      </div>
    </div>
  );
}
