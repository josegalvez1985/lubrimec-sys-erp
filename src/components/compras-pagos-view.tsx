import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Receipt } from "lucide-react";
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
  listarComprasPagos,
  crearCompraPago,
  actualizarCompraPago,
  eliminarCompraPago,
  buscarCompras,
  listarFormasCobroPago,
  type CompraPago,
  type CompraPagoInput,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

const fmtMonto = (n: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

function labelFactura(c: {
  id_factura: number;
  nro_comprobante: number | null;
  ser_timbrado: string | null;
  nombre_proveedor: string | null;
}): string {
  const comp = c.ser_timbrado
    ? `${c.ser_timbrado}-${c.nro_comprobante ?? ""}`
    : `${c.nro_comprobante ?? ""}`;
  const partes = [`Factura ${c.id_factura}`];
  if (comp.trim() && comp.trim() !== "-") partes.push(comp);
  if (c.nombre_proveedor) partes.push(c.nombre_proveedor);
  return partes.join(" · ");
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: CompraPago }
  | { mode: "view"; item: CompraPago };

export function ComprasPagosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<CompraPago | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["compras-pagos", COD_EMPRESA],
    queryFn: () => listarComprasPagos(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarCompraPago(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras-pagos"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_pago - a.id_pago);

  const COLUMNAS: Column<CompraPago>[] = [
    {
      key: "id_pago",
      header: "ID",
      num: true,
      accessor: (r) => r.id_pago,
      render: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.id_pago}
        </Badge>
      ),
      className: "w-16",
    },
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha ?? "",
    },
    {
      key: "nro_recibo",
      header: "Recibo",
      num: true,
      accessor: (r) => r.nro_recibo,
      render: (r) => <span className="font-mono">{r.nro_recibo}</span>,
    },
    {
      key: "factura",
      header: "Factura",
      accessor: (r) => `${r.id_factura} ${r.nombre_proveedor ?? ""}`,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">Factura {r.id_factura}</span>
          <span>{r.nombre_proveedor ?? "—"}</span>
        </div>
      ),
      hideable: false,
    },
    {
      key: "descripcion_forma",
      header: "Forma de pago",
      accessor: (r) => r.descripcion_forma ?? "",
    },
    {
      key: "monto",
      header: "Monto",
      num: true,
      accessor: (r) => r.monto,
      render: (r) => <span className="font-mono">{fmtMonto(r.monto)}</span>,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Pagos de compras</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "pago registrado" : "pagos registrados"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo pago</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los pagos"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay pagos de compras</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Registra el primero con el botón “Nuevo pago”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_pago}
            initialSort={{ key: "id_pago", dir: "desc" }}
            exportName="compras-pagos"
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

      <CompraPagoDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["compras-pagos"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el pago{" "}
              <span className="font-semibold">recibo {aEliminar?.nro_recibo}</span> de la factura{" "}
              <span className="font-semibold">{aEliminar?.id_factura}</span>. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_pago);
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

function CompraPagoDialog({
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

  const { data: formas } = useQuery({
    queryKey: ["formas-cobro-pago"],
    queryFn: listarFormasCobroPago,
    enabled: open && !isView,
    retry: false,
  });

  const [fecha, setFecha] = useState("");
  const [idFactura, setIdFactura] = useState<number | null>(null);
  const [facturaLabel, setFacturaLabel] = useState("");
  const [idForma, setIdForma] = useState<number | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [nroRecibo, setNroRecibo] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_pago ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setFecha(item?.fecha ?? "");
    setIdFactura(item?.id_factura ?? null);
    setFacturaLabel(item ? labelFactura(item) : "");
    setIdForma(item?.id_forma ?? null);
    setMonto(item ? item.monto : null);
    setNroRecibo(item ? String(item.nro_recibo) : "");
    setObservacion(item?.observacion ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) return setError("Indica la fecha");
    if (!idFactura) return setError("Selecciona una factura");
    if (!idForma) return setError("Selecciona una forma de pago");
    if (monto == null) return setError("Indica un monto válido");
    const reciboNum = Number(nroRecibo);
    if (!nroRecibo || Number.isNaN(reciboNum)) return setError("Indica el nro de recibo");

    setSaving(true);
    try {
      const input: CompraPagoInput = {
        fecha,
        id_factura: idFactura,
        id_forma: idForma,
        monto,
        observacion: observacion.trim() || null,
        nro_recibo: reciboNum,
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarCompraPago(state.item.id_pago, input);
      } else {
        await crearCompraPago(input);
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
      ? "Nuevo pago de compra"
      : state.mode === "edit"
        ? "Editar pago"
        : "Detalle del pago";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Registra el pago de una factura de compra.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_pago}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Factura</Label>
            {isView ? (
              <Input value={facturaLabel} disabled />
            ) : (
              <BuscadorSelect
                placeholder="Buscar factura por ID, comprobante o proveedor..."
                emptyLabel="Sin facturas"
                value={idFactura}
                label={facturaLabel}
                buscar={(q) => buscarCompras(COD_EMPRESA, q)}
                itemKey={(c) => c.id_factura}
                itemTitle={(c) => c.nombre_proveedor ?? `Factura ${c.id_factura}`}
                itemSub={(c) =>
                  `Factura ${c.id_factura}${
                    c.nro_comprobante ? ` · Comp. ${c.ser_timbrado ?? ""}-${c.nro_comprobante}` : ""
                  }`
                }
                onSelect={(c) => {
                  setIdFactura(c.id_factura);
                  setFacturaLabel(labelFactura(c));
                }}
                disabled={saving}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={isView || saving}
                required={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_recibo">Nro recibo</Label>
              <Input
                id="nro_recibo"
                type="number"
                value={nroRecibo}
                onChange={(e) => setNroRecibo(e.target.value)}
                disabled={isView || saving}
                required={!isView}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="id_forma">Forma de pago</Label>
              {isView ? (
                <Input value={item?.descripcion_forma ?? ""} disabled />
              ) : (
                <select
                  id="id_forma"
                  value={idForma ?? ""}
                  onChange={(e) => setIdForma(e.target.value ? Number(e.target.value) : null)}
                  disabled={saving}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Seleccionar...</option>
                  {(formas ?? []).map((f) => (
                    <option key={f.id_forma} value={f.id_forma}>
                      {f.descripcion}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="monto">Monto</Label>
              <InputMonto
                id="monto"
                value={monto}
                onValueChange={setMonto}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacion">Observación</Label>
            <Input
              id="observacion"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Opcional"
              disabled={isView || saving}
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
