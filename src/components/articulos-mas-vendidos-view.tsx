import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileSpreadsheet,
  ImageIcon,
  Loader2,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listarArticulosMasVendidos,
  type FiltrosMasVendidos,
  type ArticuloMasVendido,
} from "@/lib/api";
import { exportarExcel, exportarPdf } from "@/lib/export";
import { ArticuloImgModal } from "@/components/articulo-img-modal";

const COD_EMPRESA = 24;

const fmtN = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-PY"));

// Columnas de la grilla (mismas que la página 102 de APEX). Se reusan en tabla y
// exports. `sort` = valor crudo para ordenar (número o texto), NO el formateado:
// con fmtN("1.234") el orden saldría alfabético.
const COLUMNAS: {
  titulo: string;
  valor: (a: ArticuloMasVendido) => string;
  num?: boolean;
  sort: (a: ArticuloMasVendido) => number | string;
}[] = [
  {
    titulo: "Cantidad Ventas",
    valor: (a) => fmtN(a.cantidad_ventas),
    num: true,
    sort: (a) => a.cantidad_ventas ?? 0,
  },
  { titulo: "Stock", valor: (a) => fmtN(a.stock), num: true, sort: (a) => a.stock ?? 0 },
  { titulo: "Descripción", valor: (a) => a.descripcion ?? "", sort: (a) => a.descripcion ?? "" },
  { titulo: "Codigo Oem", valor: (a) => a.codigo_oem ?? "", sort: (a) => a.codigo_oem ?? "" },
  {
    titulo: "Cód. Prov.",
    valor: (a) => a.cod_proveedor ?? "",
    sort: (a) => a.cod_proveedor ?? "",
  },
  {
    titulo: "Costo Ultimo",
    valor: (a) => fmtN(a.costo_ultimo),
    num: true,
    sort: (a) => a.costo_ultimo ?? 0,
  },
  {
    titulo: "Fecha Ultimo Inventario",
    valor: (a) => a.fecha_ultimo_inventario ?? "",
    // dd/mm/yyyy no ordena como texto: se invierte a yyyymmdd.
    sort: (a) => (a.fecha_ultimo_inventario ?? "").split("/").reverse().join(""),
  },
];

// El backend manda los proveedores de un artículo en un solo texto separado por
// " / " (LISTAGG). Para la faceta se separan: si no, "A / B" sería una opción
// aparte y el proveedor A aparecería repetido en la lista.
const SEP_PROVEEDORES = " / ";
const unoSolo = (v: string | null) => (v ? [v] : []);

// Facetas de la página 102: las opciones se derivan de los datos cargados
// (comportamiento facetado: se acotan entre sí). `valores` es una lista porque
// Proveedor es multivaluada: el artículo pasa si CUALQUIERA de sus proveedores
// está tildado (mismo criterio que la pág 63).
const FACETAS: {
  clave: keyof FiltrosMasVendidos;
  etiqueta: string;
  valores: (a: ArticuloMasVendido) => string[];
}[] = [
  {
    clave: "proveedor",
    etiqueta: "Proveedor",
    valores: (a) => (a.proveedor ? a.proveedor.split(SEP_PROVEEDORES) : []),
  },
  { clave: "rubro", etiqueta: "Rubro", valores: (a) => unoSolo(a.rubro) },
  { clave: "viscosidad", etiqueta: "Viscosidad", valores: (a) => unoSolo(a.viscosidad) },
  { clave: "marca", etiqueta: "Marca", valores: (a) => unoSolo(a.marca) },
  { clave: "unidad", etiqueta: "Unidad", valores: (a) => unoSolo(a.cod_unidad_medida) },
];

// Copia al portapapeles con fallback. navigator.clipboard solo existe en contextos
// seguros (HTTPS/localhost); en HTTP por IP o dentro del WebView del APK falla, así
// que se recurre a execCommand con un textarea temporal.
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

