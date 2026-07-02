import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
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
  listarUnidadesMedidas,
  crearUnidadMedida,
  actualizarUnidadMedida,
  eliminarUnidadMedida,
  type UnidadMedida,
} from "@/lib/api";

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; unidad: UnidadMedida }
  | { mode: "view"; unidad: UnidadMedida };

const COLUMNAS: Column<UnidadMedida>[] = [
  {
    key: "cod_unidad_medida",
    header: "Código",
    accessor: (u) => u.cod_unidad_medida,
    render: (u) => (
      <Badge variant="outline" className="font-mono">
        {u.cod_unidad_medida}
      </Badge>
    ),
    className: "w-24",
  },
  {
    key: "descripcion",
    header: "Descripción",
    accessor: (u) => u.descripcion,
    render: (u) => u.descripcion || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
];

export function UnidadesMedidasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<UnidadMedida | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["unidades-medidas"],
    queryFn: listarUnidadesMedidas,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (cod: string) => eliminarUnidadMedida(cod),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unidades-medidas"] });
      setAEliminar(null);
    },
  });

  const unidades = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Unidades de Medidas</h2>
          <p className="text-sm text-muted-foreground">Catálogo de unidades</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva unidad</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar las unidades"}
          </p>
        ) : unidades.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Ruler className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay unidades</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea la primera con el botón “Nueva unidad”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={unidades}
            getRowId={(u) => u.cod_unidad_medida}
            searchPlaceholder="Buscar por código o descripción..."
            exportName="unidades-medidas"
            initialSort={{ key: "cod_unidad_medida", dir: "asc" }}
            actions={(u) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", unidad: u })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", unidad: u })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(u)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <UnidadDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["unidades-medidas"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar unidad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.cod_unidad_medida}</span>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.cod_unidad_medida);
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

function UnidadDialog({
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
  const isEdit = state.mode === "edit";
  const unidad = state.mode === "edit" || state.mode === "view" ? state.unidad : null;

  const [cod, setCod] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${unidad?.cod_unidad_medida ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setCod(unidad?.cod_unidad_medida ?? "");
    setDescripcion(unidad?.descripcion ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (isEdit) {
        await actualizarUnidadMedida(state.unidad.cod_unidad_medida, descripcion.trim() || null);
      } else {
        await crearUnidadMedida({
          cod_unidad_medida: cod.trim().toUpperCase(),
          descripcion: descripcion.trim() || null,
        });
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
      ? "Nueva unidad de medida"
      : isEdit
        ? "Editar unidad de medida"
        : "Detalle de unidad";

  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos de la unidad y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cod">Código</Label>
            <Input
              id="cod"
              value={cod}
              onChange={(e) => setCod(e.target.value.toUpperCase())}
              placeholder="Ej. UN, KG, LT..."
              maxLength={5}
              // El código es la PK: solo editable al crear.
              disabled={dis || isEdit}
              required={!isView && !isEdit}
              autoFocus={state.mode === "create"}
              className="font-mono uppercase"
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">El código no se puede modificar.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Unidad, Kilogramo, Litro..."
              disabled={dis}
              autoFocus={isEdit}
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
