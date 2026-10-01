import { cloneElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, FileDown, Loader2, Minus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
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
import { getSesion, listarInventario, type InventarioRow } from "@/lib/api";
import { exportarPdfReporte, graficoAPng, type GraficoPdf, type KpiPdf } from "@/lib/export";
import { cn } from "@/lib/utils";

// Pestaña "Comparación" de Inventario (pág 58): compara un inventario (por defecto
// el último) con inventarios anteriores. Un inventario = todos los conteos de una
// fecha (decisión del usuario); si un artículo se contó dos veces el mismo día,
// vale el último conteo.
//
// Sin endpoint propio: reusa el LISTAR de la grilla (misma queryKey) y agrupa en el
// front. Tres preguntas, de arriba hacia abajo: ¿qué tan bien salió? (tarjeta en
// texto), ¿mejoramos? (exactitud de cada inventario) y ¿qué artículos fallaron, y
// fallan siempre? (diferencia por artículo + racha en los inventarios comparados).
//
// Color: una sola escala divergente en toda la pestaña. Faltante (rojo) y sobrante
// (azul) en los polos, exacto en gris neutro al medio: lo que "no pasó" queda
// atrás y los problemas saltan a la vista. Las fechas no llevan color propio (se
// pisaría con el rojo/azul de la escala): se nombran en el eje.

const COD_EMPRESA = 24;
// Fechas comparables a la vez: la racha del gráfico de artículos lleva un cuadrito
// por fecha y con más ya no entra al lado del nombre.
const MAX_COMPARADAS = 7;
// Con más fechas comparadas ("Todos"), la tabla y el PDF no llevan una columna por
// fecha sino "Con dif. en X de Y".
const MAX_COLUMNAS_FECHA = 7;
// Con más filas, el gráfico de exactitud se compacta (barra fina, solo el %).
const FILAS_COMPACTO = 12;
// Artículos del gráfico (los de mayor diferencia); el resto, en la tabla.
const TOP_ARTICULOS = 12;

// ─── Paletas ────────────────────────────────────────────────────────────────
// Divergente validada con la skill dataviz (rojo/azul pasan CVD y contraste en
// claro y oscuro; el gris del medio queda bajo 3:1 a propósito y lo compensan los
// porcentajes escritos y la tabla).
type Paleta = {
  faltante: string;
  exacto: string;
  sobrante: string;
  tinta: string;
  tintaSuave: string;
  grilla: string;
  eje: string;
  superficie: string;
};

const PAL_PANTALLA: Paleta = {
  faltante: "var(--viz-faltante)",
  exacto: "var(--viz-exacto)",
  sobrante: "var(--viz-sobrante)",
  tinta: "var(--foreground)",
  tintaSuave: "var(--muted-foreground)",
  grilla: "var(--viz-grilla)",
  eje: "var(--viz-eje)",
  superficie: "var(--card)",
};

// PDF: hex del modo claro (dentro de la imagen no se resuelven variables CSS).
const PAL_PDF: Paleta = {
  faltante: "#d03b3b",
  exacto: "#c9c8c1",
  sobrante: "#2a78d6",
  tinta: "#0b0b0b",
  tintaSuave: "#52514e",
  grilla: "#e1e0d9",
  eje: "#c3c2b7",
  superficie: "#ffffff",
};

const colorDif = (pal: Paleta, d: number) =>
  d < 0 ? pal.faltante : d > 0 ? pal.sobrante : pal.exacto;

// ─── Formato ────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const nfCompacto = new Intl.NumberFormat("es-PY", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtNum = (n: number | null | undefined) => (n == null ? "—" : nf0.format(n));
const fmtCant = (n: number | null | undefined) => (n == null ? "—" : nf2.format(n));
const fmtSigno = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${nf0.format(n)}`;
const fmtCantSigno = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${nf2.format(n)}`;
// Espacio duro antes del "%"/"u." (si no, la unidad queda sola en otro renglón).
const NBSP = String.fromCharCode(160);
const fmtPct = (n: number) => `${nf1.format(n)}${NBSP}%`;
const fmtPts = (n: number) => `${n > 0 ? "+" : ""}${nf1.format(n)}${NBSP}pts`;
const fmtU = (n: number) => `${fmtCantSigno(n)}${NBSP}u.`;
const fmtGs = (n: number) => `Gs.${NBSP}${fmtSigno(n)}`;
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
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Siguiente valor "redondo" (1, 2, 3, 4, 5, 6, 8 × 10^k) mayor o igual a v, con la
// mitad también redonda (el eje marca ±lim y ±lim/2). Con solo 1-2-5, un máximo de
// 2,6 M saltaba a 5 M y las barras quedaban a la mitad; con 1,5 la mitad daba 7,5.
const limiteRedondo = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v) ?? 10) * p;
};
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ─── Datos ──────────────────────────────────────────────────────────────────

type ConteoArt = {
  id: number;
  nombre: string;
  sistema: number;
  fisica: number;
  dif: number; // unidades (físico − sistema)
  costo: number | null;
  difGs: number | null; // dif × costo último; null si el artículo no tiene costo
};

// Un inventario = los conteos de una fecha.
type Inventario = {
  fecha: string;
  porArticulo: Map<number, ConteoArt>;
  n: number;
  exactos: number;
  conFaltante: number;
  conSobrante: number;
  uFaltan: number; // suma de diferencias negativas (≤ 0)
  uSobran: number; // suma de diferencias positivas (≥ 0)
  gsFaltan: number;
  gsSobran: number;
  sinCosto: number; // artículos con diferencia y sin costo (no suman en Gs.)
  exactitud: number; // % de artículos contados sin diferencia
};

type Medida = "u" | "gs";

type Modo = "anterior" | "3" | "6" | "todos" | "elegir";
const MODOS: { valor: Modo; etiqueta: string }[] = [
  { valor: "anterior", etiqueta: "Inventario anterior" },
  { valor: "3", etiqueta: "Últimos 3" },
  { valor: "6", etiqueta: "Últimos 6" },
  { valor: "todos", etiqueta: "Todos" },
  { valor: "elegir", etiqueta: "Elegir fechas" },
];

