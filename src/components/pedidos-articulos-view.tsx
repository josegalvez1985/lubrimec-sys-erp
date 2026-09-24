import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardList,
  Copy,
  ImageIcon,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listarPedidosArticulos, type PedidoArticulo } from "@/lib/api";
import { ArticuloImgModal } from "@/components/articulo-img-modal";

const COD_EMPRESA = 24;

const fmtN = (n: number | null | undefined) =>
  n == null ? "" : Math.round(n).toLocaleString("es-PY");

// ─── Agrupación por OEM ──────────────────────────────────────────────────────
//
// El endpoint devuelve UNA FILA POR (codigo_oem, proveedor), y no todas sus
// columnas tienen el mismo grano. Eso es lo que hacía que la grilla se viera
// duplicada: un OEM con 3 proveedores salía 3 veces, repitiendo las ventas.
//
//   compras              → de ESE proveedor  → se suma por fila
//   ventas_articulo      → del ARTÍCULO      → se suma por artículo DISTINTO
//   existencia_articulo  → del ARTÍCULO      → se suma por artículo DISTINTO
//   ventas / existencia  → del OEM, repetidas en cada fila → solo de respaldo
//
// Las tres magnitudes se arman desde el grano ARTÍCULO (`sumaPorArticulo`) y no
// desde el valor del OEM. Es lo que permite que filtrar por proveedor acote las
// tres a la vez: acotado el grupo, se suman solo los artículos que quedaron.
// Sin filtro el resultado es idéntico al total del OEM, porque los campos por
// artículo son el mismo cálculo un nivel más abajo.
type GrupoOem = {
  codigo_oem: string;
  rubro: string | null;
  descripcion: string | null; // artículo representativo (para copiar el pedido)
  id_articulo: string | null; // para la imagen
  // Las tres acotadas al grupo: con un proveedor filtrado son las de SUS artículos.
  existencia: number | null;
  ventas: number;
  compras: number;
  faltantes: string;
  proveedores: string[]; // distintos (una fila por artículo puede repetir proveedor)
  filas: PedidoArticulo[]; // detalle por proveedor (modal)
};

// Suma un campo de grano ARTÍCULO sobre los artículos DISTINTOS del grupo.
//
// Por fila no sirve: un artículo que se le compra a dos proveedores viene en dos
// filas con el mismo id_articulo y se contaría dos veces. Sobre los artículos
// distintos, en cambio, la suma es exacta — y sumada sobre todos los artículos
// del OEM da el total del OEM, así que sin filtro el número no cambia y con
// filtro queda acotado a los artículos de ese proveedor.
//
// `campoOem` es el respaldo para una BD con el paquete viejo, que no manda los
// campos por artículo: ahí se cae al valor del OEM (repetido en cada fila).
function sumaPorArticulo(
  grupo: PedidoArticulo[],
  campoArticulo: "ventas_articulo" | "existencia_articulo",
  campoOem: "ventas" | "existencia",
): number {
  const porArticulo = new Map<string, number>();
  for (const f of grupo) {
    const v = f[campoArticulo];
    if (v == null) continue;
    porArticulo.set(f.id_articulo ?? `?${f.articulo ?? ""}`, v);
  }
  if (porArticulo.size > 0) {
    return Array.from(porArticulo.values()).reduce((a, b) => a + b, 0);
  }
  return Math.max(...grupo.map((f) => f[campoOem] ?? 0), 0);
}

function armarGrupo(codigo_oem: string, grupo: PedidoArticulo[]): GrupoOem {
  return {
    codigo_oem,
    rubro: grupo.find((f) => f.rubro)?.rubro ?? null,
    descripcion: grupo.find((f) => f.articulo)?.articulo ?? null,
    id_articulo: grupo.find((f) => f.id_articulo)?.id_articulo ?? null,
    existencia: sumaPorArticulo(grupo, "existencia_articulo", "existencia"),
    ventas: sumaPorArticulo(grupo, "ventas_articulo", "ventas"),
    compras: grupo.reduce((a, f) => a + (f.compras ?? 0), 0),
    faltantes: grupo[0]?.faltantes ?? "",
    proveedores: Array.from(
      new Set(grupo.map((f) => f.proveedor).filter((p): p is string => !!p)),
    ),
    filas: grupo,
  };
}

