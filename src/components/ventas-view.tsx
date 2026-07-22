import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  Loader2,
  ShoppingCart,
  X,
  ListOrdered,
  HandCoins,
  Plus,
} from "lucide-react";
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
  VentaCobroDialog,
  type VentaCobroModalState,
} from "@/components/ventas-cobros-view";
import {
  listarVentas,
  actualizarVenta,
  eliminarVenta,
  listarVentaDetalle,
  guardarVentaDetalle,
  eliminarVentaDetalle,
  listarVentasCobros,
  eliminarVentaCobro,
  listarVendedores,
  buscarPersonas,
  buscarArticulos,
  type VentaCabecera,
  type VentaCabeceraInput,
  type VentaDetalleLinea,
  type VentaCobro,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

type ModalState =
  | { mode: "closed" }
  | { mode: "edit"; item: VentaCabecera }
  | { mode: "detalle"; item: VentaCabecera }
  | { mode: "cobros"; item: VentaCabecera };

const COLUMNAS: Column<VentaCabecera>[] = [
  {
    key: "id_factura",
    header: "ID",
    num: true,
    accessor: (r) => r.id_factura,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_factura}
      </Badge>
    ),
    className: "w-20",
    hideable: false,
  },
  {
    key: "tip_comprobante",
    header: "Tipo",
    accessor: (r) => r.tip_comprobante ?? "",
  },
  {
    key: "comprobante",
    header: "Comprobante",
    accessor: (r) => `${r.ser_timbrado ?? ""}-${r.nro_comprobante ?? ""}`,
    render: (r) => (
      <span className="font-mono">
        {r.ser_timbrado ? `${r.ser_timbrado}-${r.nro_comprobante}` : r.nro_comprobante}
      </span>
    ),
  },
  {
    key: "fec_comprobante",
    header: "Fecha",
    accessor: (r) => r.fec_comprobante ?? "",
    render: (r) => fmtFecha(r.fec_comprobante),
  },
  {
    key: "nombre_cliente",
    header: "Cliente",
    accessor: (r) => r.nombre_cliente ?? "",
    render: (r) => r.nombre_cliente || "—",
  },
  {
    key: "nombre_vendedor",
    header: "Vendedor",
    accessor: (r) => r.nombre_vendedor ?? "",
    render: (r) => r.nombre_vendedor || "—",
  },
  {
    key: "nro_telefono",
    header: "Teléfono",
    accessor: (r) => r.nro_telefono ?? "",
    render: (r) => r.nro_telefono || "—",
  },
];

export function VentasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<VentaCabecera | null>(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ventas", COD_EMPRESA, fechaDesde, fechaHasta],
    queryFn: () => listarVentas(COD_EMPRESA, fechaDesde || undefined, fechaHasta || undefined),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarVenta(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ventas"] });
      setAEliminar(null);
    },
  });

  const filas = data?.data ?? [];
  const hayFiltros = !!fechaDesde || !!fechaHasta;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Ventas</h2>
          <p className="text-sm text-muted-foreground">
            {data?.fecha_default
              ? `Mostrando el último día con ventas (${fmtFecha(data.fecha_default)})`
              : `${filas.length} ${filas.length === 1 ? "venta" : "ventas"} en el rango`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 sm:px-5">
        <div className="space-y-1">
          <Label htmlFor="fecha_desde" className="text-xs">
            Desde
          </Label>
          <Input
            id="fecha_desde"
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fecha_hasta" className="text-xs">
            Hasta
          </Label>
          <Input
            id="fecha_hasta"
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="w-44"
          />
        </div>
        {hayFiltros && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFechaDesde("");
              setFechaHasta("");
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar las ventas"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Sin ventas en el rango</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Ajusta las fechas para ver otras ventas.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_factura}
            initialSort={{ key: "id_factura", dir: "desc" }}
            exportName="ventas"
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "detalle", item: r })}
                  aria-label="Artículos"
                  title="Artículos"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "cobros", item: r })}
                  aria-label="Cobros"
                  title="Cobros"
                >
                  <HandCoins className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", item: r })}
                  aria-label="Editar"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(r)}
                  aria-label="Eliminar"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <VentaEditDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["ventas"] });
          setModal({ mode: "closed" });
        }}
      />
      <DetalleDialog state={modal} onClose={() => setModal({ mode: "closed" })} />
      <CobrosDialog state={modal} onClose={() => setModal({ mode: "closed" })} />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la factura{" "}
              <span className="font-semibold">{aEliminar?.id_factura}</span>
              {aEliminar?.nombre_cliente && (
                <>
                  {" "}
                  de <span className="font-semibold">{aEliminar.nombre_cliente}</span>
                </>
              )}{" "}
              y sus cobros asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_factura);
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

