import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { exportarExcel } from "@/lib/export";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Columna declarativa del DataTable. Replica lo básico de un Interactive Report
// de APEX: orden, filtro por columna, mostrar/ocultar.
export type Column<T> = {
  key: string;
  header: string;
  // Valor crudo para ordenar/filtrar (texto o número). Default: render como texto.
  accessor?: (row: T) => string | number | null | undefined;
  // Celda a renderizar (default: accessor formateado).
  render?: (row: T) => ReactNode;
  num?: boolean; // alinea a la derecha y ordena numéricamente
  sortable?: boolean; // default true
  filterable?: boolean; // default true
  hideable?: boolean; // default true; false para columnas que no se pueden ocultar
  className?: string;
  // Celda de la fila de totales al pie (recibe las filas visibles ya filtradas).
  // Si ninguna columna define footer, no se muestra la fila de totales.
  footer?: (rows: T[]) => ReactNode;
};

type Orden = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  actions,
  actionsHeader = "Acciones",
  globalSearch = true,
  searchPlaceholder = "Buscar...",
  toolbarExtra,
  emptyText = "Sin registros.",
  initialSearch,
  initialSort,
  dense: denseProp,
  exportName,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T, index: number) => string | number;
  actions?: (row: T) => ReactNode;
  actionsHeader?: string;
  globalSearch?: boolean;
  searchPlaceholder?: string;
  toolbarExtra?: ReactNode;
  emptyText?: string;
  // Valor inicial del search global (ej. desde el buscador del header).
  initialSearch?: string;
  initialSort?: Orden;
  dense?: boolean;
  // Nombre base del archivo Excel. Si se omite, no se muestra el botón de export.
  exportName?: string;
}) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [orden, setOrden] = useState<Orden>(initialSort ?? null);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [dense, setDense] = useState(!!denseProp);
  const [filtroAbierto, setFiltroAbierto] = useState<string | null>(null);

  const val = (row: T, col: Column<T>): string | number | null | undefined =>
    col.accessor ? col.accessor(row) : undefined;

  const visibles = columns.filter((c) => !ocultas.has(c.key));

  const procesadas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtroCols = Object.entries(filtros).filter(([, v]) => v.trim() !== "");

    let out = rows.filter((row) => {
      // Search global sobre todas las columnas con accessor.
      if (q) {
        const texto = columns
          .map((c) => val(row, c))
          .filter((v) => v != null)
          .join(" ")
          .toLowerCase();
        if (!texto.includes(q)) return false;
      }
      // Filtro por columna (contiene, case-insensitive).
      for (const [key, fv] of filtroCols) {
        const col = columns.find((c) => c.key === key);
        if (!col) continue;
        const raw = val(row, col);
        if (raw == null || !String(raw).toLowerCase().includes(fv.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    if (orden) {
      const col = columns.find((c) => c.key === orden.key);
      if (col) {
        const dir = orden.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = val(a, col);
          const vb = val(b, col);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, search, filtros, orden]);

  function ordenarPor(key: string) {
    setOrden((o) =>
      o?.key === key
        ? o.dir === "asc"
          ? { key, dir: "desc" }
          : null // tercer click quita el orden
        : { key, dir: "asc" },
    );
  }

  const hayFiltros = search !== "" || Object.values(filtros).some((v) => v.trim() !== "");
  const cellPad = dense ? "py-1.5" : "";

  // Contenido de una celda (compartido por la tabla de escritorio y las tarjetas
  // de móvil, para que ambas vistas muestren exactamente lo mismo).
  function celda(row: T, c: Column<T>): ReactNode {
    if (c.render) return c.render(row);
    const v = val(row, c);
    return v == null || v === "" ? <span className="text-muted-foreground">—</span> : String(v);
  }

  // En móvil cada fila se dibuja como tarjeta: la columna principal es el título
  // y el resto van como pares etiqueta/valor. Se toma la primera columna marcada
  // `hideable: false` (la que la vista considera identificatoria) o, si no hay,
  // la primera visible.
  const principal = visibles.find((c) => c.hideable === false) ?? visibles[0];
  const secundarias = visibles.filter((c) => c.key !== principal?.key);
  const hayFooter = visibles.some((c) => c.footer);

  // Excel de lo que se ve: columnas visibles (con accessor) y filas ya filtradas/ordenadas.
  function exportar() {
    const cols = visibles.filter((c) => c.accessor);
    const fecha = new Date().toLocaleDateString("es-PY").replace(/\//g, "-");
    exportarExcel({
      titulo: exportName ?? "Datos",
      subtitulo: `${exportName ?? "datos"}-${fecha}`,
      columnas: cols.map((c) => c.header),
      filas: procesadas.map((row) =>
        cols.map((c) => {
          const v = val(row, c);
          return v == null ? "" : String(v);
        }),
      ),
    });
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {globalSearch && (
          // En móvil el buscador toma la fila entera (basis-full) y los botones
          // bajan a la siguiente; desde sm comparten línea.
          <div className="relative min-w-[180px] flex-1 basis-full sm:basis-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-[var(--control-h-lg)] pl-10"
            />
          </div>
        )}
        {toolbarExtra}

        {exportName && (
          <Button
            type="button"
            variant="outline"
            onClick={exportar}
            disabled={procesadas.length === 0}
            className="h-[var(--control-h-lg)] gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
        )}

        {/* Mostrar/ocultar columnas + densidad */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="h-[var(--control-h-lg)] gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Columnas</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
            {columns
              .filter((c) => c.hideable !== false)
              .map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!ocultas.has(c.key)}
                  onCheckedChange={(v) =>
                    setOcultas((prev) => {
                      const next = new Set(prev);
                      if (v) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.header}
                </DropdownMenuCheckboxItem>
              ))}
            <DropdownMenuLabel className="mt-1 border-t border-border pt-2">
              Densidad
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={dense}
              onCheckedChange={(v) => setDense(v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Compacta
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hayFiltros && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setFiltros({});
            }}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-4 w-4" /> Limpiar
          </Button>
        )}
      </div>

      {/* Tabla (escritorio/tablet). En móvil se usan las tarjetas de abajo. */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {visibles.map((c) => {
                const activa = orden?.key === c.key;
                const Icono = !activa ? ArrowUpDown : orden!.dir === "asc" ? ArrowUp : ArrowDown;
                const puedeOrden = c.sortable !== false && c.accessor;
                const puedeFiltrar = c.filterable !== false && c.accessor;
                const filtrada = (filtros[c.key] ?? "").trim() !== "";
                return (
                  <TableHead key={c.key} className={c.num ? "text-right" : ""}>
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        c.num ? "justify-end" : "justify-between",
                      )}
                    >
                      {puedeOrden ? (
                        <button
                          type="button"
                          onClick={() => ordenarPor(c.key)}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            c.num && "flex-row-reverse",
                            activa && "text-foreground",
                          )}
                        >
                          {c.header}
                          <Icono className="h-3.5 w-3.5 opacity-60" />
                        </button>
                      ) : (
                        <span>{c.header}</span>
                      )}
                      {puedeFiltrar && (
                        <DropdownMenu
                          open={filtroAbierto === c.key}
                          onOpenChange={(o) => setFiltroAbierto(o ? c.key : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "shrink-0 rounded p-0.5 hover:text-foreground",
                                filtrada ? "text-primary" : "text-muted-foreground/50",
                              )}
                              aria-label={`Filtrar ${c.header}`}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48 p-2">
                            <Input
                              autoFocus
                              placeholder={`Filtrar ${c.header}...`}
                              value={filtros[c.key] ?? ""}
                              onChange={(e) =>
                                setFiltros((prev) => ({ ...prev, [c.key]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setFiltroAbierto(null);
                              }}
                              className="h-8"
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableHead>
                );
              })}
              {actions && <TableHead className="w-32 text-right">{actionsHeader}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {procesadas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibles.length + (actions ? 1 : 0)}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              procesadas.map((row, i) => (
                <TableRow key={getRowId(row, i)} className="group">
                  {visibles.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(c.num && "text-right tabular-nums", cellPad, c.className)}
                    >
                      {c.render
                        ? c.render(row)
                        : (() => {
                            const v = val(row, c);
                            return v == null || v === "" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              String(v)
                            );
                          })()}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell className={cn("text-right", cellPad)}>{actions(row)}</TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
          {hayFooter && procesadas.length > 0 && (
            <TableFooter>
              <TableRow>
                {visibles.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(c.num && "text-right tabular-nums", "font-semibold", c.className)}
                  >
                    {c.footer ? c.footer(procesadas) : null}
                  </TableCell>
                ))}
                {actions && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Tarjetas (móvil): una fila por tarjeta, sin scroll horizontal. */}
      <div className="space-y-2 md:hidden">
        {procesadas.length === 0 ? (
          <p className="py-10 text-center text-[length:var(--ui-font)] text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          procesadas.map((row, i) => (
            <div
              key={getRowId(row, i)}
              className="rounded-xl border border-border bg-card p-[var(--panel-p)] shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                {principal && (
                  <div
                    className={cn(
                      "min-w-0 flex-1 font-medium",
                      principal.num && "tabular-nums",
                      principal.className,
                    )}
                  >
                    {celda(row, principal)}
                  </div>
                )}
                {/* Las vistas dibujan sus acciones con botones de 32px (cómodos con
                    mouse, chicos para el dedo): en la tarjeta móvil se agrandan a
                    40px sin que cada vista tenga que saberlo. */}
                {actions && (
                  <div className="shrink-0 [&_button]:h-10 [&_button]:w-10">{actions(row)}</div>
                )}
              </div>

              {secundarias.length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-border pt-3">
                  {secundarias.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-[length:var(--ui-font-sm)] text-muted-foreground">
                        {c.header}
                      </dt>
                      <dd
                        className={cn(
                          "min-w-0 break-words text-right text-[length:var(--ui-font)]",
                          c.num && "tabular-nums",
                        )}
                      >
                        {celda(row, c)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))
        )}

        {/* Totales al pie, con el mismo cálculo que la fila de la tabla. */}
        {hayFooter && procesadas.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/50 p-[var(--panel-p)]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
              {visibles
                .filter((c) => c.footer)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-[length:var(--ui-font-sm)] text-muted-foreground">
                      {c.header}
                    </dt>
                    <dd className={cn("min-w-0 text-right font-semibold", c.num && "tabular-nums")}>
                      {c.footer!(procesadas)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </div>

      <p className="text-[length:var(--ui-font-sm)] text-muted-foreground">
        {procesadas.length} de {rows.length} {rows.length === 1 ? "registro" : "registros"}
      </p>
    </div>
  );
}
