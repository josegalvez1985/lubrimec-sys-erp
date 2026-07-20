import { useState, useEffect, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Truck, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SelectorArticulo } from "@/components/codigos-barras-view";
import {
  listarArticulosProveedores,
  crearArticuloProveedor,
  actualizarArticuloProveedor,
  eliminarArticuloProveedor,
  buscarProveedores,
  type ArticuloProveedor,
  type ArticuloProveedorInput,
  type ArticuloBusqueda,
  type ProveedorBusqueda,
} from "@/lib/api";

const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; fila: ArticuloProveedor }
  | { mode: "view"; fila: ArticuloProveedor };

const COLUMNAS: Column<ArticuloProveedor>[] = [
  {
    key: "id_articulo_proveedor",
    header: "ID",
    num: true,
    accessor: (r) => r.id_articulo_proveedor,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_articulo_proveedor}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "descripcion_articulo",
    header: "Artículo",
    accessor: (r) => r.descripcion_articulo ?? "",
    render: (r) =>
      r.descripcion_articulo || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "nombre_proveedor",
    header: "Proveedor",
    accessor: (r) => r.nombre_proveedor ?? "",
    render: (r) => r.nombre_proveedor || <span className="text-muted-foreground">—</span>,
  },
  {
    key: "id_cod_proveedor",
    header: "Cód. proveedor",
    accessor: (r) => r.id_cod_proveedor,
    render: (r) => <span className="font-mono">{r.id_cod_proveedor}</span>,
  },
  {
    key: "codigo_oem",
    header: "Cód. OEM",
    accessor: (r) => r.codigo_oem ?? "",
    render: (r) => r.codigo_oem || <span className="text-muted-foreground">—</span>,
  },
];

