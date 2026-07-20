import { useState, useEffect, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Barcode, Search, Check } from "lucide-react";
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
import {
  listarCodigosBarras,
  crearCodigoBarra,
  actualizarCodigoBarra,
  eliminarCodigoBarra,
  buscarArticulos,
  type CodigoBarra,
  type CodigoBarraInput,
  type ArticuloBusqueda,
} from "@/lib/api";

const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; codigo: CodigoBarra }
  | { mode: "view"; codigo: CodigoBarra };

const COLUMNAS: Column<CodigoBarra>[] = [
  {
    key: "id_barra",
    header: "ID",
    num: true,
    accessor: (r) => r.id_barra,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_barra}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "cod_barra",
    header: "Código de barras",
    accessor: (r) => r.cod_barra,
    render: (r) => <span className="font-mono">{r.cod_barra}</span>,
    hideable: false,
  },
  {
    key: "descripcion_articulo",
    header: "Artículo",
    accessor: (r) => r.descripcion_articulo ?? "",
    render: (r) =>
      r.descripcion_articulo || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
  },
  {
    key: "codigo_oem",
    header: "Cód. OEM",
    accessor: (r) => r.codigo_oem ?? "",
    render: (r) => r.codigo_oem || <span className="text-muted-foreground">—</span>,
  },
  {
    key: "id_articulo",
    header: "ID artículo",
    num: true,
    accessor: (r) => r.id_articulo,
  },
];

export function CodigosBarrasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<CodigoBarra | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["codigos-barras", COD_EMPRESA],
    queryFn: () => listarCodigosBarras(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarCodigoBarra(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["codigos-barras"] });
      setAEliminar(null);
    },
  });

  const codigos = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Códigos de barras</h2>
          <p className="text-sm text-muted-foreground">
            Códigos de barras asociados a los artículos
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo código</span>
          <span className="sm:hidden">Nuevo</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar los códigos"}
          </p>
        ) : codigos.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Barcode className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay códigos de barras</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo código”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={codigos}
            getRowId={(r) => r.id_barra}
            searchPlaceholder="Buscar código o artículo..."
            exportName="codigos-barras"
            initialSort={{ key: "id_barra", dir: "desc" }}
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", codigo: r })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", codigo: r })}
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

      <CodigoBarraDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["codigos-barras"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar código de barras?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el código{" "}
              <span className="font-mono font-semibold">{aEliminar?.cod_barra}</span>. Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_barra);
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

// ─── Dialog de formulario (con buscador de artículos) ────────────────────────

function CodigoBarraDialog({
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
  const codigo = state.mode === "edit" || state.mode === "view" ? state.codigo : null;

  const [codBarra, setCodBarra] = useState("");
  // Artículo seleccionado (id + descripción para mostrar sin re-consultar).
  const [articulo, setArticulo] = useState<ArticuloBusqueda | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${codigo?.id_barra ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setCodBarra(codigo?.cod_barra ?? "");
    setArticulo(
      codigo
        ? {
            id_articulo: codigo.id_articulo,
            descripcion: codigo.descripcion_articulo,
            codigo_oem: codigo.codigo_oem,
          }
        : null,
    );
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!articulo) {
      setError("Seleccioná un artículo");
      return;
    }
    if (!codBarra.trim()) {
      setError("Ingresá el código de barras");
      return;
    }
    setSaving(true);
    try {
      const input: CodigoBarraInput = {
        id_articulo: articulo.id_articulo,
        cod_barra: codBarra.trim(),
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarCodigoBarra(state.codigo.id_barra, input);
      } else {
        await crearCodigoBarra(input);
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
      ? "Nuevo código de barras"
      : state.mode === "edit"
        ? "Editar código de barras"
        : "Detalle del código de barras";
  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Elegí el artículo y cargá (o escaneá) su código de barras.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && codigo && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{codigo.id_barra}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Artículo</Label>
            {isView ? (
              <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {articulo?.descripcion || `Artículo ${articulo?.id_articulo ?? "—"}`}
              </div>
            ) : (
              <SelectorArticulo
                seleccionado={articulo}
                onSelect={setArticulo}
                disabled={dis}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cod_barra">Código de barras</Label>
            <Input
              id="cod_barra"
              value={codBarra}
              onChange={(e) => setCodBarra(e.target.value)}
              placeholder="Escaneá o escribí el código"
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
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

// ─── Selector de artículo con búsqueda ───────────────────────────────────────

export function SelectorArticulo({
  seleccionado,
  onSelect,
  disabled,
}: {
  seleccionado: ArticuloBusqueda | null;
  onSelect: (a: ArticuloBusqueda) => void;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [debounced, setDebounced] = useState("");
  const [abierto, setAbierto] = useState(false);

  // Debounce de 300ms para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const resultadosQuery = useQuery({
    queryKey: ["articulos-buscar", COD_EMPRESA, debounced],
    queryFn: () => buscarArticulos(debounced, COD_EMPRESA),
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
              {seleccionado.descripcion || `Artículo ${seleccionado.id_articulo}`}
            </span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              #{seleccionado.id_articulo}
              {seleccionado.codigo_oem ? ` · ${seleccionado.codigo_oem}` : ""}
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
              placeholder={seleccionado ? "Cambiar artículo..." : "Buscar artículo..."}
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
                  {resultados.map((a) => (
                    <li key={a.id_articulo}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(a);
                          setTexto("");
                          setAbierto(false);
                        }}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent",
                          seleccionado?.id_articulo === a.id_articulo && "bg-primary/5",
                        )}
                      >
                        <span className="font-medium">
                          {a.descripcion || `Artículo ${a.id_articulo}`}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          #{a.id_articulo}
                          {a.codigo_oem ? ` · ${a.codigo_oem}` : ""}
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
