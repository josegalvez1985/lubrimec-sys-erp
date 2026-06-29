import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Star,
  Loader2,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import {
  listarMarcas,
  crearMarca,
  actualizarMarca,
  eliminarMarca,
  type Marca,
  type MarcaInput,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

// ─── Rating de estrellas ─────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(0)}
            className={cn(
              "transition-transform",
              !readOnly && "hover:scale-110 cursor-pointer",
              readOnly && "cursor-default",
            )}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "h-4 w-4",
                filled ? "fill-primary text-primary" : "text-muted-foreground/40",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Vista ───────────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; marca: Marca }
  | { mode: "view"; marca: Marca };

export function MarcasView() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Marca | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["marcas", COD_EMPRESA],
    queryFn: () => listarMarcas(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarMarca(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marcas"] });
      setAEliminar(null);
    },
  });

  const marcas = (data ?? [])
    .filter((m) => (m.descripcion ?? "").toLowerCase().includes(filtro.toLowerCase()))
    .sort((a, b) => b.id_marca - a.id_marca);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      {/* Card header */}
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Catálogo de marcas</h2>
          <p className="text-sm text-muted-foreground">
            {marcas.length} {marcas.length === 1 ? "marca" : "marcas"} registradas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar marca..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-10 pl-10"
            />
          </div>
          <Button
            onClick={() => setModal({ mode: "create" })}
            className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Nueva marca</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      {/* Tabla / estados */}
      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar las marcas"}
        </p>
      ) : marcas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Tag className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">
            {filtro ? "Sin resultados" : "Aún no hay marcas"}
          </p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {filtro
              ? "Prueba con otro término de búsqueda."
              : "Crea tu primera marca con el botón “Nueva marca”."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Valoración</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marcas.map((m) => (
                <TableRow key={m.id_marca} className="group">
                  <TableCell className="text-muted-foreground">
                    <Badge variant="outline" className="font-mono">
                      {m.id_marca}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {m.descripcion || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <StarRating value={m.valoracion ?? 0} readOnly />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ mode: "view", marca: m })}
                        aria-label="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ mode: "edit", marca: m })}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setAEliminar(m)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal crear / editar / ver */}
      <MarcaDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["marcas"] });
          setModal({ mode: "closed" });
        }}
      />

      {/* Confirmación eliminar */}
      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar marca?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.descripcion}</span>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_marca);
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

// ─── Dialog de formulario ────────────────────────────────────────────────────

function MarcaDialog({
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
  const marca = state.mode === "edit" || state.mode === "view" ? state.marca : null;

  const [descripcion, setDescripcion] = useState("");
  const [valoracion, setValoracion] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir según la marca seleccionada.
  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${marca?.id_marca ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setDescripcion(marca?.descripcion ?? "");
    setValoracion(marca?.valoracion ?? 0);
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: MarcaInput = {
        descripcion: descripcion.trim() || null,
        cod_empresa: COD_EMPRESA,
        valoracion: valoracion || null,
      };
      if (state.mode === "edit") {
        await actualizarMarca(state.marca.id_marca, input);
      } else {
        await crearMarca(input);
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
      ? "Nueva marca"
      : state.mode === "edit"
        ? "Editar marca"
        : "Detalle de marca";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Completa los datos de la marca y guarda los cambios.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && marca && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{marca.id_marca}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Shell, Castrol, Mobil..."
              disabled={isView || saving}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label>Valoración</Label>
            <StarRating
              value={valoracion}
              onChange={isView ? undefined : setValoracion}
              readOnly={isView}
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
