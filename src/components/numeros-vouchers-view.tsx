import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { BuscadorSelect } from "@/components/ui/buscador-select";
import { InputMonto } from "@/components/ui/input-monto";
import {
  listarNumerosVouchers,
  crearNumeroVoucher,
  actualizarNumeroVoucher,
  eliminarNumeroVoucher,
  buscarPersonas,
  type NumeroVoucher,
  type NumeroVoucherInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-PY")}%`);
const fmtFecha = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: NumeroVoucher }
  | { mode: "view"; item: NumeroVoucher };

const COLUMNAS: Column<NumeroVoucher>[] = [
  {
    key: "id_voucher",
    header: "ID",
    num: true,
    accessor: (r) => r.id_voucher,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_voucher}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "nombre_persona",
    header: "Persona",
    accessor: (r) => r.nombre_persona ?? "",
    hideable: false,
  },
  {
    key: "numero_desde",
    header: "Desde",
    num: true,
    accessor: (r) => r.numero_desde,
    render: (r) => <span className="font-mono">{fmtNum(r.numero_desde)}</span>,
  },
  {
    key: "numero_hasta",
    header: "Hasta",
    num: true,
    accessor: (r) => r.numero_hasta,
    render: (r) => <span className="font-mono">{fmtNum(r.numero_hasta)}</span>,
  },
  {
    key: "porcentaje_descuento",
    header: "% Descuento",
    num: true,
    accessor: (r) => r.porcentaje_descuento,
    render: (r) => fmtPct(r.porcentaje_descuento),
  },
  {
    key: "fecha_vencimiento",
    header: "Vencimiento",
    accessor: (r) => r.fecha_vencimiento ?? "",
    render: (r) => fmtFecha(r.fecha_vencimiento),
  },
];

export function NumerosVouchersView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<NumeroVoucher | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["numeros-vouchers", COD_EMPRESA],
    queryFn: () => listarNumerosVouchers(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarNumeroVoucher(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["numeros-vouchers"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_voucher - a.id_voucher);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Números de Vouchers</h2>
          <p className="text-sm text-muted-foreground">Rangos de vouchers por persona</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo voucher</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los vouchers"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Ticket className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay vouchers</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Crea el primero con el botón “Nuevo voucher”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_voucher}
            initialSort={{ key: "id_voucher", dir: "desc" }}
            exportName="numeros-vouchers"
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
        </div>
      )}

      <VoucherDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["numeros-vouchers"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el rango{" "}
              <span className="font-semibold">
                {aEliminar && `${fmtNum(aEliminar.numero_desde)}–${fmtNum(aEliminar.numero_hasta)}`}
              </span>{" "}
              de <span className="font-semibold">{aEliminar?.nombre_persona}</span>. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_voucher);
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

function VoucherDialog({
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

  const [idPersona, setIdPersona] = useState<number | null>(null);
  const [personaLabel, setPersonaLabel] = useState("");
  const [numeroDesde, setNumeroDesde] = useState<number | null>(null);
  const [numeroHasta, setNumeroHasta] = useState<number | null>(null);
  const [fechaVenc, setFechaVenc] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_voucher ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setIdPersona(item?.id_persona ?? null);
    setPersonaLabel(item?.nombre_persona ?? "");
    setNumeroDesde(item?.numero_desde ?? null);
    setNumeroHasta(item?.numero_hasta ?? null);
    setFechaVenc(item?.fecha_vencimiento ?? "");
    setPorcentaje(item?.porcentaje_descuento != null ? String(item.porcentaje_descuento) : "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idPersona) return setError("Selecciona una persona");
    if (numeroDesde == null) return setError("Indica el número desde");
    if (numeroHasta == null) return setError("Indica el número hasta");
    if (numeroHasta < numeroDesde) return setError("El número hasta no puede ser menor al desde");
    if (!fechaVenc) return setError("Indica la fecha de vencimiento");

    setSaving(true);
    try {
      const input: NumeroVoucherInput = {
        id_persona: idPersona,
        numero_desde: numeroDesde,
        numero_hasta: numeroHasta,
        fecha_vencimiento: fechaVenc,
        porcentaje_descuento: porcentaje.trim() === "" ? null : Number(porcentaje),
      };
      if (state.mode === "edit") {
        await actualizarNumeroVoucher(state.item.id_voucher, input);
      } else {
        await crearNumeroVoucher(input);
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
      ? "Nuevo voucher"
      : state.mode === "edit"
        ? "Editar voucher"
        : "Detalle del voucher";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Asigna un rango de vouchers a una persona.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_voucher}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Persona</Label>
            {isView ? (
              <Input value={personaLabel} disabled />
            ) : (
              <BuscadorSelect
                placeholder="Buscar persona por nombre, RUC o CI..."
                emptyLabel="Sin personas"
                value={idPersona}
                label={personaLabel}
                buscar={(q) => buscarPersonas(COD_EMPRESA, q)}
                itemKey={(p) => p.cod_persona}
                itemTitle={(p) => p.nombre ?? "—"}
                itemSub={(p) =>
                  `ID ${p.cod_persona}${p.nro_ruc ? ` · RUC ${p.nro_ruc}` : p.nro_ci ? ` · CI ${p.nro_ci}` : ""}`
                }
                onSelect={(p) => {
                  setIdPersona(p.cod_persona);
                  setPersonaLabel(p.nombre ?? "");
                }}
                disabled={saving}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="numero_desde">Número Desde</Label>
              <InputMonto
                id="numero_desde"
                value={numeroDesde}
                onValueChange={setNumeroDesde}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numero_hasta">Número Hasta</Label>
              <InputMonto
                id="numero_hasta"
                value={numeroHasta}
                onValueChange={setNumeroHasta}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fecha_venc">Vencimiento</Label>
              <Input
                id="fecha_venc"
                type="date"
                value={fechaVenc}
                onChange={(e) => setFechaVenc(e.target.value)}
                disabled={isView || saving}
                required={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="porcentaje">% Descuento</Label>
              <Input
                id="porcentaje"
                type="number"
                step="0.01"
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                placeholder="0"
                disabled={isView || saving}
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
