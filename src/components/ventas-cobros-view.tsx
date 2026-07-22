import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, HandCoins } from "lucide-react";
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
  listarVentasCobros,
  crearVentaCobro,
  actualizarVentaCobro,
  eliminarVentaCobro,
  buscarVentas,
  listarFormasCobroPago,
  listarBancos,
  listarMonedas,
  type VentaCobro,
  type VentaCobroInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtMonto = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function labelFactura(v: {
  id_factura: number;
  nro_comprobante: number | null;
  ser_timbrado: string | null;
  nombre_cliente: string | null;
}): string {
  const comp = v.ser_timbrado
    ? `${v.ser_timbrado}-${v.nro_comprobante ?? ""}`
    : `${v.nro_comprobante ?? ""}`;
  const partes = [`Factura ${v.id_factura}`];
  if (comp.trim() && comp.trim() !== "-") partes.push(comp);
  if (v.nombre_cliente) partes.push(v.nombre_cliente);
  return partes.join(" · ");
}

export type VentaCobroModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: VentaCobro }
  | { mode: "view"; item: VentaCobro };

type ModalState = VentaCobroModalState;

const COLUMNAS: Column<VentaCobro>[] = [
  {
    key: "id_cobro",
    header: "ID",
    num: true,
    accessor: (r) => r.id_cobro,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_cobro}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => fmtFecha(r.fecha),
    footer: () => "Total",
  },
  {
    key: "factura",
    header: "Factura",
    accessor: (r) => `${r.id_factura} ${r.nombre_cliente ?? ""}`,
    render: (r) => (
      <div className="flex flex-col">
        <span className="font-mono text-xs text-muted-foreground">Factura {r.id_factura}</span>
        <span>{r.nombre_cliente ?? "—"}</span>
      </div>
    ),
    hideable: false,
  },
  {
    key: "descripcion_forma",
    header: "Forma",
    accessor: (r) => r.descripcion_forma ?? "",
  },
  {
    key: "nombre_banco",
    header: "Banco",
    accessor: (r) => r.nombre_banco ?? "",
    render: (r) => r.nombre_banco || "—",
  },
  {
    key: "nro_transaccion",
    header: "Nro transacción",
    accessor: (r) => r.nro_transaccion ?? "",
    render: (r) => r.nro_transaccion || "—",
  },
  {
    key: "descripcion_moneda",
    header: "Moneda",
    accessor: (r) => r.descripcion_moneda ?? "",
    render: (r) => r.descripcion_moneda || "—",
  },
  {
    key: "total",
    header: "Total",
    num: true,
    accessor: (r) => r.total,
    render: (r) => <span className="font-mono font-semibold">{fmtMonto(r.total)}</span>,
    footer: (rows) => (
      <span className="font-mono">{fmtMonto(rows.reduce((a, r) => a + (r.total ?? 0), 0))}</span>
    ),
  },
];