function agrupar(filas: PedidoArticulo[]): GrupoOem[] {
  const mapa = new Map<string, PedidoArticulo[]>();
  for (const f of filas) {
    const k = f.codigo_oem ?? "";
    const g = mapa.get(k);
    if (g) g.push(f);
    else mapa.set(k, [f]);
  }
  return Array.from(mapa.entries()).map(([oem, grupo]) => armarGrupo(oem, grupo));
}

// Filtrar por proveedor ACOTA el grupo, no solo elige cuáles se muestran: si ya
// dijiste qué proveedor mirás, el OEM se re-arma con las filas de ese proveedor.
// De ahí salen solas, sin código extra:
//   · queda un proveedor → la columna muestra el artículo (etiquetaPrincipal)
//   · desaparece el badge "N prov."
//   · Compras, Ventas y Existencia quedan las de los artículos de ese proveedor
// Las tres se recalculan porque `armarGrupo` las arma desde el grano artículo;
// si se tomaran del valor del OEM, filtrar dejaría Compras acotada y las otras
// dos enteras, que es justo la mezcla que no cierra.
function acotarAProveedores(g: GrupoOem, sel: string[]): GrupoOem {
  if (sel.length === 0) return g;
  const filas = g.filas.filter((f) => f.proveedor != null && sel.includes(f.proveedor));
  return filas.length === 0 ? g : armarGrupo(g.codigo_oem, filas);
}

// Etiqueta de la segunda columna. Con UN SOLO proveedor no hay ambigüedad: se
// muestra el nombre del artículo, que dice mucho más. Con varios, el OEM agrupa
// artículos de distintos proveedores (y a veces con descripciones distintas), así
// que la única etiqueta común y honesta es el rubro — el desglose está en el modal.
function etiquetaPrincipal(g: GrupoOem): string {
  return (g.proveedores.length <= 1 ? g.descripcion : g.rubro) ?? g.rubro ?? "";
}

// Columnas de la grilla. `sort` = valor usado para ordenar (num o texto).
type ColKey = "codigo_oem" | "rubro" | "existencia" | "ventas" | "compras";
const COLUMNAS: {
  key: ColKey;
  titulo: string;
  num?: boolean;
  valor: (g: GrupoOem) => string;
  sort: (g: GrupoOem) => number | string;
}[] = [
  {
    key: "codigo_oem",
    titulo: "OEM",
    valor: (g) => g.codigo_oem,
    sort: (g) => g.codigo_oem,
  },
  {
    key: "rubro",
    titulo: "Rubro / Artículo",
    // Ordena por lo que se ve, no por el rubro siempre.
    valor: etiquetaPrincipal,
    sort: etiquetaPrincipal,
  },
  {
    key: "existencia",
    titulo: "Existencia",
    num: true,
    valor: (g) => fmtN(g.existencia),
    sort: (g) => g.existencia ?? 0,
  },
  {
    key: "ventas",
    titulo: "Ventas",
    num: true,
    valor: (g) => fmtN(g.ventas),
    sort: (g) => g.ventas,
  },
  {
    key: "compras",
    titulo: "Compras",
    num: true,
    valor: (g) => fmtN(g.compras),
    sort: (g) => g.compras,
  },
];

// Facetas del sidebar: En Falta, Rubro, Proveedor. Las dos primeras son del OEM;
// Proveedor es multivaluada (un OEM puede tener varios), así que un grupo pasa
// si CUALQUIERA de sus proveedores está tildado.
const FACETAS: {
  clave: string;
  etiqueta: string;
  valores: (g: GrupoOem) => (string | null)[];
}[] = [
  { clave: "faltantes", etiqueta: "En Falta", valores: (g) => [g.faltantes] },
  { clave: "rubro", etiqueta: "Rubro", valores: (g) => [g.rubro] },
  {
    clave: "proveedor",
    etiqueta: "Proveedor",
    valores: (g) => g.proveedores,
  },
];

