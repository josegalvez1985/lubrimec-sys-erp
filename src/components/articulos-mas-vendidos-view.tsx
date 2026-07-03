import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Search,
  TrendingUp,
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

const COD_EMPRESA = 24;

const fmtN = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-PY"));

// Columnas de la grilla (mismas que la página 102 de APEX). Se reusan en tabla y exports.
const COLUMNAS: {
  titulo: string;
  valor: (a: ArticuloMasVendido) => string;
  num?: boolean;
}[] = [
  { titulo: "Cantidad Ventas", valor: (a) => fmtN(a.cantidad_ventas), num: true },
  { titulo: "Stock", valor: (a) => fmtN(a.stock), num: true },
  { titulo: "Descripción", valor: (a) => a.descripcion ?? "" },
  { titulo: "Codigo Oem", valor: (a) => a.codigo_oem ?? "" },
  { titulo: "Costo Ultimo", valor: (a) => fmtN(a.costo_ultimo), num: true },
  { titulo: "Fecha Ultimo Inventario", valor: (a) => a.fecha_ultimo_inventario ?? "" },
];

// Facetas tipo select de la página 102: se aplican server-side; las opciones se
// derivan de los datos cargados (comportamiento facetado: se acotan entre sí).
const FACETAS: {
  clave: keyof FiltrosMasVendidos;
  etiqueta: string;
  valor: (a: ArticuloMasVendido) => string | null;
}[] = [
  { clave: "proveedor", etiqueta: "Proveedor", valor: (a) => a.proveedor },
  { clave: "rubro", etiqueta: "Rubro", valor: (a) => a.rubro },
  { clave: "viscosidad", etiqueta: "Viscosidad", valor: (a) => a.viscosidad },
  { clave: "marca", etiqueta: "Marca", valor: (a) => a.marca },
  { clave: "unidad", etiqueta: "Unidad", valor: (a) => a.cod_unidad_medida },
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
const POR_PAGINA = 10;
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
    const val = f.valor(a);
    return val != null && sel.includes(val);
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
        const v = f.valor(a);
        if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
      }
      out[f.clave] = Array.from(conteo.entries())
        .map(([valor, count]) => ({ valor, count }))
        .sort((x, y) => x.valor.localeCompare(y.valor));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, facetas, pasaTexto]);

  // Resultado final: texto + todas las facetas (AND entre facetas, OR dentro).
  const articulos = useMemo(
    () => todos.filter((a) => pasaTexto(a) && FACETAS.every((f) => pasaFaceta(a, f))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, facetas, pasaTexto],
  );

  // Paginación (10 por página). Al cambiar filtros/resultados, volver a la 1.
  const totalPaginas = Math.max(1, Math.ceil(articulos.length / POR_PAGINA));
  useEffect(() => {
    setPagina(1);
  }, [searchInput, facetas]);
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

  async function copiarPedido() {
    const vistos = new Set<string>();
    const lineas = todos
      .filter((a) => {
        if (pedido[a.id_articulo] == null || vistos.has(a.id_articulo)) return false;
        vistos.add(a.id_articulo);
        return true;
      })
      .map((a) => `${pedido[a.id_articulo]} x ${a.descripcion ?? ""}`.trim());
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
                  <div className="flex items-start gap-2">
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
                    <TableHead className="w-10" />
                    <TableHead className="w-20">Cant.</TableHead>
                    {COLUMNAS.map((c) => (
                      <TableHead key={c.titulo} className={c.num ? "text-right" : ""}>
                        {c.titulo}
                      </TableHead>
                    ))}
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
                          {c.valor(a)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Paginación (10 por página) */}
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
    </div>
  );
}
