import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Percent } from "lucide-react";
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
import { listarIva, crearIva, actualizarIva, eliminarIva, type Iva } from "@/lib/api";

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-PY"));

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; iva: Iva }
  | { mode: "view"; iva: Iva };

const COLUMNAS: Column<Iva>[] = [
  {
    key: "cod_iva",
    header: "Cód.",
    num: true,
    accessor: (i) => i.cod_iva,
    render: (i) => (
      <Badge variant="outline" className="font-mono">
        {i.cod_iva}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "descripcion",
    header: "Descripción",
    accessor: (i) => i.descripcion,
    render: (i) => i.descripcion || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "divisor_iva",
    header: "Divisor IVA",
    num: true,
    accessor: (i) => i.divisor_iva,
    render: (i) => fmt(i.divisor_iva),
  },
  {
    key: "divisor_gravada",
    header: "Divisor Gravada",
    num: true,
    accessor: (i) => i.divisor_gravada,
    render: (i) => fmt(i.divisor_gravada),
  },
];

export function IvaView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Iva | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["iva"],
    queryFn: listarIva,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (cod: number) => eliminarIva(cod),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iva"] });
      setAEliminar(null);
    },
  });

  const items = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">IVA</h2>
          <p className="text-sm text-muted-foreground">Tipos de IVA</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo IVA</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar los IVA"}
          </p>
        ) : items.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Percent className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay registros</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo IVA”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={items}
            getRowId={(i) => i.cod_iva}
            searchPlaceholder="Buscar por código o descripción..."
            exportName="iva"
            initialSort={{ key: "cod_iva", dir: "asc" }}
            actions={(i) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", iva: i })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", iva: i })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(i)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <IvaDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["iva"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar IVA?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.descripcion}</span> (cód.{" "}
              {aEliminar?.cod_iva}). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.cod_iva);
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

function IvaDialog({
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
  const iva = state.mode === "edit" || state.mode === "view" ? state.iva : null;

  const [codIva, setCodIva] = useState("");
  const [divisorIva, setDivisorIva] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [divisorGravada, setDivisorGravada] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${iva?.cod_iva ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setCodIva(iva ? String(iva.cod_iva) : "");
    setDivisorIva(iva?.divisor_iva != null ? String(iva.divisor_iva) : "");
    setDescripcion(iva?.descripcion ?? "");
    setDivisorGravada(iva?.divisor_gravada != null ? String(iva.divisor_gravada) : "");
    setError("");
  }

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const campos = {
        divisor_iva: num(divisorIva),
        descripcion: descripcion.trim() || null,
        divisor_gravada: num(divisorGravada),
      };
      if (isEdit) {
        await actualizarIva(state.iva.cod_iva, campos);
      } else {
        await crearIva({ cod_iva: Number(codIva), ...campos });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const titulo = state.mode === "create" ? "Nuevo IVA" : isEdit ? "Editar IVA" : "Detalle de IVA";

  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && <DialogDescription>Completa los datos del IVA y guarda.</DialogDescription>}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cod_iva">Código</Label>
            <Input
              id="cod_iva"
              type="number"
              value={codIva}
              onChange={(e) => setCodIva(e.target.value)}
              placeholder="Ej. 10, 5, 0..."
              disabled={dis || isEdit}
              required={!isView && !isEdit}
              autoFocus={state.mode === "create"}
              className="font-mono"
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
              placeholder="Ej. IVA 10%, IVA 5%, Exenta..."
              disabled={dis}
              autoFocus={isEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="divisor_iva">Divisor IVA</Label>
              <Input
                id="divisor_iva"
                type="number"
                step="0.01"
                value={divisorIva}
                onChange={(e) => setDivisorIva(e.target.value)}
                placeholder="Ej. 11"
                disabled={dis}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="divisor_gravada">Divisor Gravada</Label>
              <Input
                id="divisor_gravada"
                type="number"
                step="0.01"
                value={divisorGravada}
                onChange={(e) => setDivisorGravada(e.target.value)}
                placeholder="Ej. 1.1"
                disabled={dis}
                className="tabular-nums"
              />
            </div>
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