function armarInventarios(rows: InventarioRow[]): Inventario[] {
  // Por fecha y artículo, el último conteo (id mayor) pisa a los anteriores.
  const porFecha = new Map<string, Map<number, ConteoArt>>();
  for (const r of [...rows].sort((a, b) => a.id_inventario - b.id_inventario)) {
    if (!r.fecha) continue;
    const f = r.fecha.slice(0, 10);
    let m = porFecha.get(f);
    if (!m) {
      m = new Map();
      porFecha.set(f, m);
    }
    const sistema = r.cantidad_sistema ?? 0;
    const fisica = r.cantidad_fisica ?? 0;
    const dif = r.diferencia ?? fisica - sistema;
    const costo = r.costo_ultimo ?? null;
    m.set(r.id_articulo, {
      id: r.id_articulo,
      nombre: r.articulo || `Artículo ${r.id_articulo}`,
      sistema,
      fisica,
      dif,
      costo,
      difGs: costo == null ? null : dif * costo,
    });
  }
  return [...porFecha.entries()]
    .map(([fecha, porArticulo]) => resumir(fecha, porArticulo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Totales de un inventario a partir de sus conteos por artículo.
function resumir(fecha: string, porArticulo: Map<number, ConteoArt>): Inventario {
  const inv: Inventario = {
    fecha,
    porArticulo,
    n: porArticulo.size,
    exactos: 0,
    conFaltante: 0,
    conSobrante: 0,
    uFaltan: 0,
    uSobran: 0,
    gsFaltan: 0,
    gsSobran: 0,
    sinCosto: 0,
    exactitud: 0,
  };
  for (const a of porArticulo.values()) {
    if (a.dif === 0) {
      inv.exactos++;
      continue;
    }
    if (a.dif < 0) {
      inv.conFaltante++;
      inv.uFaltan += a.dif;
    } else {
      inv.conSobrante++;
      inv.uSobran += a.dif;
    }
    if (a.difGs == null) inv.sinCosto++;
    else if (a.difGs < 0) inv.gsFaltan += a.difGs;
    else inv.gsSobran += a.difGs;
  }
  inv.exactitud = inv.n ? (inv.exactos / inv.n) * 100 : 0;
  return inv;
}

// El mismo inventario recalculado solo con los artículos elegidos.
function soloArticulos(inv: Inventario, ids: Set<number>): Inventario {
  const m = new Map<number, ConteoArt>();
  for (const id of ids) {
    const a = inv.porArticulo.get(id);
    if (a) m.set(id, a);
  }
  return resumir(inv.fecha, m);
}

// En cuántos de los inventarios comparados se contó el artículo y en cuántos dio
// diferencia (null = no se contó ese día).
const vecesConDif = (previas: (number | null)[]) => ({
  contado: previas.filter((p) => p != null).length,
  conDif: previas.filter((p) => p != null && p !== 0).length,
});

// Catálogo del filtro: cada artículo contado alguna vez, con en cuántos inventarios.
type ArticuloContado = { id: number; nombre: string; veces: number; ultima: string };

// Una barra por inventario: % de artículos con faltante / exactos / con sobrante.
type FilaExactitud = {
  fecha: string;
  etiqueta: string;
  analizado: boolean;
  pFaltante: number;
  pExacto: number;
  pSobrante: number;
  inv: Inventario;
};

// Una fila por artículo del inventario analizado (los de mayor diferencia).
type FilaArticulo = {
  id: number;
  etiqueta: string;
  valor: number; // en la medida elegida (u. o Gs.)
  art: ConteoArt;
  // El mismo artículo en cada inventario comparado (del más viejo al más nuevo);
  // null = no se contó ese día.
  racha: { fecha: string; dif: number | null; difGs: number | null }[];
};

// Fila de la tabla: el inventario analizado + la diferencia en cada comparado.
type FilaTabla = ConteoArt & { previas: (number | null)[] };

// ─── Gráficos ───────────────────────────────────────────────────────────────
// Igual que en comparacion-conteo: el mismo componente dibuja en pantalla (ocupa
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

const tick = (pal: Paleta) => ({ fontSize: 11, fill: pal.tintaSuave });

function CajaTooltip({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{titulo}</p>
      <div className="space-y-0.5 text-foreground">{children}</div>
    </div>
  );
}

function Punto({ color }: { color: string }) {
  return (
    <span
      className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm align-middle"
      style={{ background: color }}
    />
  );
}

const altoExactitud = (filas: number) =>
  Math.max(120, filas * (filas > FILAS_COMPACTO ? 22 : 40) + 36);
const altoArticulos = (filas: number) => Math.max(160, filas * 30 + 40);

// Exactitud de cada inventario: barra 100 % apilada (faltante | exacto | sobrante).
// A la derecha, en columna fija, la exactitud escrita y las diferencias en la medida
// elegida: el gris del medio tiene poco contraste y el número no depende de él.
function GraficoExactitud({
  datos,
  medida,
  pal,
  fijo,
  movil = false,
}: {
  datos: FilaExactitud[];
  medida: Medida;
  pal: Paleta;
  fijo?: Fijo;
  // Móvil: fecha corta y solo el % a la derecha (las diferencias, en el tooltip y
  // en la tarjeta); con las dos columnas completas a la barra no le quedaba lugar.
  movil?: boolean;
}) {
  // Muchas fechas ("Todos"): una línea por fecha, igual que en móvil.
  const compacto = datos.length > FILAS_COMPACTO;
  const simple = movil || compacto;
  const segmentos = [
    {
      key: "pFaltante",
      color: pal.faltante,
      radio: [4, 0, 0, 4] as [number, number, number, number],
    },
    { key: "pExacto", color: pal.exacto, radio: [0, 0, 0, 0] as [number, number, number, number] },
    {
      key: "pSobrante",
      color: pal.sobrante,
      radio: [0, 4, 4, 0] as [number, number, number, number],
    },
  ];
  return (
    <Lienzo fijo={fijo}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
        barCategoryGap={compacto ? 4 : 12}
      >
        <XAxis
          type="number"
          domain={[0, 100]}
          ticks={movil ? [0, 50, 100] : [0, 25, 50, 75, 100]}
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
          tickFormatter={(v: number) => `${v} %`}
        />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={movil ? 50 : 118}
          interval={0}
          axisLine={false}
          tickLine={false}
          tick={(p: { x: number | string; y: number | string; index: number }) => {
            const f = datos[p.index];
            if (!f) return <g />;
            return (
              <g>
                <text
                  x={Number(p.x) - 6}
                  y={Number(p.y)}
                  dy={f.analizado && !simple ? -1 : 4}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={f.analizado ? 700 : 400}
                  fill={pal.tinta}
                >
                  {movil ? fmtFechaCorta(f.fecha) : compacto ? fmtFecha(f.fecha) : f.etiqueta}
                </text>
                {f.analizado && !simple && (
                  <text
                    x={Number(p.x) - 6}
                    y={Number(p.y)}
                    dy={11}
                    textAnchor="end"
                    fontSize={9}
                    fill={pal.tintaSuave}
                  >
                    analizado
                  </text>
                )}
              </g>
            );
          }}
        />
        <YAxis
          yAxisId="der"
          orientation="right"
          type="category"
          dataKey="etiqueta"
          width={simple ? 58 : 150}
          interval={0}
          axisLine={false}
          tickLine={false}
          tick={(p: { x: number | string; y: number | string; index: number }) => {
            const f = datos[p.index];
            if (!f) return <g />;
            const x = Number(p.x) + 8;
            const y = Number(p.y);
            const falta = medida === "gs" ? fmtSigno(f.inv.gsFaltan) : fmtU(f.inv.uFaltan);
            const sobra = medida === "gs" ? fmtSigno(f.inv.gsSobran) : fmtU(f.inv.uSobran);
            if (simple) {
              return (
                <text x={x - 2} y={y} dy={4} fontSize={11} fontWeight={600} fill={pal.tinta}>
                  {fmtPct(f.inv.exactitud)}
                </text>
              );
            }
            return (
              <g>
                <text x={x} y={y} dy={-2} fontSize={11} fontWeight={600} fill={pal.tinta}>
                  {fmtPct(f.inv.exactitud)} exacto
                </text>
                <text x={x} y={y} dy={11} fontSize={10} fill={pal.tintaSuave}>
                  {falta} / {sobra}
                </text>
              </g>
            );
          }}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const f = active ? (payload?.[0]?.payload as FilaExactitud | undefined) : undefined;
            if (!f) return null;
            const inv = f.inv;
            return (
              <CajaTooltip titulo={`Inventario del ${fmtFechaLarga(f.fecha)}`}>
                <p className="text-muted-foreground">{fmtNum(inv.n)} artículos contados</p>
                <p>
                  <Punto color={PAL_PANTALLA.faltante} />
                  Con faltante: {fmtNum(inv.conFaltante)} ({fmtPct(f.pFaltante)}) ·{" "}
                  {fmtU(inv.uFaltan)} · {fmtGs(inv.gsFaltan)}
                </p>
                <p>
                  <Punto color={PAL_PANTALLA.exacto} />
                  Exactos: {fmtNum(inv.exactos)} ({fmtPct(f.pExacto)})
                </p>
                <p>
                  <Punto color={PAL_PANTALLA.sobrante} />
                  Con sobrante: {fmtNum(inv.conSobrante)} ({fmtPct(f.pSobrante)}) ·{" "}
                  {fmtU(inv.uSobran)} · {fmtGs(inv.gsSobran)}
                </p>
              </CajaTooltip>
            );
          }}
        />
        {segmentos.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="exactitud"
            fill={s.color}
            // Separación de 2 px del color de la superficie entre segmentos.
            stroke={pal.superficie}
            strokeWidth={2}
            radius={s.radio}
            barSize={compacto ? 12 : 22}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </Lienzo>
  );
}

// Artículos con mayor diferencia en el inventario analizado: barra divergente
// (faltante a la izquierda, sobrante a la derecha) con el valor al final. A la
// derecha, la racha: un cuadrito por inventario comparado, del más viejo al más
// nuevo, con el color de lo que dio ese artículo ese día (hueco = no se contó).
function GraficoArticulos({
  datos,
  medida,
  comparadas,
  pal,
  fijo,
  anchoEtiqueta,
}: {
  datos: FilaArticulo[];
  medida: Medida;
  comparadas: number;
  pal: Paleta;
  fijo?: Fijo;
  anchoEtiqueta?: number;
}) {
  const max = Math.max(1, ...datos.map((d) => Math.abs(d.valor)));
  // Simétrico y redondo (1-2-5 × 10^k), con aire a los dos lados para el valor
  // rotulado; sin redondear, las marcas caían en valores como 279.800.
  const ancho = anchoEtiqueta ?? 250;
  const angosto = ancho < 200;
  // Angosto (móvil): más aire, porque el rótulo ocupa casi lo mismo que la barra.
  const lim = limiteRedondo(max * (angosto ? 1.9 : medida === "gs" ? 1.4 : 1.25));
  // Los nombres vienen en mayúsculas (~7 px por letra a 11 px de fuente).
  const letras = Math.floor(ancho / 7.2);
  // En móvil los montos van compactos ("-1,4 M"): enteros chocaban con el nombre.
  const fmtValor = (v: number) =>
    medida !== "gs"
      ? fmtCantSigno(v)
      : angosto
        ? `${v > 0 ? "+" : ""}${nfCompacto.format(v)}`
        : fmtSigno(v);
  // La racha ocupa a lo sumo un ancho fijo: con pocas fechas, cuadritos de 11 px;
  // con muchas ("Todos"), cada fecha se angosta hasta ser una rayita.
  const rachaMax = angosto ? 60 : 210;
  const PASO = Math.min(15, rachaMax / Math.max(1, comparadas));
  const hueco = PASO > 6 ? 4 : PASO > 3 ? 1 : 0;
  const CUADRO_ANCHO = PASO - hueco;
  const CUADRO = 11;
  const radioCuadro = CUADRO_ANCHO > 6 ? 2 : 0;
  return (
    <Lienzo fijo={fijo}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
        barCategoryGap={8}
      >
        <CartesianGrid horizontal={false} stroke={pal.grilla} />
        <XAxis
          type="number"
          domain={[-lim, lim]}
          // Angosto (móvil): solo el cero; los valores ya van escritos en cada barra.
          ticks={angosto ? [0] : [-lim, -lim / 2, 0, lim / 2, lim]}
          tick={tick(pal)}
          axisLine={{ stroke: pal.eje }}
          tickLine={false}
          tickFormatter={(v: number) => nf0.format(v)}
        />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={ancho}
          interval={0}
          axisLine={false}
          tickLine={false}
          // Un solo renglón recortado (recharts partía el nombre en dos y lo cortaba
          // igual); el nombre completo va en el tooltip.
          tick={(p: { x: number | string; y: number | string; payload: { value: string } }) => (
            <text
              x={Number(p.x) - 6}
              y={Number(p.y)}
              dy={4}
              textAnchor="end"
              fontSize={11}
              fill={pal.tinta}
            >
              {recortar(p.payload.value, letras)}
            </text>
          )}
        />
        {comparadas > 0 && (
          <YAxis
            yAxisId="racha"
            orientation="right"
            type="category"
            dataKey="etiqueta"
            width={Math.ceil(comparadas * PASO) + 12}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={(p: { x: number | string; y: number | string; index: number }) => {
              const f = datos[p.index];
              if (!f) return <g />;
              const x0 = Number(p.x) + 8;
              const y = Number(p.y) - CUADRO / 2;
              return (
                <g>
                  {f.racha.map((r, k) =>
                    r.dif == null ? (
                      CUADRO_ANCHO > 6 ? (
                        <rect
                          key={r.fecha}
                          x={x0 + k * PASO + 0.5}
                          y={y + 0.5}
                          width={CUADRO_ANCHO - 1}
                          height={CUADRO - 1}
                          rx={radioCuadro}
                          fill="none"
                          stroke={pal.eje}
                        />
                      ) : (
                        // Angosta: "no se contó" = rayita a media altura (un hueco
                        // de 1 px de borde no se vería).
                        <rect
                          key={r.fecha}
                          x={x0 + k * PASO}
                          y={y + CUADRO / 2 - 0.5}
                          width={Math.max(1, CUADRO_ANCHO)}
                          height={1}
                          fill={pal.eje}
                        />
                      )
                    ) : (
                      <rect
                        key={r.fecha}
                        x={x0 + k * PASO}
                        y={y}
                        width={Math.max(1, CUADRO_ANCHO)}
                        height={CUADRO}
                        rx={radioCuadro}
                        fill={colorDif(pal, r.dif)}
                      />
                    ),
                  )}
                </g>
              );
            }}
          />
        )}
        <ReferenceLine x={0} stroke={pal.eje} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const f = active ? (payload?.[0]?.payload as FilaArticulo | undefined) : undefined;
            if (!f) return null;
            const a = f.art;
            return (
              <CajaTooltip titulo={a.nombre}>
                <p className="text-muted-foreground">
                  ID {a.id} · sistema {fmtCant(a.sistema)} · contado {fmtCant(a.fisica)}
                </p>
                <p className="font-medium">
                  Diferencia: {fmtU(a.dif)}
                  {a.difGs != null ? ` · ${fmtGs(a.difGs)}` : " · sin costo"}
                </p>
                {f.racha.length > 0 && (
                  <>
                    <p className="pt-1 text-muted-foreground">En los inventarios comparados:</p>
                    {[...f.racha].reverse().map((r) => (
                      <p key={r.fecha}>
                        <Punto
                          color={r.dif == null ? "transparent" : colorDif(PAL_PANTALLA, r.dif)}
                        />
                        {fmtFechaLarga(r.fecha)}:{" "}
                        {r.dif == null
                          ? "no se contó"
                          : r.dif === 0
                            ? "exacto"
                            : `${fmtU(r.dif)}${r.difGs != null ? ` · ${fmtGs(r.difGs)}` : ""}`}
                      </p>
                    ))}
                  </>
                )}
              </CajaTooltip>
            );
          }}
        />
        <Bar
          dataKey="valor"
          barSize={16}
          isAnimationActive={false}
          // Forma propia: color por signo y punta redondeada del lado del valor.
          // Se normaliza x/ancho porque una barra negativa llega con ancho negativo.
          shape={(p: unknown) => {
            const b = p as {
              x: number;
              y: number;
              width: number;
              height: number;
              payload: FilaArticulo;
            };
            const neg = b.payload.valor < 0;
            const x = Math.min(b.x, b.x + b.width);
            const ancho = Math.abs(b.width);
            const fin = neg ? x : x + ancho;
            return (
              <g>
                <Rectangle
                  x={x}
                  y={b.y}
                  width={ancho}
                  height={b.height}
                  radius={neg ? [4, 0, 0, 4] : [0, 4, 4, 0]}
                  fill={colorDif(pal, b.payload.valor)}
                />
                <text
                  x={neg ? fin - 4 : fin + 4}
                  y={b.y + b.height / 2}
                  dy={4}
                  textAnchor={neg ? "end" : "start"}
                  fontSize={10}
                  fill={pal.tinta}
                >
                  {fmtValor(b.payload.valor)}
                </text>
              </g>
            );
          }}
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

// Clave de color (el color nunca es la única pista: va rotulada).
function Clave({ items }: { items: { color: string; texto: string; hueco?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={i.hueco ? { border: `1px solid ${i.color}` } : { background: i.color }}
          />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ─── Vista ──────────────────────────────────────────────────────────────────

export function ComparacionInventario() {
  // Misma queryKey que la grilla de conteos: no se pide dos veces, y las altas,
  // ediciones y bajas (que invalidan "inventario") refrescan la comparación.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventario", COD_EMPRESA],
    queryFn: () => listarInventario(COD_EMPRESA),
    retry: false,
  });

  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("anterior");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [medidaSel, setMedidaSel] = useState<Medida>("gs");
  const [generando, setGenerando] = useState(false);
  // Solo para el ancho de la columna de nombres del gráfico de artículos.
  const esMovil = typeof window !== "undefined" && window.innerWidth < 640;

  // Si la BD todavía no tiene el LISTAR con costo, la comparación queda en unidades.
  const tieneCosto = useMemo(() => (data ?? []).some((r) => r.costo_ultimo !== undefined), [data]);
  const medida: Medida = tieneCosto ? medidaSel : "u";

  const todos = useMemo(() => armarInventarios(data ?? []), [data]);

  // Filtro por artículos contados: el catálogo son todos los artículos contados
  // alguna vez (se arma con el historial completo, antes de aplicar el filtro, así
  // al elegir uno la lista no queda solo con él).
  const [articulosSel, setArticulosSel] = useState<number[]>([]);
  const catalogo = useMemo<ArticuloContado[]>(() => {
    const m = new Map<number, ArticuloContado>();
    // todos va de la fecha más nueva a la más vieja: la primera vez = la última.
    for (const i of todos) {
      for (const a of i.porArticulo.values()) {
        const c = m.get(a.id);
        if (c) c.veces++;
        else m.set(a.id, { id: a.id, nombre: a.nombre, veces: 1, ultima: i.fecha });
      }
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [todos]);
  const idsSel = useMemo(() => new Set(articulosSel), [articulosSel]);
  // Con artículos elegidos, cada inventario se recalcula solo con ellos y quedan las
  // fechas que contaron alguno: "Inventario anterior" pasa a ser el anterior en que
  // se contaron esos artículos (no uno donde no figuran).
  const inventarios = useMemo(
    () => (idsSel.size ? todos.map((i) => soloArticulos(i, idsSel)).filter((i) => i.n > 0) : todos),
    [todos, idsSel],
  );
  const nombreArticulo = (id: number) =>
    catalogo.find((c) => c.id === id)?.nombre ?? `Artículo ${id}`;

  // Inventario analizado: el elegido o, por defecto, el último.
  const inv = inventarios.find((i) => i.fecha === fechaSel) ?? inventarios[0];
  const comparadas = useMemo(() => {
    if (!inv) return [];
    const anteriores = inventarios.filter((i) => i.fecha < inv.fecha);
    if (modo === "anterior") return anteriores.slice(0, 1);
    if (modo === "3") return anteriores.slice(0, 3);
    if (modo === "6") return anteriores.slice(0, 6);
    if (modo === "todos") return anteriores;
    return inventarios.filter((i) => i.fecha !== inv.fecha && elegidas.includes(i.fecha));
  }, [inv, modo, inventarios, elegidas]);
  const n = comparadas.length;
  // Del más viejo al más nuevo (orden de la racha y de las columnas de la tabla).
  const cronologicas = useMemo(
    () => [...comparadas].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [comparadas],
  );

  const refExactitud = promedio(comparadas.map((c) => c.exactitud));
  const difPts = inv && n ? inv.exactitud - refExactitud : null;

  const datosExactitud = useMemo<FilaExactitud[]>(
    () =>
      inv
        ? [inv, ...comparadas]
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map((i) => ({
              fecha: i.fecha,
              etiqueta: fmtFechaLarga(i.fecha),
              analizado: i.fecha === inv.fecha,
              pFaltante: i.n ? (i.conFaltante / i.n) * 100 : 0,
              pExacto: i.n ? (i.exactos / i.n) * 100 : 0,
              pSobrante: i.n ? (i.conSobrante / i.n) * 100 : 0,
              inv: i,
            }))
        : [],
    [inv, comparadas],
  );

  const valorDe = (a: ConteoArt) => (medida === "gs" ? (a.difGs ?? 0) : a.dif);

  const datosArticulos = useMemo<FilaArticulo[]>(() => {
    if (!inv) return [];
    return [...inv.porArticulo.values()]
      .filter((a) => valorDe(a) !== 0)
      .sort((a, b) => Math.abs(valorDe(b)) - Math.abs(valorDe(a)))
      .slice(0, TOP_ARTICULOS)
      .map((a) => ({
        id: a.id,
        etiqueta: a.nombre,
        valor: valorDe(a),
        art: a,
        racha: cronologicas.map((c) => {
          const x = c.porArticulo.get(a.id);
          return { fecha: c.fecha, dif: x ? x.dif : null, difGs: x ? x.difGs : null };
        }),
      }));
    // valorDe depende solo de medida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv, medida, cronologicas]);

  // El artículo que más pesa en la diferencia (en plata si hay costo).
  const masPesa = datosArticulos[0]?.art;

  // Cuántos de los artículos con diferencia hoy ya fallaron en algún comparado.
  const reincidentes = useMemo(() => {
    if (!inv || !n) return 0;
    let k = 0;
    for (const a of inv.porArticulo.values()) {
      if (a.dif === 0) continue;
      if (comparadas.some((c) => (c.porArticulo.get(a.id)?.dif ?? 0) !== 0)) k++;
    }
    return k;
  }, [inv, n, comparadas]);

  const filasTabla = useMemo<FilaTabla[]>(
    () =>
      inv
        ? [...inv.porArticulo.values()].map((a) => ({
            ...a,
            previas: cronologicas.map((c) => c.porArticulo.get(a.id)?.dif ?? null),
          }))
        : [],
    [inv, cronologicas],
  );

  const columnas = useMemo<Column<FilaTabla>[]>(() => {
    const cols: Column<FilaTabla>[] = [
      {
        key: "id",
        header: "ID",
        num: true,
        accessor: (r) => r.id,
        className: "w-20",
      },
      {
        key: "nombre",
        header: "Artículo",
        hideable: false,
        accessor: (r) => r.nombre,
        footer: () => "Total",
      },
      {
        key: "sistema",
        header: "Sistema",
        num: true,
        accessor: (r) => r.sistema,
        render: (r) => <span className="font-mono">{fmtCant(r.sistema)}</span>,
      },
      {
        key: "fisica",
        header: "Contado",
        num: true,
        accessor: (r) => r.fisica,
        render: (r) => <span className="font-mono">{fmtCant(r.fisica)}</span>,
      },
      {
        key: "dif",
        header: "Dif. u.",
        num: true,
        accessor: (r) => r.dif,
        render: (r) => (
          <span className={cn("font-mono", r.dif !== 0 && "font-semibold")}>
            {fmtCantSigno(r.dif)}
          </span>
        ),
        footer: (rows) => (
          <span className="font-mono">{fmtCantSigno(rows.reduce((s, r) => s + r.dif, 0))}</span>
        ),
      },
    ];
    if (tieneCosto) {
      cols.push(
        {
          key: "costo",
          header: "Costo últ.",
          num: true,
          accessor: (r) => r.costo ?? 0,
          render: (r) => <span className="font-mono">{fmtNum(r.costo)}</span>,
        },
        {
          key: "difGs",
          header: "Dif. Gs.",
          num: true,
          accessor: (r) => r.difGs ?? 0,
          render: (r) => (
            <span className={cn("font-mono", (r.difGs ?? 0) !== 0 && "font-semibold")}>
              {fmtSigno(r.difGs)}
            </span>
          ),
          footer: (rows) => (
            <span className="font-mono">
              {fmtSigno(rows.reduce((s, r) => s + (r.difGs ?? 0), 0))}
            </span>
          ),
        },
      );
    }
    if (cronologicas.length > MAX_COLUMNAS_FECHA) {
      // Muchas fechas: en vez de una columna por fecha, en cuántas dio diferencia.
      cols.push({
        key: "historial",
        header: "Con dif. en",
        num: true,
        accessor: (r) => vecesConDif(r.previas).conDif,
        render: (r) => {
          const v = vecesConDif(r.previas);
          return (
            <span
              className="font-mono"
              title="Inventarios comparados en que se contó y dio diferencia"
            >
              {v.contado ? `${v.conDif} de ${v.contado}` : "—"}
            </span>
          );
        },
      });
      return cols;
    }
    cronologicas.forEach((c, k) => {
      cols.push({
        key: `prev${k}`,
        header: `Dif. ${fmtFechaCorta(c.fecha)}`,
        num: true,
        accessor: (r) => r.previas[k] ?? "",
        render: (r) =>
          r.previas[k] == null ? (
            <span className="text-muted-foreground" title="No se contó ese día">
              —
            </span>
          ) : (
            <span className="font-mono">{fmtCantSigno(r.previas[k])}</span>
          ),
      });
    });
    return cols;
  }, [tieneCosto, cronologicas]);

  function agregarFecha(f: string) {
    if (elegidas.includes(f)) return;
    if (elegidas.length >= MAX_COMPARADAS) {
      toast.error(`Se pueden comparar hasta ${MAX_COMPARADAS} inventarios`);
      return;
    }
    setElegidas([...elegidas, f].sort((a, b) => b.localeCompare(a)));
  }

  const textoRef =
    n === 1
      ? `el inventario del ${fmtFechaLarga(comparadas[0].fecha)}`
      : `el promedio de ${n} inventarios${modo === "elegir" ? " elegidos" : " anteriores"}`;

  // Para el PDF: los nombres de los elegidos (con muchos, los primeros y "y N más").
  function descripcionArticulos(): string {
    const nombres = articulosSel.map(nombreArticulo);
    return nombres.length <= 4
      ? nombres.join(", ")
      : `${nombres.slice(0, 4).join(", ")} y ${nombres.length - 4} más`;
  }

  function descripcionComparacion(): string {
    if (!n) return "sin inventarios para comparar";
    if (n === 1) return `inventario del ${fmtFecha(comparadas[0].fecha)}`;
    return `${n} inventarios (del ${fmtFecha(cronologicas[0].fecha)} al ${fmtFecha(cronologicas[n - 1].fecha)})`;
  }

  const unidadTexto = medida === "gs" ? "en Gs. (costo último actual)" : "en unidades";
  // El PDF lleva el gráfico de escritorio aunque se genere desde el teléfono; con
  // muchas fechas ("Todos") el gráfico se compacta y a la derecha va solo el %.
  const exactitudBase =
    "Porcentaje de artículos contados que dieron faltante, exacto o sobrante. A la derecha, la exactitud";
  const compactoExactitud = datosExactitud.length > FILAS_COMPACTO;
  const subtituloExactitudPdf = compactoExactitud
    ? `${exactitudBase}.`
    : `${exactitudBase} y las diferencias ${unidadTexto}.`;
  const subtituloExactitud =
    esMovil || compactoExactitud
      ? `${exactitudBase}; ${esMovil ? "tocá" : "pasá el mouse por"} una barra para ver las diferencias.`
      : subtituloExactitudPdf;
  const subtituloArticulos =
    (articulosSel.length && datosArticulos.length < TOP_ARTICULOS
      ? `Los artículos elegidos con diferencia ${unidadTexto}`
      : `Los ${TOP_ARTICULOS} artículos con mayor diferencia ${unidadTexto}`) +
    ": faltante a la izquierda, sobrante a la derecha." +
    (n
      ? ` Los cuadritos de la derecha son el mismo artículo en los inventarios comparados, del más viejo al más nuevo (${n > 14 ? "rayita" : "hueco"} = no se contó).`
      : "");

  const claveDif = (pal: Paleta) => [
    { color: pal.faltante, texto: "Faltante" },
    { color: pal.exacto, texto: "Exacto" },
    { color: pal.sobrante, texto: "Sobrante" },
  ];

  async function exportarPdf() {
    if (!inv) return;
    setGenerando(true);
    try {
      const relacionDe = (f: Fijo) => f.alto / f.ancho;
      const png = (g: ReactElement, f: Fijo) => graficoAPng(g, f.ancho, f.alto);
      const graficos: GraficoPdf[] = [];
      {
        const fijo = { ancho: 1200, alto: altoExactitud(datosExactitud.length) };
        graficos.push({
          titulo: "Exactitud de cada inventario",
          subtitulo: paraPdf(subtituloExactitudPdf),
          png: await png(
            <GraficoExactitud datos={datosExactitud} medida={medida} pal={PAL_PDF} fijo={fijo} />,
            fijo,
          ),
          relacion: relacionDe(fijo),
          anchoCompleto: true,
          leyenda: claveDif(PAL_PDF),
        });
      }
      if (datosArticulos.length) {
        const fijo = { ancho: 1200, alto: altoArticulos(datosArticulos.length) };
        graficos.push({
          titulo: "Artículos con mayor diferencia",
          subtitulo: paraPdf(subtituloArticulos),
          png: await png(
            <GraficoArticulos
              datos={datosArticulos}
              medida={medida}
              comparadas={n}
              pal={PAL_PDF}
              fijo={fijo}
            />,
            fijo,
          ),
          relacion: relacionDe(fijo),
          anchoCompleto: true,
          leyenda: claveDif(PAL_PDF),
        });
      }

      const kpis: KpiPdf[] = [
        {
          etiqueta: `Exactitud del ${fmtFecha(inv.fecha)}`,
          valor: fmtPct(inv.exactitud),
          detalle: `${fmtNum(inv.exactos)} de ${fmtNum(inv.n)} artículos sin diferencia`,
        },
      ];
      if (n && difPts != null) {
        kpis.push({
          etiqueta:
            n === 1
              ? `Inventario del ${fmtFecha(comparadas[0].fecha)}`
              : `Promedio de ${n} inventarios`,
          valor: fmtPct(refExactitud),
          detalle: `${fmtPts(difPts)} el analizado`,
        });
      }
      kpis.push(
        {
          etiqueta: `Faltantes (${fmtNum(inv.conFaltante)} art.)`,
          valor: tieneCosto ? fmtGs(inv.gsFaltan) : fmtU(inv.uFaltan),
          detalle: tieneCosto ? fmtU(inv.uFaltan) : undefined,
        },
        {
          etiqueta: `Sobrantes (${fmtNum(inv.conSobrante)} art.)`,
          valor: tieneCosto ? fmtGs(inv.gsSobran) : fmtU(inv.uSobran),
          detalle: tieneCosto ? fmtU(inv.uSobran) : undefined,
        },
      );

      // En el PDF, solo los artículos con diferencia (los exactos no aportan y
      // alargaban el reporte varias hojas).
      const conDif = filasTabla
        .filter((f) => f.dif !== 0)
        .sort((a, b) => (tieneCosto ? (a.difGs ?? 0) - (b.difGs ?? 0) : a.dif - b.dif));
      const porFechaPdf = cronologicas.length <= MAX_COLUMNAS_FECHA;
      const columnasPdf = [
        "ID",
        "Artículo",
        "Sistema",
        "Contado",
        "Dif. u.",
        ...(tieneCosto ? ["Costo últ.", "Dif. Gs."] : []),
        ...(porFechaPdf
          ? cronologicas.map((c) => `Dif. ${fmtFechaCorta(c.fecha)}`)
          : ["Con dif. en"]),
      ];
      await exportarPdfReporte({
        titulo: "Comparación de Inventarios",
        subtitulo: [
          `Inventario: ${fmtFechaLarga(inv.fecha)} (${fmtNum(inv.n)} artículos)`,
          `Comparado con: ${descripcionComparacion()}`,
          articulosSel.length ? `Artículos: ${descripcionArticulos()}` : null,
          tieneCosto ? "Valorizado al costo último actual" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        archivo: `comparacion-inventario-${inv.fecha}`,
        usuario: getSesion()?.usuario,
        kpis: kpis.map((k) => ({
          etiqueta: paraPdf(k.etiqueta),
          valor: paraPdf(k.valor),
          detalle: k.detalle && paraPdf(k.detalle),
        })),
        graficos,
        tabla: {
          titulo: `Artículos con diferencia (${fmtNum(conDif.length)})`,
          columnas: columnasPdf,
          filas: conDif.map((f) =>
            [
              String(f.id),
              f.nombre,
              fmtCant(f.sistema),
              fmtCant(f.fisica),
              fmtCantSigno(f.dif),
              ...(tieneCosto ? [fmtNum(f.costo), fmtSigno(f.difGs)] : []),
              ...(porFechaPdf
                ? f.previas.map((p) => fmtCantSigno(p))
                : [
                    (({ conDif, contado }) => (contado ? `${conDif} de ${contado}` : "-"))(
                      vecesConDif(f.previas),
                    ),
                  ]),
            ].map(paraPdf),
          ),
          numericas: columnasPdf.map((_, i) => i).filter((i) => i !== 1),
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
      <h2 className="font-display text-xl font-bold">Inventario</h2>
      <p className="text-sm text-muted-foreground">
        Comparación de un inventario con inventarios anteriores
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
  if (isError || !inv) {
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
              : "No se pudo cargar el inventario"
            : "Todavía no hay conteos de inventario."}
        </p>
      </div>
    );
  }

  const IconoDif =
    difPts == null || Math.abs(difPts) < 0.05 ? Minus : difPts > 0 ? ArrowUpRight : ArrowDownRight;
  const netoU = inv.uFaltan + inv.uSobran;
  const netoGs = inv.gsFaltan + inv.gsSobran;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      {cabecera}

      <div className="space-y-4 p-4 sm:p-5">
        {/* Controles: qué inventario se analiza, contra qué y en qué medida */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1 sm:w-72">
            <Label htmlFor="cmp-inv-fecha" className="text-xs">
              Inventario a analizar
            </Label>
            <select
              id="cmp-inv-fecha"
              value={inv.fecha}
              onChange={(e) => {
                setFechaSel(e.target.value);
                setElegidas((xs) => xs.filter((x) => x !== e.target.value));
              }}
              className={selectCls}
            >
              {inventarios.map((i) => (
                <option key={i.fecha} value={i.fecha}>
                  {fmtFechaLarga(i.fecha)} · {fmtNum(i.n)} art.
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
          {tieneCosto && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Diferencias en</p>
              <div className="flex gap-1" role="group" aria-label="Diferencias en">
                {(
                  [
                    ["gs", "Guaraníes"],
                    ["u", "Unidades"],
                  ] as const
                ).map(([v, etiqueta]) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={medida === v ? "secondary" : "outline"}
                    aria-pressed={medida === v}
                    onClick={() => setMedidaSel(v)}
                  >
                    {etiqueta}
                  </Button>
                ))}
              </div>
            </div>
          )}
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
                  elegidas.length
                    ? "Agregar otro inventario..."
                    : "Agregar inventario a comparar..."
                }
                emptyLabel="No hay más inventarios"
                value={null}
                label=""
                buscar={async (q) => {
                  const qn = q.trim();
                  return inventarios.filter(
                    (i) =>
                      i.fecha !== inv.fecha &&
                      !elegidas.includes(i.fecha) &&
                      (!qn || fmtFechaLarga(i.fecha).includes(qn)),
                  );
                }}
                itemKey={(i) => i.fecha}
                itemTitle={(i) => fmtFechaLarga(i.fecha)}
                itemSub={(i) => `${fmtNum(i.n)} artículos · ${fmtPct(i.exactitud)} exacto`}
                onSelect={(i) => agregarFecha(i.fecha)}
                disabled={elegidas.length >= MAX_COMPARADAS}
              />
            </div>
            {elegidas
              .filter((f) => f !== inv.fecha)
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

        {/* Filtro por artículos contados: buscador para agregar + chips para quitar */}
        <div className="space-y-1">
          <p className="text-xs font-medium">Artículos</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-80">
              <BuscadorSelect
                placeholder={
                  articulosSel.length
                    ? "Agregar otro artículo..."
                    : "Todos los contados (filtrar por artículo...)"
                }
                emptyLabel="Sin resultados"
                value={null}
                label=""
                buscar={async (q) => {
                  // Palabras sueltas en cualquier orden, o el ID.
                  const palabras = q.trim().toUpperCase().split(/s+/).filter(Boolean);
                  return catalogo.filter(
                    (c) =>
                      !idsSel.has(c.id) &&
                      palabras.every(
                        (p) => c.nombre.toUpperCase().includes(p) || String(c.id).includes(p),
                      ),
                  );
                }}
                itemKey={(c) => c.id}
                itemTitle={(c) => c.nombre}
                itemSub={(c) =>
                  `ID ${c.id} · contado en ${c.veces} ${c.veces === 1 ? "inventario" : "inventarios"} · último ${fmtFecha(c.ultima)}`
                }
                onSelect={(c) => setArticulosSel((xs) => (xs.includes(c.id) ? xs : [...xs, c.id]))}
              />
            </div>
            {articulosSel.map((id) => {
              // Elegido pero no contado en el inventario analizado: queda atenuado.
              const contado = inv.porArticulo.has(id);
              return (
                <span
                  key={id}
                  title={contado ? undefined : `No se contó el ${fmtFecha(inv.fecha)}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1 text-xs",
                    !contado && "opacity-50",
                  )}
                >
                  <span className="truncate">{recortar(nombreArticulo(id), 40)}</span>
                  <button
                    type="button"
                    onClick={() => setArticulosSel(articulosSel.filter((x) => x !== id))}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Quitar ${nombreArticulo(id)}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            })}
            {articulosSel.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => setArticulosSel([])}
              >
                <X className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* 1) ¿Qué tan bien salió? — la respuesta en texto */}
        <section className="rounded-xl border border-border p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">
            Inventario del {fmtFechaLarga(inv.fecha)} ·{" "}
            {articulosSel.length
              ? `${fmtNum(inv.n)} de ${fmtNum(articulosSel.length)} artículos elegidos contados`
              : `${fmtNum(inv.n)} artículos contados`}
          </p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {fmtPct(inv.exactitud)}{" "}
            <span className="text-lg font-semibold text-muted-foreground">exacto</span>
          </p>
          {n > 0 && difPts != null ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm">
              <IconoDif className="h-4 w-4 shrink-0" aria-hidden />
              <span className="font-semibold">{fmtPts(difPts)}</span>
              <span className="text-muted-foreground">
                vs. {textoRef} ({fmtPct(refExactitud)})
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {modo === "elegir"
                ? "Agregá uno o más inventarios para comparar."
                : "No hay inventarios anteriores a esta fecha para comparar."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <span className="inline-flex items-center">
              <Punto color={PAL_PANTALLA.faltante} />
              {fmtNum(inv.conFaltante)} con faltante:
              <span className="ml-1 font-semibold">{fmtU(inv.uFaltan)}</span>
              {tieneCosto && <span className="ml-1 font-semibold">· {fmtGs(inv.gsFaltan)}</span>}
            </span>
            <span className="inline-flex items-center">
              <Punto color={PAL_PANTALLA.sobrante} />
              {fmtNum(inv.conSobrante)} con sobrante:
              <span className="ml-1 font-semibold">{fmtU(inv.uSobran)}</span>
              {tieneCosto && <span className="ml-1 font-semibold">· {fmtGs(inv.gsSobran)}</span>}
            </span>
            <span className="text-muted-foreground">
              Neto: {fmtU(netoU)}
              {tieneCosto && ` · ${fmtGs(netoGs)}`}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {masPesa && (
              <>
                Lo que más pesa:{" "}
                <span className="font-medium text-foreground">{masPesa.nombre}</span> (
                {fmtU(masPesa.dif)}
                {tieneCosto && masPesa.difGs != null && `, ${fmtGs(masPesa.difGs)}`})
              </>
            )}
            {n > 0 && inv.conFaltante + inv.conSobrante > 0 && (
              <>
                {masPesa && " · "}
                {fmtNum(reincidentes)} de {fmtNum(inv.conFaltante + inv.conSobrante)} artículos con
                diferencia ya habían fallado en{" "}
                {n === 1 ? "ese inventario" : "alguno de los comparados"}
              </>
            )}
          </p>
          {tieneCosto && inv.sinCosto > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtNum(inv.sinCosto)} artículos con diferencia no tienen costo registrado y no suman
              en Gs.
            </p>
          )}
          {!tieneCosto && (
            <p className="mt-1 text-xs text-muted-foreground">
              Diferencias solo en unidades: falta actualizar el paquete de inventario en la base de
              datos para valorizarlas.
            </p>
          )}
        </section>

        <div className="grid gap-4">
          {/* 2) ¿Mejoramos? */}
          <Panel titulo="Exactitud de cada inventario" subtitulo={subtituloExactitud}>
            <div style={{ height: altoExactitud(datosExactitud.length) }}>
              <GraficoExactitud
                datos={datosExactitud}
                medida={medida}
                pal={PAL_PANTALLA}
                movil={esMovil}
              />
            </div>
            <Clave items={claveDif(PAL_PANTALLA)} />
          </Panel>

          {/* 3) ¿Qué artículos fallaron, y fallan siempre? */}
          <Panel titulo="Artículos con mayor diferencia" subtitulo={subtituloArticulos}>
            {datosArticulos.length ? (
              <>
                <div style={{ height: altoArticulos(datosArticulos.length) }}>
                  <GraficoArticulos
                    datos={datosArticulos}
                    medida={medida}
                    comparadas={n}
                    pal={PAL_PANTALLA}
                    anchoEtiqueta={esMovil ? 110 : 250}
                  />
                </div>
                <Clave
                  items={[
                    ...claveDif(PAL_PANTALLA),
                    ...(n ? [{ color: PAL_PANTALLA.eje, texto: "No se contó", hueco: true }] : []),
                  ]}
                />
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ningún artículo dio diferencia en este inventario.
              </p>
            )}
          </Panel>
        </div>

        <DataTable
          columns={columnas}
          rows={filasTabla}
          getRowId={(r) => r.id}
          initialSort={{ key: tieneCosto ? "difGs" : "dif", dir: "asc" }}
          searchPlaceholder="Buscar artículo..."
          exportName={`comparacion-inventario-${inv.fecha}`}
        />
      </div>
    </div>
  );
}
