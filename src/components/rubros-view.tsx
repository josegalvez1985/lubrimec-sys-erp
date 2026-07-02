import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, BookOpen } from "lucide-react";
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
  listarRubros,
  crearRubro,
  actualizarRubro,
  eliminarRubro,
  type Rubro,
  type RubroInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-PY")}%`);

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; rubro: Rubro }
  | { mode: "view"; rubro: Rubro };

const COLUMNAS: Column<Rubro>[] = [
  {
    key: "id_rubro",
    header: "ID",
    num: true,
    accessor: (r) => r.id_rubro,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_rubro}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "descripcion",
    header: "Descripción",
    accessor: (r) => r.descripcion,
    render: (r) => r.descripcion || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "porc_recargo",
    header: "% Recargo",
    num: true,
    accessor: (r) => r.porc_recargo,
    render: (r) => fmtPct(r.porc_recargo),
  },
];

export function RubrosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Rubro | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["rubros", COD_EMPRESA],
    queryFn: () => listarRubros(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarRubro(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubros"] });
      setAEliminar(null);
    },
  });

  const rubros = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Rubros</h2>
          <p className="text-sm text-muted-foreground">Catálogo de rubros de artículos</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo rubro</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar los rubros"}
          </p>
        ) : rubros.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay rubros</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo rubro”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={rubros}
            getRowId={(r) => r.id_rubro}
            searchPlaceholder="Buscar rubro..."
            exportName="rubros"
            initialSort={{ key: "descripcion", dir: "asc" }}
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", rubro: r })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", rubro: r })}
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

      <RubroDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["rubros"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rubro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.descripcion}</span>. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_rubro);
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

function RubroDialog({
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
  const rubro = state.mode === "edit" || state.mode === "view" ? state.rubro : null;

  const [descripcion, setDescripcion] = useState("");
  const [porcRecargo, setPorcRecargo] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${rubro?.id_rubro ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setDescripcion(rubro?.descripcion ?? "");
    setPorcRecargo(rubro?.porc_recargo != null ? String(rubro.porc_recargo) : "0");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: RubroInput = {
        descripcion: descripcion.trim() || null,
        cod_empresa: COD_EMPRESA,
        porc_recargo: porcRecargo.trim() === "" ? 0 : Number(porcRecargo),
      };
      if (state.mode === "edit") {
        await actualizarRubro(state.rubro.id_rubro, input);
      } else {
        await crearRubro(input);
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
      ? "Nuevo rubro"
      : state.mode === "edit"
        ? "Editar rubro"
        : "Detalle de rubro";
  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && <DialogDescription>Completa los datos del rubro y guarda.</DialogDescription>}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && rubro && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{rubro.id_rubro}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Lubricantes, Filtros, Baterías..."
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="porc_recargo">% Recargo</Label>
            <Input
              id="porc_recargo"
              type="number"
              step="0.01"
              value={porcRecargo}
              onChange={(e) => setPorcRecargo(e.target.value)}
              placeholder="0"
              disabled={dis}
              className="tabular-nums"
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
