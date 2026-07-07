import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Wallet } from "lucide-react";
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
import { InputMonto } from "@/components/ui/input-monto";
import {
  listarRendiciones,
  crearRendicion,
  actualizarRendicion,
  eliminarRendicion,
  obtenerSugeridosRendicion,
  type RendicionCaja,
  type RendicionCajaInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const hoy = () => new Date().toISOString().slice(0, 10);

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: RendicionCaja }
  | { mode: "view"; item: RendicionCaja };

const COLUMNAS: Column<RendicionCaja>[] = [
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => fmtFecha(r.fecha),
    footer: () => "Total",
  },
  {
    key: "total_caja_anterior",
    header: "Caja Anterior",
    num: true,
    accessor: (r) => r.total_caja_anterior,
    render: (r) => <span className="font-mono">{fmtNum(r.total_caja_anterior)}</span>,
  },
  {
    key: "total_venta",
    header: "Venta",
    num: true,
    accessor: (r) => r.total_venta,
    render: (r) => <span className="font-mono">{fmtNum(r.total_venta)}</span>,
    footer: (rows) => (
      <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total_venta ?? 0), 0))}</span>
    ),
  },
  {
    key: "total_pago",
    header: "Pago",
    num: true,
    accessor: (r) => r.total_pago ?? 0,
    render: (r) => <span className="font-mono">{fmtNum(r.total_pago)}</span>,
    footer: (rows) => (
      <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total_pago ?? 0), 0))}</span>
    ),
  },
  {
    key: "total_retiro",
    header: "Retiro",
    num: true,
    accessor: (r) => r.total_retiro,
    render: (r) => <span className="font-mono">{fmtNum(r.total_retiro)}</span>,
    footer: (rows) => (
      <span className="font-mono">
        {fmtNum(rows.reduce((a, r) => a + (r.total_retiro ?? 0), 0))}
      </span>
    ),
  },
  {
    key: "total_caja",
    header: "Total Caja",
    num: true,
    accessor: (r) => r.total_caja,
    render: (r) => <span className="font-mono font-semibold">{fmtNum(r.total_caja)}</span>,
    hideable: false,
  },
  {
    key: "observacion",
    header: "Observación",
    accessor: (r) => r.observacion ?? "",
    render: (r) => r.observacion || "—",
  },
];

export function RendicionesCajasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<RendicionCaja | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["rendiciones", COD_EMPRESA],
    queryFn: () => listarRendiciones(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarRendicion(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rendiciones"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Rendición de Caja</h2>
          <p className="text-sm text-muted-foreground">Cierres de caja por fecha</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva rendición</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      <div className="p-4 sm:p-5">
        {isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar las rendiciones"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Wallet className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Sin rendiciones registradas</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea la primera con el botón “Nueva rendición”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_cierre}
            exportName="rendiciones-caja"
            initialSort={{ key: "fecha", dir: "desc" }}
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

      <RendicionDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["rendiciones"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rendición?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la rendición del{" "}
              <span className="font-semibold">{aEliminar && fmtFecha(aEliminar.fecha)}</span>. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_cierre);
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

function RendicionDialog({
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
  const isCreate = state.mode === "create";
  const item = state.mode === "edit" || state.mode === "view" ? state.item : null;

  const [fecha, setFecha] = useState(hoy());
  const [cajaAnterior, setCajaAnterior] = useState<number | null>(null);
  const [venta, setVenta] = useState<number | null>(null);
  const [retiro, setRetiro] = useState<number | null>(null);
  const [pago, setPago] = useState<number | null>(null);
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cargandoSug, setCargandoSug] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_cierre ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setFecha(item?.fecha ?? hoy());
    setCajaAnterior(item?.total_caja_anterior ?? null);
    setVenta(item?.total_venta ?? null);
    setRetiro(item?.total_retiro ?? null);
    setPago(item?.total_pago ?? null);
    setObservacion(item?.observacion ?? "");
    setError("");
    // Al abrir en modo crear, precargar los sugeridos de la fecha de hoy.
    if (state.mode === "create") void cargarSugeridos(hoy());
  }

  // Total Caja = caja_anterior + venta - retiro - pago (igual que el APEX).
  const totalCaja = (cajaAnterior ?? 0) + (venta ?? 0) - (retiro ?? 0) - (pago ?? 0);

  async function cargarSugeridos(f: string) {
    if (!f) return;
    setCargandoSug(true);
    try {
      const s = await obtenerSugeridosRendicion(COD_EMPRESA, f);
      setCajaAnterior(s.total_caja_anterior);
      setVenta(s.total_venta);
      setPago(s.total_pago);
    } catch {
      // si falla el auto-cálculo se deja lo que haya; el usuario puede corregir
    } finally {
      setCargandoSug(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) return setError("Indica la fecha");

    setSaving(true);
    try {
      const input: RendicionCajaInput = {
        cod_empresa: COD_EMPRESA,
        fecha,
        total_caja_anterior: cajaAnterior ?? 0,
        total_venta: venta ?? 0,
        total_retiro: retiro ?? 0,
        total_caja: totalCaja,
        total_pago: pago,
        observacion: observacion.trim() || null,
      };
      if (state.mode === "edit") {
        await actualizarRendicion(state.item.id_cierre, input);
      } else {
        await crearRendicion(input);
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
      ? "Nueva rendición"
      : state.mode === "edit"
        ? "Editar rendición"
        : "Detalle de rendición";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Al elegir la fecha se calculan caja anterior, venta y pago; podés ajustarlos.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  if (isCreate) void cargarSugeridos(e.target.value);
                }}
                disabled={isView || saving}
                required={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="caja_anterior">
                Total Caja Anterior
                {cargandoSug && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
              </Label>
              <InputMonto
                id="caja_anterior"
                value={cajaAnterior}
                onValueChange={setCajaAnterior}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="venta">Total Venta</Label>
              <InputMonto
                id="venta"
                value={venta}
                onValueChange={setVenta}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pago">Total Pago</Label>
              <InputMonto
                id="pago"
                value={pago}
                onValueChange={setPago}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="retiro">Total Retiro</Label>
              <InputMonto
                id="retiro"
                value={retiro}
                onValueChange={setRetiro}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Total Caja</Label>
              <Input
                value={fmtNum(isView && item ? item.total_caja : totalCaja)}
                disabled
                className="font-mono font-semibold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacion">Observación</Label>
            <textarea
              id="observacion"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              disabled={isView || saving}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
