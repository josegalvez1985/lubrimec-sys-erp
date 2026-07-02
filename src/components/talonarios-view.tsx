import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, BookText } from "lucide-react";
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
  listarTalonarios,
  crearTalonario,
  actualizarTalonario,
  eliminarTalonario,
  type Talonario,
  type TalonarioInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; tal: Talonario }
  | { mode: "view"; tal: Talonario };

const fmtFecha = (f: string | null) =>
  f ? new Date(f + "T00:00:00").toLocaleDateString("es-PY") : "—";

const COLUMNAS: Column<Talonario>[] = [
  {
    key: "id_talonario",
    header: "ID",
    num: true,
    accessor: (t) => t.id_talonario,
    render: (t) => (
      <Badge variant="outline" className="font-mono">
        {t.id_talonario}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "ser_timbrado",
    header: "Serie",
    accessor: (t) => t.ser_timbrado,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "nro_timbrado",
    header: "Nº Timbrado",
    num: true,
    accessor: (t) => t.nro_timbrado,
  },
  {
    key: "fecha_vigencia",
    header: "Vigencia",
    accessor: (t) => t.fecha_vigencia ?? "",
    render: (t) => fmtFecha(t.fecha_vigencia),
  },
  {
    key: "fecha_vencimiento",
    header: "Vencimiento",
    accessor: (t) => t.fecha_vencimiento ?? "",
    render: (t) => fmtFecha(t.fecha_vencimiento),
  },
  {
    key: "ind_ncr",
    header: "NCR",
    accessor: (t) => t.ind_ncr,
    render: (t) =>
      t.ind_ncr === "S" ? (
        <Badge variant="secondary">Sí</Badge>
      ) : (
        <span className="text-muted-foreground">No</span>
      ),
  },
  {
    key: "activo",
    header: "Activo",
    accessor: (t) => t.activo,
    render: (t) =>
      t.activo === "S" ? (
        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Activo</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Inactivo
        </Badge>
      ),
  },
];

export function TalonariosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Talonario | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["talonarios", COD_EMPRESA],
    queryFn: () => listarTalonarios(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarTalonario(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talonarios", COD_EMPRESA] });
      setAEliminar(null);
    },
  });

  const talonarios = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Talonarios</h2>
          <p className="text-sm text-muted-foreground">Timbrados de facturación</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo talonario</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar los talonarios"}
          </p>
        ) : talonarios.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BookText className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay talonarios</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo talonario”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={talonarios}
            getRowId={(t) => t.id_talonario}
            searchPlaceholder="Buscar talonario..."
            exportName="talonarios"
            initialSort={{ key: "id_talonario", dir: "desc" }}
            actions={(t) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", tal: t })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", tal: t })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(t)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <TalonarioDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["talonarios", COD_EMPRESA] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar talonario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el timbrado{" "}
              <span className="font-semibold">{aEliminar?.nro_timbrado}</span>. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_talonario);
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

function TalonarioDialog({
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
  const tal = state.mode === "edit" || state.mode === "view" ? state.tal : null;

  const [serTimbrado, setSerTimbrado] = useState("");
  const [nroTimbrado, setNroTimbrado] = useState("");
  const [fechaVigencia, setFechaVigencia] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [nroInicial, setNroInicial] = useState("1");
  const [nroFinal, setNroFinal] = useState("");
  const [indNcr, setIndNcr] = useState("N");
  const [activo, setActivo] = useState("S");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${tal?.id_talonario ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setSerTimbrado(tal?.ser_timbrado ?? "");
    setNroTimbrado(tal != null ? String(tal.nro_timbrado) : "");
    setFechaVigencia(tal?.fecha_vigencia ?? "");
    setFechaVencimiento(tal?.fecha_vencimiento ?? "");
    setNroInicial(tal != null ? String(tal.nro_inicial) : "1");
    setNroFinal(tal != null ? String(tal.nro_final) : "");
    setIndNcr(tal?.ind_ncr ?? "N");
    setActivo(tal?.activo ?? "S");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: TalonarioInput = {
        ser_timbrado: serTimbrado.trim(),
        nro_timbrado: Number(nroTimbrado) || 0,
        fecha_vigencia: fechaVigencia || null,
        fecha_vencimiento: fechaVencimiento || null,
        nro_inicial: Number(nroInicial) || 0,
        nro_final: Number(nroFinal) || 0,
        ind_ncr: indNcr,
        cod_empresa: COD_EMPRESA,
        activo,
      };
      if (state.mode === "edit") {
        await actualizarTalonario(state.tal.id_talonario, input);
      } else {
        await crearTalonario(input);
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
      ? "Nuevo talonario"
      : state.mode === "edit"
        ? "Editar talonario"
        : "Detalle de talonario";
  const dis = isView || saving;
  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos del talonario y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && tal && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{tal.id_talonario}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ser_timbrado">Serie del timbrado</Label>
              <Input
                id="ser_timbrado"
                value={serTimbrado}
                onChange={(e) => setSerTimbrado(e.target.value)}
                placeholder="Ej. 002-002"
                disabled={dis}
                required={!isView}
                autoFocus={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_timbrado">Nº de timbrado</Label>
              <Input
                id="nro_timbrado"
                type="number"
                min={0}
                value={nroTimbrado}
                onChange={(e) => setNroTimbrado(e.target.value)}
                placeholder="12345678"
                disabled={dis}
                required={!isView}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fecha_vigencia">Fecha de vigencia</Label>
              <Input
                id="fecha_vigencia"
                type="date"
                value={fechaVigencia}
                onChange={(e) => setFechaVigencia(e.target.value)}
                disabled={dis}
                required={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_vencimiento">Fecha de vencimiento</Label>
              <Input
                id="fecha_vencimiento"
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                disabled={dis}
                required={!isView}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nro_inicial">Nº inicial</Label>
              <Input
                id="nro_inicial"
                type="number"
                min={0}
                value={nroInicial}
                onChange={(e) => setNroInicial(e.target.value)}
                disabled={dis}
                required={!isView}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_final">Nº final</Label>
              <Input
                id="nro_final"
                type="number"
                min={0}
                value={nroFinal}
                onChange={(e) => setNroFinal(e.target.value)}
                disabled={dis}
                required={!isView}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ind_ncr">¿Es NCR?</Label>
              <select
                id="ind_ncr"
                className={selectCls}
                value={indNcr}
                onChange={(e) => setIndNcr(e.target.value)}
                disabled={dis}
              >
                <option value="N">No</option>
                <option value="S">Sí</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activo">Estado</Label>
              <select
                id="activo"
                className={selectCls}
                value={activo}
                onChange={(e) => setActivo(e.target.value)}
                disabled={dis}
              >
                <option value="S">Activo</option>
                <option value="N">Inactivo</option>
              </select>
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
