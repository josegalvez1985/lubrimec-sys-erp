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
import { listarPedidosArticulos, type PedidoArticulo } from "@/lib/api";
import { ArticuloImgModal } from "@/components/articulo-img-modal";

const COD_EMPRESA = 24;

const fmtN = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-PY"));

// Columnas de la grilla. `sort` = valor usado para ordenar (num o texto).
type ColKey = keyof PedidoArticulo;
const COLUMNAS: {
  key: ColKey;
  titulo: string;
  num?: boolean;
  valor: (a: PedidoArticulo) => string;
  sort: (a: PedidoArticulo) => number | string;
}[] = [
  {
    key: "codigo_oem",
    titulo: "OEM",
    valor: (a) => a.codigo_oem ?? "",
    sort: (a) => a.codigo_oem ?? "",
  },
  {
    key: "existencia",
    titulo: "Existencia",
    num: true,
    valor: (a) => fmtN(a.existencia),
    sort: (a) => a.existencia ?? 0,
  },
  {
    key: "articulo",
    titulo: "Articulo",
    valor: (a) => a.articulo ?? "",
    sort: (a) => a.articulo ?? "",
  },
  {
    key: "costo_ultimo",
    titulo: "Costo Ultimo",
    num: true,
    valor: (a) => fmtN(a.costo_ultimo),
    sort: (a) => a.costo_ultimo ?? 0,
  },
  {
    key: "proveedor",
    titulo: "Proveedor",
    valor: (a) => a.proveedor ?? "",
    sort: (a) => a.proveedor ?? "",
  },
  {
    key: "ventas",
    titulo: "Ventas",
    num: true,
    valor: (a) => fmtN(a.ventas),
    sort: (a) => a.ventas,
  },
  {
    key: "compras",
    titulo: "Compras",
    num: true,
    valor: (a) => fmtN(a.compras),
    sort: (a) => a.compras,
  },
];

// Facetas del sidebar (mockup): En Falta, Rubro, Proveedor.
const FACETAS: { clave: string; etiqueta: string; valor: (a: PedidoArticulo) => string | null }[] =
  [
    { clave: "faltantes", etiqueta: "En Falta", valor: (a) => a.faltantes },
    { clave: "rubro", etiqueta: "Rubro", valor: (a) => a.rubro },
    { clave: "proveedor", etiqueta: "Proveedor", valor: (a) => a.proveedor },
  ];

// Clave única de una fila (mismo OEM puede venir con varios proveedores).
const filaKey = (a: PedidoArticulo) => `${a.codigo_oem ?? ""}|${a.proveedor ?? ""}`;

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

// Vista de la página 63 (Pedidos de Artículos): grilla con búsqueda, facetas
// dependientes en sidebar y orden por columnas. Filtrado 100% en el front.
export function PedidosArticulosView() {
  const [facetas, setFacetas] = useState<Record<string, string[]>>({});
  const [searchInput, setSearchInput] = useState("");
  const [orden, setOrden] = useState<{ key: ColKey; dir: "asc" | "desc" }>({
    key: "ventas",
    dir: "desc",
  });
  // Cuántas opciones mostrar por faceta (para "Mostrar todo").
  const [expandida, setExpandida] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: ["pedidos-articulos", COD_EMPRESA],
    queryFn: () => listarPedidosArticulos(COD_EMPRESA),
    retry: false,
  });
  const todos = useMemo(() => query.data ?? [], [query.data]);

  const pasaTexto = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return (a: PedidoArticulo) => {
      if (!q) return true;
      const texto =
        `${a.articulo ?? ""} ${a.codigo_oem ?? ""} ${a.proveedor ?? ""} ${a.rubro ?? ""}`.toLowerCase();
      return texto.includes(q);
    };
  }, [searchInput]);

  function pasaFaceta(a: PedidoArticulo, f: (typeof FACETAS)[number]) {
    const sel = facetas[f.clave] ?? [];
    if (sel.length === 0) return true;
    const val = f.valor(a);
    return val != null && sel.includes(val);
  }

  // Opciones de cada faceta (con conteo), calculadas aplicando las OTRAS facetas +
  // texto → facetas dependientes (AND entre facetas, OR dentro de cada una).
  const opciones = useMemo(() => {
    const out: Record<string, { valor: string; count: number }[]> = {};
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

  const articulos = useMemo(() => {
    const col = COLUMNAS.find((c) => c.key === orden.key);
    const filtrados = todos.filter((a) => pasaTexto(a) && FACETAS.every((f) => pasaFaceta(a, f)));
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

  // Artículo cuya imagen se muestra en el modal (null = cerrado).
  const [imgArticulo, setImgArticulo] = useState<PedidoArticulo | null>(null);

  // Pedido: filas tildadas con su cantidad (filaKey -> cantidad).
  const [pedido, setPedido] = useState<Record<string, number>>({});

  function toggleItem(a: PedidoArticulo, checked: boolean) {
    const k = filaKey(a);
    setPedido((prev) => {
      const next = { ...prev };
      if (checked) next[k] = prev[k] ?? 1;
      else delete next[k];
      return next;
    });
  }

  function setCantidad(a: PedidoArticulo, valor: string) {
    const n = Math.max(1, Math.floor(Number(valor) || 1));
    setPedido((prev) => ({ ...prev, [filaKey(a)]: n }));
  }

  const seleccionados = Object.keys(pedido).length;

  async function copiarPedido() {
    const vistos = new Set<string>();
    const lineas = todos
      .filter((a) => {
        const k = filaKey(a);
        if (pedido[k] == null || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .map((a) => `${pedido[filaKey(a)]} x ${a.articulo ?? ""}`.trim());
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
              {query.isSuccess
                ? `${articulos.length} artículo${articulos.length === 1 ? "" : "s"}`
                : "Cargando..."}
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
        ) : articulos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin artículos para los filtros seleccionados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-20">Cant.</TableHead>
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
              {articulos.map((a, i) => {
                const k = filaKey(a);
                return (
                  <TableRow key={`${k}-${i}`}>
                    <TableCell>
                      <Checkbox
                        checked={pedido[k] != null}
                        onCheckedChange={(v) => toggleItem(a, v === true)}
                        aria-label="Agregar al pedido"
                      />
                    </TableCell>
                    <TableCell>
                      {pedido[k] != null && (
                        <Input
                          type="number"
                          min={1}
                          value={pedido[k]}
                          onChange={(e) => setCantidad(a, e.target.value)}
                          aria-label="Cantidad"
                          className="h-8 w-16 px-2 text-sm"
                        />
                      )}
                    </TableCell>
                    {COLUMNAS.map((c) => (
                      <TableCell key={c.key} className={c.num ? "text-right tabular-nums" : ""}>
                        {c.key === "articulo" ? (
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
                );
              })}
            </TableBody>
          </Table>
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
        titulo={imgArticulo?.articulo}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}
