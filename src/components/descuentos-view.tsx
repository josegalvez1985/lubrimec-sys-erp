import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Tag } from "lucide-react";
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
  listarDescuentos,
  crearDescuento,
  actualizarDescuento,
  eliminarDescuento,
  type Descuento,
  type DescuentoInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("es-PY")}%`;
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: Descuento }
  | { mode: "view"; item: Descuento };

const COLUMNAS: Column<Descuento>[] = [
  {
    key: "id_descuento",
    header: "ID",
    num: true,
    accessor: (r) => r.id_descuento,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_descuento}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "fecha_desde",
    header: "Vigencia Desde",
    accessor: (r) => r.fecha_desde ?? "",
    render: (r) => fmtFecha(r.fecha_desde),
    hideable: false,
  },
  {
    key: "fecha_hasta",
    header: "Vigencia Hasta",
    accessor: (r) => r.fecha_hasta ?? "",
    render: (r) => fmtFecha(r.fecha_hasta),
  },
  {
    key: "porc_descuento",
    header: "% Descuento",
    num: true,
    accessor: (r) => r.porc_descuento,
    render: (r) => fmtPct(r.porc_descuento),
  },
];

export function DescuentosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Descuento | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["descuentos", COD_EMPRESA],
    queryFn: () => listarDescuentos(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarDescuento(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["descuentos"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_descuento - a.id_descuento);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Descuentos</h2>
          <p className="text-sm text-muted-foreground">Descuentos por vigencia de fechas</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo descuento</span>
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
            {error instanceof Error ? error.message : "No se pudieron cargar los descuentos"}
          </p>
        ) : filas.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Tag className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay descuentos</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo descuento”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_descuento}
            searchPlaceholder="Buscar descuento..."
            exportName="descuentos"
            initialSort={{ key: "id_descuento", dir: "desc" }}
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", item: r })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
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
        )}
      </div>

      <DescuentoDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["descuentos"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar descuento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el descuento{" "}
              <span className="font-semibold">{aEliminar && fmtPct(aEliminar.porc_descuento)}</span>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_descuento);
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

function DescuentoDialog({
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
  const item = state.mode === "edit" || state.mode === "view" ? state.item : null;

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_descuento ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setFechaDesde(item?.fecha_desde ?? "");
    setFechaHasta(item?.fecha_hasta ?? "");
    setPorcentaje(item?.porc_descuento != null ? String(item.porc_descuento) : "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (fechaDesde && fechaHasta && fechaHasta < fechaDesde) {
      return setError("La fecha hasta no puede ser anterior a la fecha desde");
    }
    setSaving(true);
    try {
      const input: DescuentoInput = {
        fecha_desde: fechaDesde || null,
        fecha_hasta: fechaHasta || null,
        porc_descuento: porcentaje.trim() === "" ? null : Number(porcentaje),
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarDescuento(state.item.id_descuento, input);
      } else {
        await crearDescuento(input);
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
      ? "Nuevo descuento"
      : state.mode === "edit"
        ? "Editar descuento"
        : "Detalle del descuento";
  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Vigencia por rango de fechas y porcentaje.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_descuento}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fecha_desde">Vigencia Desde</Label>
              <Input
                id="fecha_desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                disabled={dis}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_hasta">Vigencia Hasta</Label>
              <Input
                id="fecha_hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                disabled={dis}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="porc_descuento">% Descuento</Label>
            <Input
              id="porc_descuento"
              type="number"
              step="0.01"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              placeholder="0"
              disabled={dis}
              className="tabular-nums"
              autoFocus={!isView}
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
