import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Droplets } from "lucide-react";
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
  listarViscosidades,
  crearViscosidad,
  actualizarViscosidad,
  eliminarViscosidad,
  type Viscosidad,
  type ViscosidadInput,
} from "@/lib/api";

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; visc: Viscosidad }
  | { mode: "view"; visc: Viscosidad };

const tipoLabel = (mc: string) => (mc === "M" ? "Motor" : mc === "C" ? "Caja" : mc);

const COLUMNAS: Column<Viscosidad>[] = [
  {
    key: "id_viscosidad",
    header: "ID",
    num: true,
    accessor: (v) => v.id_viscosidad,
    render: (v) => (
      <Badge variant="outline" className="font-mono">
        {v.id_viscosidad}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "descripcion",
    header: "Descripción",
    accessor: (v) => v.descripcion,
    render: (v) => v.descripcion || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "motor_caja",
    header: "Tipo",
    accessor: (v) => tipoLabel(v.motor_caja),
    render: (v) => <Badge variant="secondary">{tipoLabel(v.motor_caja)}</Badge>,
  },
];

export function ViscosidadView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Viscosidad | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["viscosidad-lubricantes"],
    queryFn: listarViscosidades,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarViscosidad(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["viscosidad-lubricantes"] });
      setAEliminar(null);
    },
  });

  const viscosidades = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Viscosidad de Lubricantes</h2>
          <p className="text-sm text-muted-foreground">Grados de viscosidad (motor / caja)</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva viscosidad</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar las viscosidades"}
          </p>
        ) : viscosidades.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Droplets className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay viscosidades</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea la primera con el botón “Nueva viscosidad”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={viscosidades}
            getRowId={(v) => v.id_viscosidad}
            searchPlaceholder="Buscar viscosidad..."
            exportName="viscosidad-lubricantes"
            initialSort={{ key: "descripcion", dir: "asc" }}
            actions={(v) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", visc: v })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", visc: v })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(v)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <ViscosidadDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["viscosidad-lubricantes"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar viscosidad?</AlertDialogTitle>
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
                if (aEliminar) eliminarMut.mutate(aEliminar.id_viscosidad);
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

function ViscosidadDialog({
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
  const visc = state.mode === "edit" || state.mode === "view" ? state.visc : null;

  const [descripcion, setDescripcion] = useState("");
  const [motorCaja, setMotorCaja] = useState("M");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${visc?.id_viscosidad ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setDescripcion(visc?.descripcion ?? "");
    setMotorCaja(visc?.motor_caja ?? "M");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: ViscosidadInput = {
        descripcion: descripcion.trim() || null,
        motor_caja: motorCaja,
      };
      if (state.mode === "edit") {
        await actualizarViscosidad(state.visc.id_viscosidad, input);
      } else {
        await crearViscosidad(input);
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
      ? "Nueva viscosidad"
      : state.mode === "edit"
        ? "Editar viscosidad"
        : "Detalle de viscosidad";
  const dis = isView || saving;
  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos de la viscosidad y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && visc && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{visc.id_viscosidad}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. SAE 15W-40, 80W-90..."
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="motor_caja">Tipo</Label>
            <select
              id="motor_caja"
              className={selectCls}
              value={motorCaja}
              onChange={(e) => setMotorCaja(e.target.value)}
              disabled={dis}
            >
              <option value="M">Motor</option>
              <option value="C">Caja</option>
            </select>
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
