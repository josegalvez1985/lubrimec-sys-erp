import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
export function ArticulosMasVendidosView() {
  // Facetas seleccionadas (multi-select). El texto vive en searchInput.
  const [facetas, setFacetas] = useState<Record<string, string[]>>({});
  const [searchInput, setSearchInput] = useState("");

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
    const out: Partial<Record<keyof FiltrosMasVendidos, string[]>> = {};
    for (const f of FACETAS) {
      const compatibles = todos.filter(
        (a) => pasaTexto(a) && FACETAS.every((otra) => otra === f || pasaFaceta(a, otra)),
      );
      out[f.clave] = Array.from(
        new Set(compatibles.map(f.valor).filter((v): v is string => !!v)),
      ).sort((a, b) => a.localeCompare(b));
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

  const hayFiltros = !!searchInput || Object.values(facetas).some((v) => v.length > 0);

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

  function limpiar() {
    setFacetas({});
    setSearchInput("");
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
    const lineas = todos
      .filter((a) => pedido[a.id_articulo] != null)
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
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 sm:p-5">
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

      {/* Filtros (facetas de la página 102) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 sm:p-5">
        <div className="relative min-w-[180px] flex-1">
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
          return (
            <DropdownMenu key={f.clave}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-between gap-2 font-normal"
                >
                  {f.etiqueta}
                  {sel.length > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 text-xs font-medium text-primary">
                      {sel.length}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                {opts.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin opciones</p>
                ) : (
                  opts.map((o) => (
                    <DropdownMenuCheckboxItem
                      key={o}
                      checked={sel.includes(o)}
                      onCheckedChange={() => toggleFaceta(f.clave, o)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {o}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
        {(hayFiltros || searchInput) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={limpiar}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Grilla */}
      <div className="overflow-x-auto p-2 sm:p-4">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
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
            <div className="space-y-2 md:hidden">
              {articulos.map((a, i) => (
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
                  {articulos.map((a, i) => (
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
