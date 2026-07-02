import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, FileSignature } from "lucide-react";
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
  listarCondicionesFacturas,
  crearCondicionFactura,
  actualizarCondicionFactura,
  eliminarCondicionFactura,
  type CondicionFactura,
  type CondicionFacturaInput,
} from "@/lib/api";

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; cond: CondicionFactura }
  | { mode: "view"; cond: CondicionFactura };

const COLUMNAS: Column<CondicionFactura>[] = [
  {
    key: "id_condicion",
    header: "ID",
    num: true,
    accessor: (c) => c.id_condicion,
    render: (c) => (
      <Badge variant="outline" className="font-mono">
        {c.id_condicion}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "descripcion",
    header: "Descripción",
    accessor: (c) => c.descripcion,
    render: (c) => c.descripcion || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "dias",
    header: "Días",
    num: true,
    accessor: (c) => c.dias,
  },
];

export function CondicionesFacturasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<CondicionFactura | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["condiciones-facturas"],
    queryFn: listarCondicionesFacturas,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarCondicionFactura(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["condiciones-facturas"] });
      setAEliminar(null);
    },
  });

  const condiciones = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Condiciones de Facturas</h2>
          <p className="text-sm text-muted-foreground">Plazos de pago</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva condición</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar las condiciones"}
          </p>
        ) : condiciones.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileSignature className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay condiciones</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea la primera con el botón “Nueva condición”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={condiciones}
            getRowId={(c) => c.id_condicion}
            searchPlaceholder="Buscar condición..."
            exportName="condiciones-facturas"
            initialSort={{ key: "dias", dir: "asc" }}
            actions={(c) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", cond: c })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", cond: c })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(c)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <CondicionDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["condiciones-facturas"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar condición?</AlertDialogTitle>
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
                if (aEliminar) eliminarMut.mutate(aEliminar.id_condicion);
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

function CondicionDialog({
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
  const cond = state.mode === "edit" || state.mode === "view" ? state.cond : null;

  const [descripcion, setDescripcion] = useState("");
  const [dias, setDias] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${cond?.id_condicion ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setDescripcion(cond?.descripcion ?? "");
    setDias(cond != null ? String(cond.dias) : "0");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: CondicionFacturaInput = {
        descripcion: descripcion.trim() || null,
        dias: Number(dias) || 0,
      };
      if (state.mode === "edit") {
        await actualizarCondicionFactura(state.cond.id_condicion, input);
      } else {
        await crearCondicionFactura(input);
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
      ? "Nueva condición"
      : state.mode === "edit"
        ? "Editar condición"
        : "Detalle de condición";
  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos de la condición y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && cond && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{cond.id_condicion}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Contado, 30 días, 60 días..."
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dias">Días</Label>
            <Input
              id="dias"
              type="number"
              min={0}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              placeholder="0"
              disabled={dis}
              required={!isView}
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