export function ArticulosProveedoresView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<ArticuloProveedor | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["articulos-proveedores", COD_EMPRESA],
    queryFn: () => listarArticulosProveedores(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarArticuloProveedor(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["articulos-proveedores"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Artículos por proveedor</h2>
          <p className="text-sm text-muted-foreground">
            Código con que cada proveedor identifica un artículo
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva relación</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar los datos"}
          </p>
        ) : filas.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Truck className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay artículos por proveedor</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea la primera relación con el botón “Nueva relación”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_articulo_proveedor}
            searchPlaceholder="Buscar artículo, proveedor o código..."
            exportName="articulos-proveedores"
            initialSort={{ key: "id_articulo_proveedor", dir: "desc" }}
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", fila: r })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", fila: r })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(r)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <ArticuloProveedorDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["articulos-proveedores"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar relación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la relación de{" "}
              <span className="font-semibold">
                {aEliminar?.descripcion_articulo ?? `artículo ${aEliminar?.id_articulo}`}
              </span>{" "}
              con{" "}
              <span className="font-semibold">
                {aEliminar?.nombre_proveedor ?? `proveedor ${aEliminar?.cod_persona}`}
              </span>
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_articulo_proveedor);
              }}
              disabled={eliminarMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {eliminarMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Dialog de formulario (buscador de artículo + de proveedor) ──────────────

function ArticuloProveedorDialog({
  state,
  onClose,
  onSaved,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode !== "closed";
  const isView = state.mode === "view";
  const fila = state.mode === "edit" || state.mode === "view" ? state.fila : null;

  const [articulo, setArticulo] = useState<ArticuloBusqueda | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorBusqueda | null>(null);
  const [codProveedor, setCodProveedor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${fila?.id_articulo_proveedor ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setArticulo(
      fila
        ? {
            id_articulo: fila.id_articulo,
            descripcion: fila.descripcion_articulo,
            codigo_oem: fila.codigo_oem,
          }
        : null,
    );
    setProveedor(
      fila
        ? { cod_persona: fila.cod_persona, nombre: fila.nombre_proveedor, nro_ruc: null, nro_ci: null }
        : null,
    );
    setCodProveedor(fila?.id_cod_proveedor ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!articulo) {
      setError("Seleccioná un artículo");
      return;
    }
    if (!proveedor) {
      setError("Seleccioná un proveedor");
      return;
    }
    if (!codProveedor.trim()) {
      setError("Ingresá el código del proveedor");
      return;
    }
    setSaving(true);
    try {
      const input: ArticuloProveedorInput = {
        id_articulo: articulo.id_articulo,
        cod_persona: proveedor.cod_persona,
        id_cod_proveedor: codProveedor.trim(),
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarArticuloProveedor(state.fila.id_articulo_proveedor, input);
      } else {
        await crearArticuloProveedor(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const titulo =
    state.mode === "create"
      ? "Nueva relación artículo-proveedor"
      : state.mode === "edit"
        ? "Editar relación"
        : "Detalle de la relación";
  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Elegí el artículo, el proveedor y el código con que ese proveedor lo identifica.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && fila && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{fila.id_articulo_proveedor}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Artículo</Label>
            {isView ? (
              <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {articulo?.descripcion || `Artículo ${articulo?.id_articulo ?? "—"}`}
              </div>
            ) : (
              <SelectorArticulo seleccionado={articulo} onSelect={setArticulo} disabled={dis} />
            )}
          </div>

          <div className="space-y-2">
            <Label>Proveedor</Label>
            {isView ? (
              <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {proveedor?.nombre || `Proveedor ${proveedor?.cod_persona ?? "—"}`}
              </div>
            ) : (
              <SelectorProveedor seleccionado={proveedor} onSelect={setProveedor} disabled={dis} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="id_cod_proveedor">Código del proveedor</Label>
            <Input
              id="id_cod_proveedor"
              value={codProveedor}
              onChange={(e) => setCodProveedor(e.target.value)}
              placeholder="Código con que el proveedor identifica el artículo"
              disabled={dis}
              required={!isView}
              className="font-mono"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            {isView ? (
              <Button type="button" onClick={onClose}>
                Cerrar
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Selector de proveedor con búsqueda ──────────────────────────────────────

function SelectorProveedor({
  seleccionado,
  onSelect,
  disabled,
}: {
  seleccionado: ProveedorBusqueda | null;
  onSelect: (p: ProveedorBusqueda) => void;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [debounced, setDebounced] = useState("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const resultadosQuery = useQuery({
    queryKey: ["proveedores-buscar", COD_EMPRESA, debounced],
    queryFn: () => buscarProveedores(debounced, COD_EMPRESA),
    enabled: abierto && debounced.length > 0,
    retry: false,
  });
  const resultados = resultadosQuery.data ?? [];

  return (
    <div className="space-y-2">
      {seleccionado && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-medium">
              {seleccionado.nombre || `Proveedor ${seleccionado.cod_persona}`}
            </span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              #{seleccionado.cod_persona}
              {seleccionado.nro_ruc ? ` · RUC ${seleccionado.nro_ruc}` : ""}
            </span>
          </span>
          <Check className="h-4 w-4 shrink-0 text-primary" />
        </div>
      )}

      {!disabled && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setAbierto(true);
              }}
              onFocus={() => setAbierto(true)}
              placeholder={seleccionado ? "Cambiar proveedor..." : "Buscar proveedor..."}
              className="pl-10"
            />
          </div>

          {abierto && debounced.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {resultadosQuery.isLoading ? (
                <div className="grid place-items-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : resultados.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Sin resultados.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {resultados.map((p) => (
                    <li key={p.cod_persona}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(p);
                          setTexto("");
                          setAbierto(false);
                        }}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent",
                          seleccionado?.cod_persona === p.cod_persona && "bg-primary/5",
                        )}
                      >
                        <span className="font-medium">
                          {p.nombre || `Proveedor ${p.cod_persona}`}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          #{p.cod_persona}
                          {p.nro_ruc ? ` · RUC ${p.nro_ruc}` : p.nro_ci ? ` · CI ${p.nro_ci}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