function tablaExport(articulos: ArticuloMasVendido[]) {
  return {
    titulo: "Lubrimesys — Artículos Más Vendidos",
    subtitulo: `articulos-mas-vendidos-${new Date().toLocaleDateString("es-PY").replace(/\//g, "-")}`,
    columnas: COLUMNAS.map((c) => c.titulo),
    filas: articulos.map((a) => COLUMNAS.map((c) => c.valor(a))),
  };
}

// Vista de la página 102 (Artículos Más Vendidos): ranking por cantidad de
// ventas con facetas y export a Excel/PDF.
const POR_PAGINA = 30;
const LIMITE_FACETA = 8;

export function ArticulosMasVendidosView() {
  // Facetas seleccionadas (multi-select). El texto vive en searchInput.
  const [facetas, setFacetas] = useState<Record<string, string[]>>({});
  const [searchInput, setSearchInput] = useState("");
  const [expandida, setExpandida] = useState<Record<string, boolean>>({});
  const [pagina, setPagina] = useState(1);

  // Se trae TODO el dataset una sola vez (sin filtros server-side). Los filtros
  // y facetas se aplican en el front sobre estos datos crudos.
  const query = useQuery({
    queryKey: ["articulos-mas-vendidos", COD_EMPRESA],
    queryFn: () => listarArticulosMasVendidos({}, COD_EMPRESA),
    retry: false,
  });
  const todos = useMemo(() => query.data ?? [], [query.data]);

  // ¿El artículo pasa el texto de búsqueda? (AND, siempre acota)
  const pasaTexto = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return (a: ArticuloMasVendido) => {
      if (!q) return true;
      const texto =
        `${a.descripcion ?? ""} ${a.codigo_oem ?? ""} ${a.proveedor ?? ""} ${a.marca ?? ""}`.toLowerCase();
      return texto.includes(q);
    };
  }, [searchInput]);

  // ¿El artículo pasa una faceta? (OR dentro de la faceta; sin selección = pasa)
  function pasaFaceta(a: ArticuloMasVendido, f: (typeof FACETAS)[number]) {
    const sel = facetas[f.clave] ?? [];
    if (sel.length === 0) return true;
    return f.valores(a).some((v) => sel.includes(v));
  }

  // Facetas dependientes: AND entre facetas distintas, OR dentro de cada una. Las
  // opciones de una faceta se calculan aplicando TODAS las demás (menos ella misma)
  // más el texto, así solo se ofrecen valores compatibles con lo ya filtrado.
  const opciones = useMemo(() => {
    const out: Partial<Record<keyof FiltrosMasVendidos, { valor: string; count: number }[]>> = {};
    for (const f of FACETAS) {
      const compatibles = todos.filter(
        (a) => pasaTexto(a) && FACETAS.every((otra) => otra === f || pasaFaceta(a, otra)),
      );
      const conteo = new Map<string, number>();
      for (const a of compatibles) {
        for (const v of new Set(f.valores(a))) conteo.set(v, (conteo.get(v) ?? 0) + 1);
      }
      out[f.clave] = Array.from(conteo.entries())
        .map(([valor, count]) => ({ valor, count }))
        .sort((x, y) => x.valor.localeCompare(y.valor));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, facetas, pasaTexto]);

  // Resultado final: texto + todas las facetas (AND entre facetas, OR dentro).
  // El backend ya devuelve ordenado por cantidad_ventas desc: se arranca igual
  // para que la pantalla no cambie de orden sola al montar.
  const [orden, setOrden] = useState<{ titulo: string; dir: "asc" | "desc" }>({
    titulo: "Cantidad Ventas",
    dir: "desc",
  });

  function ordenarPor(titulo: string) {
    setOrden((o) =>
      o.titulo === titulo ? { titulo, dir: o.dir === "asc" ? "desc" : "asc" } : { titulo, dir: "asc" },
    );
  }

  const articulos = useMemo(() => {
    const filtrados = todos.filter((a) => pasaTexto(a) && FACETAS.every((f) => pasaFaceta(a, f)));
    const col = COLUMNAS.find((c) => c.titulo === orden.titulo);
    if (!col) return filtrados;
    const dir = orden.dir === "asc" ? 1 : -1;
    // Se ordena ANTES de paginar: si no, cada página se ordenaría por separado.
    return [...filtrados].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, facetas, pasaTexto, orden]);

  // Paginación (30 por página). Al cambiar filtros, orden o resultados, volver
  // a la 1: con otro orden, seguir en la página 5 deja en pantalla filas que no
  // tienen nada que ver con lo que se estaba mirando.
  const totalPaginas = Math.max(1, Math.ceil(articulos.length / POR_PAGINA));
  useEffect(() => {
    setPagina(1);
  }, [searchInput, facetas, orden]);
  const paginaActual = Math.min(pagina, totalPaginas);
  const pagina0 = (paginaActual - 1) * POR_PAGINA;
  const articulosPagina = articulos.slice(pagina0, pagina0 + POR_PAGINA);

  // Activa/desactiva un valor dentro de una faceta (multi-selección).
  function toggleFaceta(clave: keyof FiltrosMasVendidos, valor: string) {
    setFacetas((prev) => {
      const actuales = prev[clave] ?? [];
      const next = actuales.includes(valor)
        ? actuales.filter((v) => v !== valor)
        : [...actuales, valor];
      return { ...prev, [clave]: next };
    });
  }

  // Artículo cuya imagen se muestra en el modal (null = cerrado).
  const [imgArticulo, setImgArticulo] = useState<ArticuloMasVendido | null>(null);

  // Pedido al proveedor: artículos tildados con su cantidad (id_articulo -> cantidad).
  const [pedido, setPedido] = useState<Record<string, number>>({});

  function toggleItem(a: ArticuloMasVendido, checked: boolean) {
    setPedido((prev) => {
      const next = { ...prev };
      if (checked) next[a.id_articulo] = prev[a.id_articulo] ?? 1;
      else delete next[a.id_articulo];
      return next;
    });
  }

  function setCantidad(a: ArticuloMasVendido, valor: string) {
    const n = Math.max(1, Math.floor(Number(valor) || 1));
    setPedido((prev) => ({ ...prev, [a.id_articulo]: n }));
  }

  const seleccionados = Object.keys(pedido).length;

  function limpiarPedido() {
    // El toast avisa que pasó algo: el botón desaparece al vaciarse el pedido y
    // sin aviso el clic se siente como que no hizo nada.
    setPedido({});
    toast.success(`Pedido vaciado (${seleccionados} artículo${seleccionados === 1 ? "" : "s"})`);
  }

  async function copiarPedido() {
    const vistos = new Set<string>();
    const lineas = todos
      .filter((a) => {
        if (pedido[a.id_articulo] == null || vistos.has(a.id_articulo)) return false;
        vistos.add(a.id_articulo);
        return true;
      })
      // El código del proveedor va primero: es el que él reconoce. El OEM se
      // agrega solo si la descripción no lo trae ya adentro (muchas lo incluyen).
      .map((a) => {
        const desc = a.descripcion ?? "";
        const oem = a.codigo_oem ?? "";
        return [
          `${pedido[a.id_articulo]} x`,
          a.cod_proveedor ? `${a.cod_proveedor} ·` : "",
          oem && !desc.includes(oem) ? oem : "",
          desc,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
      });
    if (lineas.length === 0) return;
    const texto = `Pedido:\n${lineas.join("\n")}`;
    if (await copiarTexto(texto)) {
      toast.success(`Pedido copiado (${lineas.length} artículo${lineas.length === 1 ? "" : "s"})`);
    } else {
      toast.error("No se pudo copiar");
    }
  }

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
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold">Artículos Más Vendidos</h2>
            <p className="text-sm text-muted-foreground">
              {query.isSuccess
                ? `${articulos.length} artículo${articulos.length === 1 ? "" : "s"}`
                : "Cargando..."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={copiarPedido}
              disabled={seleccionados === 0}
              className="gap-2"
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
                className="gap-1 text-muted-foreground"
              >
                <X className="h-4 w-4" />
                Limpiar
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => exportarExcel(tablaExport(articulos))}
              disabled={articulos.length === 0}
              className="gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => exportarPdf(tablaExport(articulos))}
              disabled={articulos.length === 0}
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "No se pudieron cargar los artículos"}
          </p>
        ) : articulos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin artículos para los filtros seleccionados.
          </p>
        ) : (
          <>
            {/* Móvil: tarjetas */}
            <div className="space-y-2 p-2 md:hidden">
              {articulosPagina.map((a, i) => (
                <div
                  key={`${a.id_articulo}-${i}`}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  {/* El pedido se carga en el modal, igual que en escritorio: la
                      tarjeta muestra el estado y abre el detalle al tocarla. */}
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setImgArticulo(a)}
                      aria-label="Ver imagen"
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <Checkbox
                      checked={pedido[a.id_articulo] != null}
                      onCheckedChange={(v) => toggleItem(a, v === true)}
                      aria-label="Agregar al pedido"
                      className="mt-0.5"
                    />
                    <p className="min-w-0 flex-1 text-sm font-semibold">{a.descripcion}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {pedido[a.id_articulo] != null && (
                        <Input
                          type="number"
                          min={1}
                          value={pedido[a.id_articulo]}
                          onChange={(e) => setCantidad(a, e.target.value)}
                          aria-label="Cantidad"
                          className="h-7 w-16 px-2 text-sm"
                        />
                      )}
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {fmtN(a.cantidad_ventas)} vendidos
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.codigo_oem ? `OEM ${a.codigo_oem} · ` : ""}
                    {a.cod_proveedor ? `${a.cod_proveedor} · ` : ""}
                    Stock {fmtN(a.stock)} · Costo {fmtN(a.costo_ultimo)}
                    {a.fecha_ultimo_inventario ? ` · Inv. ${a.fecha_ultimo_inventario}` : ""}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop/tablet: grilla */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* El pedido se carga acá, en el detalle de la grilla. */}
                    <TableHead className="w-10" />
                    <TableHead className="w-20">Cant.</TableHead>
                    {COLUMNAS.map((c) => {
                      const activa = orden.titulo === c.titulo;
                      const Icono = !activa
                        ? ArrowUpDown
                        : orden.dir === "asc"
                          ? ArrowUp
                          : ArrowDown;
                      return (
                        <TableHead key={c.titulo} className={c.num ? "text-right" : ""}>
                          <button
                            type="button"
                            onClick={() => ordenarPor(c.titulo)}
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
                  {articulosPagina.map((a, i) => (
                    <TableRow key={`${a.id_articulo}-${i}`}>
                      <TableCell>
                        <Checkbox
                          checked={pedido[a.id_articulo] != null}
                          onCheckedChange={(v) => toggleItem(a, v === true)}
                          aria-label="Agregar al pedido"
                        />
                      </TableCell>
                      <TableCell>
                        {pedido[a.id_articulo] != null && (
                          <Input
                            type="number"
                            min={1}
                            value={pedido[a.id_articulo]}
                            onChange={(e) => setCantidad(a, e.target.value)}
                            aria-label="Cantidad"
                            className="h-8 w-16 px-2 text-sm"
                          />
                        )}
                      </TableCell>
                      {COLUMNAS.map((c) => (
                        <TableCell
                          key={c.titulo}
                          className={c.num ? "text-right tabular-nums" : ""}
                        >
                          {c.titulo === "Descripción" ? (
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setImgArticulo(a)}
                                aria-label="Ver imagen"
                                className="shrink-0 text-muted-foreground hover:text-primary"
                              >
                                <ImageIcon className="h-4 w-4" />
                              </button>
                              {c.valor(a)}
                            </span>
                          ) : (
                            c.valor(a)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Paginación (30 por página) */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
              <p className="text-xs text-muted-foreground">
                {pagina0 + 1}–{Math.min(pagina0 + POR_PAGINA, articulos.length)} de {articulos.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaActual <= 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  {paginaActual} / {totalPaginas}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaActual >= totalPaginas}
                  className="gap-1"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
        {query.isFetching && !query.isLoading && (
          <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Actualizando...
          </p>
        )}
      </div>

      <ArticuloImgModal
        open={imgArticulo != null}
        id={imgArticulo?.id_articulo ?? null}
        titulo={imgArticulo?.descripcion}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}