// Identidad de una línea del detalle. Lleva id_articulo además del proveedor:
// un OEM puede traer dos artículos DISTINTOS del mismo proveedor (pasa con las
// marcas: SAKURA y VIC del mismo filtro), y son dos pedidos distintos.
const filaKey = (f: PedidoArticulo) =>
  `${f.codigo_oem ?? ""}|${f.id_articulo ?? f.articulo ?? ""}|${f.proveedor ?? ""}`;

// Copia al portapapeles con fallback (execCommand) para HTTP/WebView sin
// navigator.clipboard (contexto no seguro).
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cae al fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Vista de la página 63 (Pedidos de Artículos): una fila por OEM con rubro y los
// totales comprados/vendidos; el desglose por proveedor va en un modal que se
// abre clickeando el OEM. Filtrado 100% en el front.
export function PedidosArticulosView() {
  const [facetas, setFacetas] = useState<Record<string, string[]>>({});
  const [searchInput, setSearchInput] = useState("");
  const [orden, setOrden] = useState<{ key: ColKey; dir: "asc" | "desc" }>({
    key: "ventas",
    dir: "desc",
  });
  // Cuántas opciones mostrar por faceta (para "Mostrar todo").
  const [expandida, setExpandida] = useState<Record<string, boolean>>({});
  // Artículo cuya imagen se muestra (null = cerrado).
  const [imgArticulo, setImgArticulo] = useState<{ id: string | null; titulo?: string } | null>(
    null,
  );
  // OEM cuyo detalle por proveedor se muestra (null = cerrado).
  const [detalle, setDetalle] = useState<GrupoOem | null>(null);
  // Pedido: una entrada POR LÍNEA del detalle (artículo + proveedor), no por OEM:
  // un mismo OEM puede pedirse en dos artículos distintos, a proveedores
  // distintos, y el pedido tiene que poder decir a quién pedirle qué.
  const [pedido, setPedido] = useState<Record<string, number>>({});

  const query = useQuery({
    queryKey: ["pedidos-articulos", COD_EMPRESA],
    queryFn: () => listarPedidosArticulos(COD_EMPRESA),
    retry: false,
  });
  const todos = useMemo(() => agrupar(query.data ?? []), [query.data]);

  // La búsqueda incluye las descripciones de los artículos del grupo: la columna
  // Artículo ya no está en la grilla, pero se tiene que poder buscar por nombre.
  const pasaTexto = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return (g: GrupoOem) => {
      if (!q) return true;
      // Incluye el código del proveedor y la descripción aunque no sean columnas
      // de la grilla: si no, se vuelven inencontrables desde el buscador.
      const texto = `${g.codigo_oem} ${g.rubro ?? ""} ${g.filas
        .map((f) => `${f.articulo ?? ""} ${f.proveedor ?? ""} ${f.cod_proveedor ?? ""}`)
        .join(" ")}`.toLowerCase();
      return texto.includes(q);
    };
  }, [searchInput]);

  function pasaFaceta(g: GrupoOem, f: (typeof FACETAS)[number]) {
    const sel = facetas[f.clave] ?? [];
    if (sel.length === 0) return true;
    return f.valores(g).some((v) => v != null && sel.includes(v));
  }

  // Opciones de cada faceta (con conteo), calculadas aplicando las OTRAS facetas +
  // texto → facetas dependientes (AND entre facetas, OR dentro de cada una).
  const opciones = useMemo(() => {
    const out: Record<string, { valor: string; count: number }[]> = {};
    for (const f of FACETAS) {
      const compatibles = todos.filter(
        (g) => pasaTexto(g) && FACETAS.every((otra) => otra === f || pasaFaceta(g, otra)),
      );
      const conteo = new Map<string, number>();
      for (const g of compatibles) {
        // Set: un proveedor repetido dentro del mismo OEM cuenta una sola vez.
        for (const v of new Set(f.valores(g))) {
          if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
        }
      }
      out[f.clave] = Array.from(conteo.entries())
        .map(([valor, count]) => ({ valor, count }))
        .sort((x, y) => x.valor.localeCompare(y.valor));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, facetas, pasaTexto]);

  const grupos = useMemo(() => {
    const col = COLUMNAS.find((c) => c.key === orden.key);
    const selProv = facetas["proveedor"] ?? [];
    const filtrados: GrupoOem[] = [];
    for (const g of todos) {
      // Las facetas se evalúan sobre el grupo COMPLETO (si no, filtrar por
      // proveedor se auto-excluiría), y recién después se acota.
      if (!FACETAS.every((f) => pasaFaceta(g, f))) continue;
      const acotado = acotarAProveedores(g, selProv);
      // El texto va sobre el grupo ya acotado: con un proveedor filtrado, buscar
      // el artículo de OTRO proveedor del mismo OEM no tiene que traer la fila.
      if (!pasaTexto(acotado)) continue;
      filtrados.push(acotado);
    }
    if (!col) return filtrados;
    const dir = orden.dir === "asc" ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, facetas, pasaTexto, orden]);

  function toggleFaceta(clave: string, valor: string) {
    setFacetas((prev) => {
      const actuales = prev[clave] ?? [];
      const next = actuales.includes(valor)
        ? actuales.filter((v) => v !== valor)
        : [...actuales, valor];
      return { ...prev, [clave]: next };
    });
  }

  function ordenarPor(key: ColKey) {
    setOrden((o) =>
      o.key === key ? { key, dir: o.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function toggleItem(f: PedidoArticulo, checked: boolean) {
    const k = filaKey(f);
    setPedido((prev) => {
      const next = { ...prev };
      if (checked) next[k] = prev[k] ?? 1;
      else delete next[k];
      return next;
    });
  }

  function setCantidad(f: PedidoArticulo, valor: string) {
    const n = Math.max(1, Math.floor(Number(valor) || 1));
    setPedido((prev) => ({ ...prev, [filaKey(f)]: n }));
  }

  const seleccionados = Object.keys(pedido).length;

  function limpiarPedido() {
    // El toast avisa que pasó algo: el botón desaparece al vaciarse el pedido y
    // sin aviso el clic se siente como que no hizo nada.
    setPedido({});
    toast.success(`Pedido vaciado (${seleccionados} línea${seleccionados === 1 ? "" : "s"})`);
  }

  // Unidades pedidas de un OEM, sumando sus líneas. Con la faceta de proveedor
  // puesta el grupo ya viene acotado, así que cuenta solo lo de ese proveedor.
  const unidadesPedidas = (g: GrupoOem) =>
    g.filas.reduce((a, f) => a + (pedido[filaKey(f)] ?? 0), 0);

  async function copiarPedido() {
    // Se recorre `todos` (sin acotar por facetas): lo cargado sigue en el pedido
    // aunque después se cambie el filtro de la pantalla.
    const lineas = todos
      .flatMap((g) => g.filas)
      .filter((f) => pedido[filaKey(f)] != null)
      // Va el código del proveedor, no su nombre: el pedido se le manda a él, así
      // que lo que sirve es la referencia con la que identifica el artículo.
      .map((f) =>
        [
          `${pedido[filaKey(f)]} x`,
          f.cod_proveedor ? `${f.cod_proveedor} ·` : "",
          f.articulo ?? f.codigo_oem ?? "",
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
      );
    if (lineas.length === 0) return;
    const texto = `Pedido:\n${lineas.join("\n")}`;
    if (await copiarTexto(texto)) {
      toast.success(`Pedido copiado (${lineas.length} artículo${lineas.length === 1 ? "" : "s"})`);
    } else {
      toast.error("No se pudo copiar");
    }
  }

  const LIMITE_FACETA = 8;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Sidebar de facetas */}
      <aside className="w-full shrink-0 space-y-5 lg:w-64">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-10 pl-10"
          />
        </div>

        {FACETAS.map((f) => {
          const sel = facetas[f.clave] ?? [];
          const opts = opciones[f.clave] ?? [];
          const abierta = expandida[f.clave];
          const visibles = abierta ? opts : opts.slice(0, LIMITE_FACETA);
          return (
            <div key={f.clave} className="space-y-1.5">
              <p className="text-sm font-semibold">{f.etiqueta}</p>
              {visibles.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin opciones</p>
              ) : (
                visibles.map((o) => (
                  <label
                    key={o.valor}
                    className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Checkbox
                      checked={sel.includes(o.valor)}
                      onCheckedChange={() => toggleFaceta(f.clave, o.valor)}
                    />
                    <span className="min-w-0 flex-1 truncate">{o.valor}</span>
                    <span className="shrink-0 text-xs">({o.count})</span>
                  </label>
                ))
              )}
              {opts.length > LIMITE_FACETA && (
                <button
                  type="button"
                  onClick={() => setExpandida((e) => ({ ...e, [f.clave]: !abierta }))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {abierta ? "Mostrar menos" : "Mostrar todo"}
                </button>
              )}
            </div>
          );
        })}
      </aside>

      {/* Grilla */}
      <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-border bg-card shadow-elegant">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold">Pedidos de Artículos</h2>
            <p className="text-sm text-muted-foreground">
              {!query.isSuccess
                ? "Cargando..."
                : `${grupos.length} OEM${grupos.length === 1 ? "" : "s"} · ${
                    (facetas["proveedor"] ?? []).length > 0
                      ? "existencia, ventas y compras acotadas al proveedor filtrado"
                      : "tocá el código para ver el detalle por proveedor"
                  }`}
            </p>
          </div>
          <Button
            type="button"
            onClick={copiarPedido}
            disabled={seleccionados === 0}
            className="shrink-0 gap-2"
          >
            <Copy className="h-4 w-4" />
            Copiar pedido{seleccionados > 0 ? ` (${seleccionados})` : ""}
          </Button>
          {/* Solo aparece si hay algo que limpiar, como el resto de los
              "Limpiar" del proyecto. */}
          {seleccionados > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpiarPedido}
              className="shrink-0 gap-1 text-muted-foreground"
            >
              <X className="h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>

        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "No se pudieron cargar los datos"}
          </p>
        ) : grupos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin artículos para los filtros seleccionados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNAS.map((c) => {
                  const activa = orden.key === c.key;
                  const Icono = !activa ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <TableHead key={c.key} className={c.num ? "text-right" : ""}>
                      <button
                        type="button"
                        onClick={() => ordenarPor(c.key)}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${
                          c.num ? "flex-row-reverse" : ""
                        } ${activa ? "text-foreground" : ""}`}
                      >
                        {c.titulo}
                        <Icono className="h-3.5 w-3.5 opacity-60" />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <TableRow key={g.codigo_oem}>
                  {COLUMNAS.map((c) => (
                    <TableCell key={c.key} className={c.num ? "text-right tabular-nums" : ""}>
                      {c.key === "codigo_oem" ? (
                        // Dos botones hermanos (no anidados): imagen y detalle.
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setImgArticulo({ id: g.id_articulo, titulo: g.descripcion ?? undefined })
                            }
                            aria-label="Ver imagen"
                            className="shrink-0 text-muted-foreground hover:text-primary"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetalle(g)}
                            className="font-medium text-primary hover:underline"
                            aria-label={`Ver detalle por proveedor de ${g.codigo_oem}`}
                          >
                            {g.codigo_oem}
                          </button>
                          {g.proveedores.length > 1 && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              {g.proveedores.length} prov.
                            </span>
                          )}
                          {/* El check salió de la grilla: sin esta marca no habría
                              forma de ver qué OEMs ya están en el pedido sin abrir
                              cada modal. Suma las líneas pedidas de ese OEM. */}
                          {unidadesPedidas(g) > 0 && (
                            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                              Pedido {unidadesPedidas(g)}
                            </span>
                          )}
                        </span>
                      ) : c.key === "rubro" ? (
                        // Rubro/Artículo abre el mismo detalle que el OEM: es la
                        // parte de la fila que el ojo busca, y tener que apuntarle
                        // al código de al lado es innecesariamente preciso.
                        <button
                          type="button"
                          onClick={() => setDetalle(g)}
                          className="text-left hover:underline"
                        >
                          {c.valor(g)}
                        </button>
                      ) : (
                        c.valor(g)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {query.isFetching && !query.isLoading && (
          <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Actualizando...
          </p>
        )}
      </div>

      <DetalleOemModal
        grupo={detalle}
        pedido={pedido}
        onPedir={toggleItem}
        onCantidad={setCantidad}
        onClose={() => setDetalle(null)}
        onVerImagen={(id, titulo) => setImgArticulo({ id, titulo })}
      />

      <ArticuloImgModal
        open={imgArticulo != null}
        id={imgArticulo?.id ?? null}
        titulo={imgArticulo?.titulo}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}

// ─── Modal de detalle por proveedor ──────────────────────────────────────────

// Columnas numéricas del detalle: las únicas ordenables (Proveedor y Artículo
// quedan en el orden que vino del backend).
type ColNum = "costo_ultimo" | "compras" | "ventas_articulo";

function ThNum({
  campo,
  titulo,
  orden,
  onOrdenar,
}: {
  campo: ColNum;
  titulo: string;
  orden: { key: ColNum; dir: "asc" | "desc" } | null;
  onOrdenar: (k: ColNum) => void;
}) {
  const activa = orden?.key === campo;
  const Icono = !activa ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className="text-right">
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={`inline-flex flex-row-reverse items-center gap-1 hover:text-foreground ${
          activa ? "text-foreground" : ""
        }`}
      >
        {titulo}
        <Icono className="h-3.5 w-3.5 opacity-60" />
      </button>
    </TableHead>
  );
}
//
// Compras SÍ son por proveedor (cada fila es una compra a ese proveedor).
// Ventas NO: una venta no registra de qué compra salió cada unidad, así que el
// grano más fino real es el ARTÍCULO (`ventas_articulo` del backend). Por eso la
// columna se llama "Vendidas (art.)" y se aclara al pie: si el mismo artículo se
// le compra a dos proveedores, esa cifra aparece igual bajo los dos.
function DetalleOemModal({
  grupo,
  pedido,
  onPedir,
  onCantidad,
  onClose,
  onVerImagen,
}: {
  grupo: GrupoOem | null;
  pedido: Record<string, number>;
  onPedir: (f: PedidoArticulo, checked: boolean) => void;
  onCantidad: (f: PedidoArticulo, valor: string) => void;
  onClose: () => void;
  onVerImagen: (id: string | null, titulo?: string) => void;
}) {
  // Con un solo proveedor (típicamente porque está filtrado) la columna
  // Proveedor repetiría el mismo nombre en cada fila: ya está en el subtítulo.
  const unProveedor = grupo?.proveedores.length === 1;

  const [orden, setOrden] = useState<{ key: ColNum; dir: "asc" | "desc" } | null>(null);
  // Reinicia el orden al abrir otro OEM (y al cerrar, para que reabrir el mismo
  // no herede el orden anterior). Patrón lastKey del proyecto: sin useEffect.
  const [ultimoOem, setUltimoOem] = useState<string | null>(null);
  const oemActual = grupo?.codigo_oem ?? null;
  if (oemActual !== ultimoOem) {
    setUltimoOem(oemActual);
    setOrden(null);
  }

  function ordenarPor(key: ColNum) {
    setOrden((o) =>
      o?.key === key ? { key, dir: o.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  // Sin orden elegido se respeta el que vino del backend.
  const filas = useMemo(() => {
    const base = grupo?.filas ?? [];
    if (!orden) return base;
    const dir = orden.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => ((a[orden.key] ?? 0) - (b[orden.key] ?? 0)) * dir);
  }, [grupo, orden]);

  return (
    <Dialog open={grupo != null} onOpenChange={(o) => !o && onClose()}>
      {/* Ancho: la tabla tiene que entrar SIN barra horizontal, con la
          descripción del artículo en una sola línea. 95vw usa casi toda la
          pantalla y el tope de 1600px evita un modal desmesurado en monitores
          grandes. El w-[calc(100%-2rem)] que trae DialogContent sigue mandando en
          pantallas chicas, así que esto no desborda el viewport. */}
      <DialogContent className="sm:max-w-[min(95vw,1400px)]">
        <DialogHeader>
          <DialogTitle>OEM {grupo?.codigo_oem}</DialogTitle>
          <DialogDescription>
            {grupo?.rubro ?? "Sin rubro"}
            {grupo?.proveedores.length === 1
              ? ` · ${grupo.proveedores[0]}`
              : " · detalle por proveedor"}
          </DialogDescription>
        </DialogHeader>

        {grupo && (
          <>
            {/* Tipografía del modal: todo sale de las variables de styles.css
                (--ui-font en la tabla, -sm para etiquetas/notas, -lg para las
                cifras del resumen). Nada de text-xs/text-sm fijos: quedaban chicos. */}
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-3">
              <div>
                <p className="text-[length:var(--ui-font-sm)] text-muted-foreground">Existencia</p>
                <p className="text-[length:var(--ui-font-lg)] font-semibold tabular-nums">
                  {fmtN(grupo.existencia)}
                </p>
              </div>
              <div>
                <p className="text-[length:var(--ui-font-sm)] text-muted-foreground">Vendidas</p>
                <p className="text-[length:var(--ui-font-lg)] font-semibold tabular-nums">
                  {fmtN(grupo.ventas)}
                </p>
              </div>
              <div>
                <p className="text-[length:var(--ui-font-sm)] text-muted-foreground">
                  {unProveedor ? "Compradas" : "Compradas (total)"}
                </p>
                <p className="text-[length:var(--ui-font-lg)] font-semibold tabular-nums">
                  {fmtN(grupo.compras)}
                </p>
              </div>
            </div>

            {/* overflow-auto y no solo -y: con la descripción en una línea la tabla
                puede pasarse de ancho en pantallas chicas, y ahí scrollea dentro de
                su contenedor en vez de romper el layout del modal. */}
            <div className="max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* El pedido se carga acá: una línea por artículo+proveedor,
                        que es lo que hace falta para saber a quién pedirle qué. */}
                    <TableHead className="w-10" />
                    <TableHead className="w-20">Cant.</TableHead>
                    {/* Todas las columnas al mismo tamaño (--ui-font de Table):
                        las de texto a 12px quedaban chicas al lado de los números. */}
                    {!unProveedor && <TableHead>Proveedor</TableHead>}
                    <TableHead>Cód. Prov.</TableHead>
                    <TableHead>Artículo</TableHead>
                    <ThNum campo="costo_ultimo" titulo="Costo Ultimo" orden={orden} onOrdenar={ordenarPor} />
                    <ThNum campo="compras" titulo="Compradas" orden={orden} onOrdenar={ordenarPor} />
                    <ThNum
                      campo="ventas_articulo"
                      titulo="Vendidas (art.)"
                      orden={orden}
                      onOrdenar={ordenarPor}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f, i) => (
                    <TableRow key={`${f.proveedor ?? ""}-${f.id_articulo ?? ""}-${i}`}>
                      <TableCell>
                        <Checkbox
                          checked={pedido[filaKey(f)] != null}
                          onCheckedChange={(v) => onPedir(f, v === true)}
                          aria-label={`Pedir ${f.articulo ?? ""}`}
                        />
                      </TableCell>
                      <TableCell>
                        {pedido[filaKey(f)] != null && (
                          <Input
                            type="number"
                            min={1}
                            value={pedido[filaKey(f)]}
                            onChange={(e) => onCantidad(f, e.target.value)}
                            aria-label="Cantidad a pedir"
                            className="h-8 w-16 px-2"
                          />
                        )}
                      </TableCell>
                      {!unProveedor && (
                        <TableCell className="whitespace-nowrap">{f.proveedor ?? "—"}</TableCell>
                      )}
                      <TableCell className="whitespace-nowrap font-mono">
                        {f.cod_proveedor ?? "—"}
                      </TableCell>
                      {/* nowrap: la descripción entra en una sola línea. */}
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onVerImagen(f.id_articulo, f.articulo ?? undefined)}
                            aria-label="Ver imagen"
                            className="shrink-0 text-muted-foreground hover:text-primary"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                          {f.articulo ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtN(f.costo_ultimo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtN(f.compras)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.ventas_articulo == null ? "—" : fmtN(f.ventas_articulo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-[length:var(--ui-font-sm)] text-muted-foreground">
              Las compras son por proveedor. Las ventas no: una venta no registra de qué compra
              salió cada unidad, así que &quot;Vendidas (art.)&quot; es el total vendido de ese
              artículo — si se le compra a varios proveedores, la cifra se repite en cada fila.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