export function VentasCobrosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<VentaCobro | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ventas-cobros", COD_EMPRESA],
    queryFn: () => listarVentasCobros(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarVentaCobro(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ventas-cobros"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Cobros de Ventas</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "cobro registrado" : "cobros registrados"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo cobro</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los cobros"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <HandCoins className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay cobros de ventas</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Registra el primero con el botón “Nuevo cobro”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_cobro}
            initialSort={{ key: "id_cobro", dir: "desc" }}
            exportName="ventas-cobros"
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

      <VentaCobroDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["ventas-cobros"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cobro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el cobro de la factura{" "}
              <span className="font-semibold">{aEliminar?.id_factura}</span> por{" "}
              <span className="font-semibold">{fmtMonto(aEliminar?.total ?? null)}</span>. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_cobro);
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
// Reutilizado desde la vista de Ventas (pág 60): facturaFija bloquea la factura.

export function VentaCobroDialog({
  state,
  onClose,
  onSaved,
  facturaFija,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
  facturaFija?: { id: number; label: string };
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
  const { data: bancos } = useQuery({
    queryKey: ["bancos"],
    queryFn: listarBancos,
    enabled: open && !isView,
    retry: false,
  });
  const { data: monedas } = useQuery({
    queryKey: ["monedas"],
    queryFn: listarMonedas,
    enabled: open && !isView,
    retry: false,
  });

  const [fecha, setFecha] = useState("");
  const [idFactura, setIdFactura] = useState<number | null>(null);
  const [facturaLabel, setFacturaLabel] = useState("");
  const [idForma, setIdForma] = useState<number | null>(null);
  const [idBanco, setIdBanco] = useState<number | null>(null);
  const [nroTransaccion, setNroTransaccion] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [codMoneda, setCodMoneda] = useState<number | null>(null);
  const [efectivoRecibido, setEfectivoRecibido] = useState<number | null>(null);
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_cobro ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setFecha(item?.fecha ?? "");
    setIdFactura(item?.id_factura ?? facturaFija?.id ?? null);
    setFacturaLabel(item ? labelFactura(item) : (facturaFija?.label ?? ""));
    setIdForma(item?.id_forma ?? null);
    setIdBanco(item?.id_banco ?? null);
    setNroTransaccion(item?.nro_transaccion ?? "");
    setTotal(item?.total ?? null);
    setCodMoneda(item?.cod_moneda ?? 1); // Gs por defecto
    setEfectivoRecibido(item?.efectivo_recibido ?? null);
    setObservacion(item?.observacion ?? "");
    setError("");
  }

  // Vuelto = efectivo recibido - total (si el recibido supera al total).
  const vuelto =
    efectivoRecibido != null && total != null ? Math.max(efectivoRecibido - total, 0) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) return setError("Indica la fecha");
    if (!idFactura) return setError("Selecciona una factura");
    if (!idForma) return setError("Selecciona una forma de cobro");
    if (total == null) return setError("Indica el total");
    if (codMoneda == null) return setError("Selecciona la moneda");

    setSaving(true);
    try {
      const input: VentaCobroInput = {
        fecha,
        id_factura: idFactura,
        id_forma: idForma,
        id_banco: idBanco,
        nro_transaccion: nroTransaccion.trim() || null,
        observacion: observacion.trim() || null,
        total,
        cod_moneda: codMoneda,
        efectivo_recibido: efectivoRecibido,
        efectivo_vuelto: vuelto,
      };
      if (state.mode === "edit") {
        await actualizarVentaCobro(state.item.id_cobro, input);
      } else {
        await crearVentaCobro(input);
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
      ? "Nuevo cobro de venta"
      : state.mode === "edit"
        ? "Editar cobro"
        : "Detalle del cobro";

  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Registra el cobro de una factura de venta.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Factura</Label>
            {isView || facturaFija ? (
              <Input value={facturaLabel} disabled />
            ) : (
              <BuscadorSelect
                placeholder="Buscar factura por ID, comprobante o cliente..."
                emptyLabel="Sin facturas"
                value={idFactura}
                label={facturaLabel}
                buscar={(q) => buscarVentas(COD_EMPRESA, q)}
                itemKey={(v) => v.id_factura}
                itemTitle={(v) => v.nombre_cliente ?? `Factura ${v.id_factura}`}
                itemSub={(v) =>
                  `Factura ${v.id_factura}${
                    v.nro_comprobante ? ` · Comp. ${v.ser_timbrado ?? ""}-${v.nro_comprobante}` : ""
                  }`
                }
                onSelect={(v) => {
                  setIdFactura(v.id_factura);
                  setFacturaLabel(labelFactura(v));
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
              <Label htmlFor="id_forma">Forma de cobro</Label>
              {isView ? (
                <Input value={item?.descripcion_forma ?? ""} disabled />
              ) : (
                <select
                  id="id_forma"
                  value={idForma ?? ""}
                  onChange={(e) => setIdForma(e.target.value ? Number(e.target.value) : null)}
                  disabled={saving}
                  required
                  className={selectCls}
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="id_banco">Banco</Label>
              {isView ? (
                <Input value={item?.nombre_banco ?? "—"} disabled />
              ) : (
                <select
                  id="id_banco"
                  value={idBanco ?? ""}
                  onChange={(e) => setIdBanco(e.target.value ? Number(e.target.value) : null)}
                  disabled={saving}
                  className={selectCls}
                >
                  <option value="">Sin banco</option>
                  {(bancos ?? []).map((b) => (
                    <option key={b.id_banco} value={b.id_banco}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_transaccion">Nro transacción</Label>
              <Input
                id="nro_transaccion"
                value={nroTransaccion}
                onChange={(e) => setNroTransaccion(e.target.value)}
                placeholder="Opcional"
                disabled={isView || saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cod_moneda">Moneda</Label>
              {isView ? (
                <Input value={item?.descripcion_moneda ?? ""} disabled />
              ) : (
                <select
                  id="cod_moneda"
                  value={codMoneda ?? ""}
                  onChange={(e) => setCodMoneda(e.target.value ? Number(e.target.value) : null)}
                  disabled={saving}
                  required
                  className={selectCls}
                >
                  <option value="">Seleccionar...</option>
                  {(monedas ?? []).map((m) => (
                    <option key={m.cod_moneda} value={m.cod_moneda}>
                      {m.descripcion}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="total">Total</Label>
              <InputMonto
                id="total"
                value={total}
                onValueChange={setTotal}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="efectivo_recibido">Efectivo recibido</Label>
              <InputMonto
                id="efectivo_recibido"
                value={efectivoRecibido}
                onValueChange={setEfectivoRecibido}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Vuelto</Label>
              <Input
                value={fmtMonto(isView && item ? item.efectivo_vuelto : vuelto)}
                disabled
                className="font-mono font-semibold"
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