// ─── Dialog de edición (solo update; las ventas se crean en otro sistema) ────

function VentaEditDialog({
  state,
  onClose,
  onSaved,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode === "edit";
  const item = open ? state.item : null;

  const { data: vendedores } = useQuery({
    queryKey: ["vendedores", COD_EMPRESA],
    queryFn: () => listarVendedores(COD_EMPRESA),
    enabled: open,
    retry: false,
  });

  const [tipComprobante, setTipComprobante] = useState("");
  const [nroComprobante, setNroComprobante] = useState("");
  const [fecha, setFecha] = useState("");
  const [codPersona, setCodPersona] = useState<number | null>(null);
  const [clienteLabel, setClienteLabel] = useState("");
  const [codVendedor, setCodVendedor] = useState<number | null>(null);
  const [nroTelefono, setNroTelefono] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_factura ?? "none"}`;
  if (open && item && key !== lastKey) {
    setLastKey(key);
    setTipComprobante(item.tip_comprobante ?? "");
    setNroComprobante(String(item.nro_comprobante ?? ""));
    setFecha(item.fec_comprobante ?? "");
    setCodPersona(item.cod_persona);
    setClienteLabel(item.nombre_cliente ?? `Cliente ${item.cod_persona}`);
    setCodVendedor(item.cod_vendedor);
    setNroTelefono(item.nro_telefono ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError("");
    if (!tipComprobante.trim()) return setError("Indica el tipo de comprobante");
    const nroNum = Number(nroComprobante);
    if (!nroComprobante || Number.isNaN(nroNum)) return setError("Indica el nro de comprobante");
    if (!fecha) return setError("Indica la fecha");
    if (!codPersona) return setError("Selecciona el cliente");
    if (!codVendedor) return setError("Selecciona el vendedor");

    setSaving(true);
    try {
      const input: VentaCabeceraInput = {
        cod_empresa: COD_EMPRESA,
        tip_comprobante: tipComprobante.trim(),
        nro_comprobante: nroNum,
        fec_comprobante: fecha,
        cod_persona: codPersona,
        cod_vendedor: codVendedor,
        nro_telefono: nroTelefono.trim() || null,
      };
      await actualizarVenta(item.id_factura, input);
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
          <DialogTitle>Editar venta {item?.id_factura}</DialogTitle>
          <DialogDescription>
            Comprobante {item?.ser_timbrado} · Timbrado {item?.nro_timbrado}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tip_comprobante">Tipo</Label>
              <Input
                id="tip_comprobante"
                value={tipComprobante}
                onChange={(e) => setTipComprobante(e.target.value.toUpperCase())}
                maxLength={3}
                disabled={saving}
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_comprobante">Nro comprobante</Label>
              <Input
                id="nro_comprobante"
                type="number"
                value={nroComprobante}
                onChange={(e) => setNroComprobante(e.target.value)}
                disabled={saving}
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fec_comprobante">Fecha</Label>
              <Input
                id="fec_comprobante"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={saving}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            <BuscadorSelect
              placeholder="Buscar cliente por nombre, RUC o CI..."
              emptyLabel="Sin clientes"
              value={codPersona}
              label={clienteLabel}
              buscar={(q) => buscarPersonas(COD_EMPRESA, q)}
              itemKey={(p) => p.cod_persona}
              itemTitle={(p) => p.nombre ?? `Persona ${p.cod_persona}`}
              itemSub={(p) => [p.nro_ruc, p.nro_ci].filter(Boolean).join(" · ") || "—"}
              onSelect={(p) => {
                setCodPersona(p.cod_persona);
                setClienteLabel(p.nombre ?? `Persona ${p.cod_persona}`);
              }}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cod_vendedor">Vendedor</Label>
              <select
                id="cod_vendedor"
                value={codVendedor ?? ""}
                onChange={(e) => setCodVendedor(e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccionar...</option>
                {(vendedores ?? []).map((v) => (
                  <option key={v.cod_vendedor} value={v.cod_vendedor}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_telefono">Nro teléfono</Label>
              <Input
                id="nro_telefono"
                value={nroTelefono}
                onChange={(e) => setNroTelefono(e.target.value)}
                placeholder="Opcional"
                disabled={saving}
              />
            </div>
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
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog artículos de la factura (pág 109) ────────────────────────────────

type LineaModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; linea: VentaDetalleLinea };

function DetalleDialog({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const qc = useQueryClient();
  const open = state.mode === "detalle";
  const item = open ? state.item : null;

  const [lineaModal, setLineaModal] = useState<LineaModalState>({ mode: "closed" });
  const [aEliminarLinea, setAEliminarLinea] = useState<VentaDetalleLinea | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["venta-detalle", item?.id_factura],
    queryFn: () => listarVentaDetalle(item!.id_factura),
    enabled: open && item != null,
    retry: false,
  });

  const eliminarLineaMut = useMutation({
    mutationFn: (nroLinea: number) => eliminarVentaDetalle(item!.id_factura, nroLinea),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venta-detalle"] });
      setAEliminarLinea(null);
    },
  });

  const lineas = data ?? [];
  const total = lineas.reduce((a, l) => a + (l.total ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Artículos de la factura {item?.id_factura}</DialogTitle>
          <DialogDescription>{item?.nombre_cliente ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setLineaModal({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar artículo
          </Button>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            No se pudo cargar el detalle
          </p>
        ) : lineas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin artículos</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Artículo</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Desc.</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.nro_linea} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span>{l.descripcion_articulo ?? `Artículo ${l.id_articulo}`}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          #{l.id_articulo}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(l.cantidad)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(l.precio)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(l.descuento)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmtNum(l.total)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => setLineaModal({ mode: "edit", linea: l })}
                          aria-label="Editar línea"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setAEliminarLinea(l)}
                          aria-label="Eliminar línea"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-right font-mono">{fmtNum(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>

      {item && (
        <LineaDialog
          idFactura={item.id_factura}
          state={lineaModal}
          onClose={() => setLineaModal({ mode: "closed" })}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["venta-detalle"] });
            setLineaModal({ mode: "closed" });
          }}
        />
      )}

      <AlertDialog open={!!aEliminarLinea} onOpenChange={(o) => !o && setAEliminarLinea(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar línea?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará{" "}
              <span className="font-semibold">
                {aEliminarLinea?.descripcion_articulo ?? `el artículo ${aEliminarLinea?.id_articulo}`}
              </span>{" "}
              de la factura. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarLineaMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminarLinea) eliminarLineaMut.mutate(aEliminarLinea.nro_linea);
              }}
              disabled={eliminarLineaMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {eliminarLineaMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ─── Dialog de línea del detalle (alta/edición) ──────────────────────────────

function LineaDialog({
  idFactura,
  state,
  onClose,
  onSaved,
}: {
  idFactura: number;
  state: LineaModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode !== "closed";
  const linea = state.mode === "edit" ? state.linea : null;

  const [idArticulo, setIdArticulo] = useState<number | null>(null);
  const [articuloLabel, setArticuloLabel] = useState("");
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);
  const [descuento, setDescuento] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${linea?.nro_linea ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setIdArticulo(linea?.id_articulo ?? null);
    setArticuloLabel(
      linea ? (linea.descripcion_articulo ?? `Artículo ${linea.id_articulo}`) : "",
    );
    setCantidad(linea?.cantidad ?? null);
    setPrecio(linea?.precio ?? null);
    setDescuento(linea?.descuento ?? null);
    setError("");
  }

  const total = (cantidad ?? 0) * (precio ?? 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idArticulo) return setError("Selecciona el artículo");
    if (cantidad == null) return setError("Indica la cantidad");
    if (precio == null) return setError("Indica el precio");

    setSaving(true);
    try {
      await guardarVentaDetalle(idFactura, {
        nro_linea: linea?.nro_linea ?? null,
        id_articulo: idArticulo,
        cantidad,
        precio,
        descuento,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{linea ? "Editar artículo" : "Agregar artículo"}</DialogTitle>
          <DialogDescription>Factura {idFactura}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Artículo</Label>
            <BuscadorSelect
              placeholder="Buscar artículo por descripción, código o ID..."
              emptyLabel="Sin artículos"
              value={idArticulo}
              label={articuloLabel}
              buscar={(q) => buscarArticulos(COD_EMPRESA, q)}
              itemKey={(a) => a.id_articulo}
              itemTitle={(a) => a.descripcion ?? `Artículo ${a.id_articulo}`}
              itemSub={(a) =>
                `#${a.id_articulo}${a.codigo_oem ? ` · OEM ${a.codigo_oem}` : ""}`
              }
              onSelect={(a) => {
                setIdArticulo(a.id_articulo);
                setArticuloLabel(a.descripcion ?? `Artículo ${a.id_articulo}`);
              }}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="linea_cantidad">Cantidad</Label>
              <InputMonto
                id="linea_cantidad"
                value={cantidad}
                onValueChange={setCantidad}
                disabled={saving}
                maxDecimals={2}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linea_precio">Precio</Label>
              <InputMonto
                id="linea_precio"
                value={precio}
                onValueChange={setPrecio}
                disabled={saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="linea_descuento">Descuento</Label>
              <InputMonto
                id="linea_descuento"
                value={descuento}
                onValueChange={setDescuento}
                disabled={saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Total</Label>
              <Input value={fmtNum(total)} disabled className="font-mono font-semibold" />
            </div>
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
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog cobros de la factura (pág 110) ───────────────────────────────────
// Reutiliza el VentaCobroDialog de la pág 65 con la factura bloqueada.

function CobrosDialog({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const qc = useQueryClient();
  const open = state.mode === "cobros";
  const item = open ? state.item : null;

  const [cobroModal, setCobroModal] = useState<VentaCobroModalState>({ mode: "closed" });
  const [aEliminarCobro, setAEliminarCobro] = useState<VentaCobro | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ventas-cobros", COD_EMPRESA, item?.id_factura],
    queryFn: () => listarVentasCobros(COD_EMPRESA, item!.id_factura),
    enabled: open && item != null,
    retry: false,
  });

  const eliminarCobroMut = useMutation({
    mutationFn: (id: number) => eliminarVentaCobro(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ventas-cobros"] });
      setAEliminarCobro(null);
    },
  });

  const cobros = data ?? [];
  const total = cobros.reduce((a, c) => a + (c.total ?? 0), 0);

  const facturaLabel = item
    ? `Factura ${item.id_factura}${item.nombre_cliente ? ` · ${item.nombre_cliente}` : ""}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cobros de la factura {item?.id_factura}</DialogTitle>
          <DialogDescription>{item?.nombre_cliente ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCobroModal({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cobro
          </Button>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            No se pudieron cargar los cobros
          </p>
        ) : cobros.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin cobros registrados
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Forma</th>
                  <th className="px-3 py-2 font-medium">Banco</th>
                  <th className="px-3 py-2 font-medium">Moneda</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {cobros.map((c) => (
                  <tr key={c.id_cobro} className="border-t border-border">
                    <td className="px-3 py-2">{fmtFecha(c.fecha)}</td>
                    <td className="px-3 py-2">{c.descripcion_forma ?? "—"}</td>
                    <td className="px-3 py-2">{c.nombre_banco ?? "—"}</td>
                    <td className="px-3 py-2">{c.descripcion_moneda ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmtNum(c.total)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => setCobroModal({ mode: "edit", item: c })}
                          aria-label="Editar cobro"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setAEliminarCobro(c)}
                          aria-label="Eliminar cobro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-right font-mono">{fmtNum(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>

      {item && (
        <VentaCobroDialog
          state={cobroModal}
          facturaFija={{ id: item.id_factura, label: facturaLabel }}
          onClose={() => setCobroModal({ mode: "closed" })}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["ventas-cobros"] });
            setCobroModal({ mode: "closed" });
          }}
        />
      )}

      <AlertDialog open={!!aEliminarCobro} onOpenChange={(o) => !o && setAEliminarCobro(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cobro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el cobro del{" "}
              <span className="font-semibold">
                {aEliminarCobro && fmtFecha(aEliminarCobro.fecha)}
              </span>{" "}
              por <span className="font-semibold">{fmtNum(aEliminarCobro?.total ?? null)}</span>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarCobroMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminarCobro) eliminarCobroMut.mutate(aEliminarCobro.id_cobro);
              }}
              disabled={eliminarCobroMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {eliminarCobroMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
