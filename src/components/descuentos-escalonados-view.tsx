import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMonto } from "@/components/ui/input-monto";
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
  listarDescuentosEscalonados,
  crearDescuentoEscalonado,
  actualizarDescuentoEscalonado,
  eliminarDescuentoEscalonado,
  type DescuentoEscalonado,
  type DescuentoEscalonadoInput,
} from "@/lib/api";

const fmtNum = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
const hoy = () => new Date().toISOString().slice(0, 10);

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: DescuentoEscalonado }
  | { mode: "view"; item: DescuentoEscalonado };

const COLUMNAS: Column<DescuentoEscalonado>[] = [
  {
    key: "id_tabla",
    header: "ID",
    num: true,
    accessor: (r) => r.id_tabla,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_tabla}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "monto_desde",
    header: "Monto Desde",
    num: true,
    accessor: (r) => r.monto_desde,
    render: (r) => <span className="font-mono">{fmtNum(r.monto_desde)}</span>,
    hideable: false,
  },
  {
    key: "monto_hasta",
    header: "Monto Hasta",
    num: true,
    accessor: (r) => r.monto_hasta,
    render: (r) => <span className="font-mono">{fmtNum(r.monto_hasta)}</span>,
  },
  {
    key: "porcentaje",
    header: "Porcentaje",
    num: true,
    accessor: (r) => r.porcentaje,
    render: (r) => `${fmtNum(r.porcentaje)}%`,
  },
  {
    key: "venta_x",
    header: "Venta X",
    num: true,
    accessor: (r) => r.venta_x,
    render: (r) => <span className="font-mono">{fmtNum(r.venta_x)}</span>,
  },
  {
    key: "rentabilidad_70",
    header: "Rentabilidad 70%",
    num: true,
    accessor: (r) => r.rentabilidad_70,
    render: (r) => `${fmtNum(r.rentabilidad_70)}%`,
  },
  {
    key: "fecha_desde",
    header: "Fecha Desde",
    accessor: (r) => r.fecha_desde ?? "",
  },
];

export function DescuentosEscalonadosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<DescuentoEscalonado | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["descuentos-escalonados"],
    queryFn: listarDescuentosEscalonados,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarDescuentoEscalonado(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["descuentos-escalonados"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => a.monto_desde - b.monto_desde);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Descuentos Escalonados</h2>
          <p className="text-sm text-muted-foreground">Descuentos por rango de monto de venta</p>
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
              <Percent className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay descuentos escalonados</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo descuento”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_tabla}
            searchPlaceholder="Buscar descuento..."
            exportName="descuentos-escalonados"
            initialSort={{ key: "monto_desde", dir: "asc" }}
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
          qc.invalidateQueries({ queryKey: ["descuentos-escalonados"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar descuento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el descuento del rango{" "}
              <span className="font-semibold">
                {aEliminar && `${fmtNum(aEliminar.monto_desde)} — ${fmtNum(aEliminar.monto_hasta)}`}
              </span>
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_tabla);
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

  const [montoDesde, setMontoDesde] = useState<number | null>(null);
  const [montoHasta, setMontoHasta] = useState<number | null>(null);
  const [porcentaje, setPorcentaje] = useState("");
  const [fechaDesde, setFechaDesde] = useState(hoy());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_tabla ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setMontoDesde(item ? item.monto_desde : null);
    setMontoHasta(item ? item.monto_hasta : null);
    setPorcentaje(item ? String(item.porcentaje) : "");
    setFechaDesde(item?.fecha_desde ?? hoy());
    setError("");
  }

  const porcNum = porcentaje.trim() === "" ? null : Number(porcentaje);
  // venta_x = 1 - porcentaje/100 ; rentabilidad_70 = 70 - porcentaje (igual que APEX)
  const ventaX = porcNum == null || Number.isNaN(porcNum) ? null : 1 - porcNum / 100;
  const rentabilidad70 = porcNum == null || Number.isNaN(porcNum) ? null : 70 - porcNum;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (montoDesde == null) return setError("Indica el monto desde");
    if (montoHasta == null) return setError("Indica el monto hasta");
    if (porcNum == null || Number.isNaN(porcNum)) return setError("Indica el porcentaje");
    if (!fechaDesde) return setError("Indica la fecha desde");

    setSaving(true);
    try {
      const input: DescuentoEscalonadoInput = {
        monto_desde: montoDesde,
        monto_hasta: montoHasta,
        porcentaje: porcNum,
        venta_x: 1 - porcNum / 100,
        fecha_desde: fechaDesde,
      };
      if (state.mode === "edit") {
        await actualizarDescuentoEscalonado(state.item.id_tabla, input);
      } else {
        await crearDescuentoEscalonado(input);
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
      ? "Nuevo descuento escalonado"
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
            <DialogDescription>
              Venta X y Rentabilidad 70% se calculan desde el porcentaje.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_tabla}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monto_desde">Monto Desde</Label>
              <InputMonto
                id="monto_desde"
                value={montoDesde}
                onValueChange={setMontoDesde}
                disabled={dis}
                maxDecimals={0}
                className="font-mono"
                autoFocus={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monto_hasta">Monto Hasta</Label>
              <InputMonto
                id="monto_hasta"
                value={montoHasta}
                onValueChange={setMontoHasta}
                disabled={dis}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="porcentaje">Porcentaje</Label>
              <Input
                id="porcentaje"
                type="number"
                step="any"
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                disabled={dis}
                required={!isView}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_desde">Fecha Desde</Label>
              <Input
                id="fecha_desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                disabled={dis}
                required={!isView}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Venta X</Label>
              <Input
                value={
                  isView && item ? fmtNum(item.venta_x) : ventaX == null ? "" : fmtNum(ventaX)
                }
                disabled
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Rentabilidad 70%</Label>
              <Input
                value={
                  isView && item
                    ? `${fmtNum(item.rentabilidad_70)}%`
                    : rentabilidad70 == null
                      ? ""
                      : `${fmtNum(rentabilidad70)}%`
                }
                disabled
                className="font-mono"
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
