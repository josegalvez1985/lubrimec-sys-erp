import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  listarParametros,
  crearParametro,
  actualizarParametro,
  eliminarParametro,
  type Parametro,
  type ParametroInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: Parametro };

export function ParametrosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Parametro | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["parametros", COD_EMPRESA],
    queryFn: () => listarParametros(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarParametro(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parametros"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];

  const COLUMNAS: Column<Parametro>[] = [
    {
      key: "parametro",
      header: "Parámetro",
      accessor: (r) => r.parametro ?? "",
      render: (r) => <span className="font-medium">{r.parametro || "—"}</span>,
      hideable: false,
    },
    {
      key: "valor",
      header: "Valor",
      accessor: (r) => r.valor ?? "",
      render: (r) => r.valor || "—",
    },
    {
      key: "observacion",
      header: "Observación",
      accessor: (r) => r.observacion ?? "",
      render: (r) => r.observacion || "—",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Parámetros</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "parámetro" : "parámetros"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los parámetros"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <SlidersHorizontal className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay parámetros</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Registra el primero con el botón “Crear”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_parametro}
            initialSort={{ key: "parametro", dir: "asc" }}
            exportName="parametros"
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", item: r })}
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
        </div>
      )}

      <ParametroDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["parametros"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar parámetro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el parámetro{" "}
              <span className="font-semibold">{aEliminar?.parametro}</span>. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_parametro);
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

// ─── Dialog de formulario (pág 90 Crear Parámetro) ───────────────────────────

function ParametroDialog({
  state,
  onClose,
  onSaved,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode !== "closed";
  const item = state.mode === "edit" ? state.item : null;

  const [parametro, setParametro] = useState("");
  const [valor, setValor] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir según el ítem seleccionado.
  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_parametro ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setParametro(item?.parametro ?? "");
    setValor(item?.valor ?? "");
    setObservacion(item?.observacion ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!parametro.trim() || !valor.trim() || !observacion.trim()) {
      setError("Parámetro, valor y observación son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const input: ParametroInput = {
        cod_empresa: COD_EMPRESA,
        parametro: parametro.trim(),
        valor: valor.trim(),
        observacion: observacion.trim(),
      };
      if (state.mode === "edit") {
        await actualizarParametro(state.item.id_parametro, input);
      } else {
        await crearParametro(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "edit" ? "Editar Parámetro" : "Crear Parámetro"}
          </DialogTitle>
          <DialogDescription>
            Parámetro y valor se guardan en mayúsculas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parametro">Parámetro</Label>
            <Input
              id="parametro"
              value={parametro}
              onChange={(e) => setParametro(e.target.value.toUpperCase())}
              maxLength={500}
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor</Label>
            <Input
              id="valor"
              value={valor}
              onChange={(e) => setValor(e.target.value.toUpperCase())}
              maxLength={500}
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacion">Observación</Label>
            <Input
              id="observacion"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              maxLength={500}
              disabled={saving}
              required
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {state.mode === "edit" ? "Aplicar Cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
