import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Loader2, ShoppingBag, X, ListOrdered, Plus, FilePlus } from "lucide-react";
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
  listarCompras,
  crearCompra,
  actualizarCompra,
  eliminarCompra,
  listarCompraDetalle,
  guardarCompraDetalle,
  eliminarCompraDetalle,
  sugeridosAltaCompra,
  listarCondicionesFacturas,
  listarVendedores,
  listarMonedas,
  listarIva,
  resolverCodProveedor,
  buscarProveedoresCompra,
  buscarArticulosCompra,
  type CompraCabecera,
  type CompraCabeceraInput,
  type CompraDetalleLinea,
} from "@/lib/api";

const TIP_COMPROBANTES = ["FCO", "FCR", "NCR", "REC", "AJS", "SAL"];

const COD_EMPRESA = 24;

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: CompraCabecera }
  | { mode: "detalle"; item: CompraCabecera };

const COLUMNAS: Column<CompraCabecera>[] = [
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
    key: "fec_vencimiento",
    header: "Vencimiento",
    accessor: (r) => r.fec_vencimiento ?? "",
    render: (r) => fmtFecha(r.fec_vencimiento),
  },
  {
    key: "nombre_proveedor",
    header: "Proveedor",
    accessor: (r) => r.nombre_proveedor ?? "",
    render: (r) => r.nombre_proveedor || "—",
  },
  {
    key: "desc_moneda",
    header: "Moneda",
    accessor: (r) => r.desc_moneda ?? "",
    render: (r) => r.desc_moneda || "—",
  },
  {
    key: "total",
    header: "Total",
    num: true,
    accessor: (r) => r.total ?? 0,
    render: (r) => <span className="font-mono">{fmtNum(r.total)}</span>,
    footer: (rows) => (
      <span className="font-mono">
        {fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))}
      </span>
    ),
  },
];

export function ComprasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<CompraCabecera | null>(null);
  // 0 = "Todos". Por defecto el año y mes actual; los filtros acotan o ven todo.
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["compras", COD_EMPRESA, anio, mes],
    queryFn: () => listarCompras(COD_EMPRESA, anio, mes),
    retry: false,
  });

  // Años del filtro: los que tienen compras + el seleccionado (por si no hay
  // compras en el año actual, que igual aparezca en el select).
  const anios = Array.from(
    new Set([...(data?.anios ?? []), ...(anio ? [anio] : [])]),
  ).sort((a, b) => b - a);
  const hayFiltros = anio !== 0 || mes !== 0;

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarCompra(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
      setAEliminar(null);
    },
  });

  const filas = data?.data ?? [];
  const selectCls =
    "flex h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Consulta de Compras</h2>
          <p className="text-sm text-muted-foreground">
            {mes === 0 && anio === 0
              ? `Todos · ${filas.length} ${filas.length === 1 ? "comprobante" : "comprobantes"}`
              : `${mes === 0 ? "Todo el año" : MESES[mes - 1]} ${anio === 0 ? "" : anio} · ${
                  filas.length
                } ${filas.length === 1 ? "comprobante" : "comprobantes"}`}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <FilePlus className="mr-2 h-4 w-4" />
          Nueva compra
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 sm:px-5">
        <div className="space-y-1">
          <Label htmlFor="filtro_mes" className="text-xs">
            Mes
          </Label>
          <select
            id="filtro_mes"
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className={selectCls}
          >
            <option value={0}>Todos</option>
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filtro_anio" className="text-xs">
            Año
          </Label>
          <select
            id="filtro_anio"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className={selectCls}
          >
            <option value={0}>Todos</option>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {hayFiltros && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMes(0);
              setAnio(0);
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
            {error instanceof Error ? error.message : "No se pudieron cargar las compras"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Sin compras en el rango</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Ajusta las fechas para ver otras compras.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_factura}
            initialSort={{ key: "id_factura", dir: "desc" }}
            exportName="compras"
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

      <CompraCreateDialog
        open={modal.mode === "create"}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey: ["compras"] });
          // Abre el detalle de la nueva factura para cargar los artículos.
          const nueva = { id_factura: id } as CompraCabecera;
          setModal({ mode: "detalle", item: nueva });
        }}
      />
      <CompraEditDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["compras"] });
          setModal({ mode: "closed" });
        }}
      />
      <DetalleDialog state={modal} onClose={() => setModal({ mode: "closed" })} />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la factura{" "}
              <span className="font-semibold">{aEliminar?.id_factura}</span>
              {aEliminar?.nombre_proveedor && (
                <>
                  {" "}
                  de <span className="font-semibold">{aEliminar.nombre_proveedor}</span>
                </>
              )}
              . Esta acción no se puede deshacer.
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

// ─── Dialog de alta de la cabecera (pág 29) ──────────────────────────────────

function normalizarSerie(s: string): string {
  const limpio = s.replace(/-/g, "");
  if (limpio.length <= 3) return limpio;
  return `${limpio.slice(0, 3)}-${limpio.slice(3, 6)}`;
}

function CompraCreateDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (idFactura: number) => void;
}) {
  const { data: condiciones } = useQuery({
    queryKey: ["condiciones-facturas"],
    queryFn: listarCondicionesFacturas,
    enabled: open,
    retry: false,
  });
  const { data: vendedores } = useQuery({
    queryKey: ["vendedores", COD_EMPRESA],
    queryFn: () => listarVendedores(COD_EMPRESA),
    enabled: open,
    retry: false,
  });
  const { data: monedas } = useQuery({
    queryKey: ["monedas"],
    queryFn: listarMonedas,
    enabled: open,
    retry: false,
  });

  const hoyISO = new Date().toISOString().slice(0, 10);
  const [tipComprobante, setTipComprobante] = useState("FCO");
  const [serTimbrado, setSerTimbrado] = useState("");
  const [nroTimbrado, setNroTimbrado] = useState<number | null>(null);
  const [nroComprobante, setNroComprobante] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyISO);
  const [vencimiento, setVencimiento] = useState(hoyISO);
  const [codPersona, setCodPersona] = useState<number | null>(null);
  const [proveedorLabel, setProveedorLabel] = useState("");
  const [idCondicion, setIdCondicion] = useState<number | null>(1); // default APEX
  const [idComprador, setIdComprador] = useState<number | null>(81); // default APEX
  const [codMoneda, setCodMoneda] = useState(1);
  const [tipCambio, setTipCambio] = useState<number | null>(1);
  const [costoDelivery, setCostoDelivery] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setTipComprobante("FCO");
    setSerTimbrado("");
    setNroTimbrado(null);
    setNroComprobante(null);
    setFecha(hoyISO);
    setVencimiento(hoyISO);
    setCodPersona(null);
    setProveedorLabel("");
    setIdCondicion(1);
    setIdComprador(81);
    setCodMoneda(1);
    setTipCambio(1);
    setCostoDelivery(null);
    setError("");
  }
  if (!open && lastOpen) setLastOpen(false);

  // Trae el siguiente nro de comprobante (y timbrado sugerido) al tener proveedor
  // + tipo + serie, replicando los DAs NRO_REC / Nuevo_1 de la pág 29.
  async function traerSugeridos(persona: number | null, serie: string) {
    if (!persona) return;
    try {
      const s = await sugeridosAltaCompra(COD_EMPRESA, {
        codPersona: persona,
        tipComprobante,
        serTimbrado: serie || undefined,
      });
      if (s.nro_comprobante != null) setNroComprobante(s.nro_comprobante);
      if (s.nro_timbrado != null) setNroTimbrado(s.nro_timbrado);
    } catch {
      // Silencioso: son sugerencias, el usuario puede completar a mano.
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!tipComprobante) return setError("Selecciona el tipo de comprobante");
    if (!serTimbrado.trim()) return setError("Indica la serie del timbrado");
    if (nroComprobante == null) return setError("Indica el nro de comprobante");
    if (!fecha) return setError("Indica la fecha");
    if (!codPersona) return setError("Selecciona el proveedor");
    if (!idCondicion) return setError("Selecciona la condición");

    setSaving(true);
    try {
      const id = await crearCompra({
        cod_empresa: COD_EMPRESA,
        tip_comprobante: tipComprobante,
        ser_timbrado: serTimbrado.trim(),
        nro_timbrado: nroTimbrado,
        nro_comprobante: nroComprobante,
        fec_comprobante: fecha,
        fec_vencimiento: vencimiento || null,
        cod_persona: codPersona,
        id_condicion: idCondicion,
        id_comprador: idComprador,
        cod_moneda: codMoneda,
        tip_cambio: tipCambio ?? 1,
        costo_delivery: costoDelivery,
      });
      onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la compra");
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva compra</DialogTitle>
          <DialogDescription>
            Datos de la factura. Los artículos se cargan al guardar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <BuscadorSelect
              placeholder="Buscar proveedor por nombre, RUC o CI..."
              emptyLabel="Sin proveedores"
              value={codPersona}
              label={proveedorLabel}
              buscar={(q) => buscarProveedoresCompra(COD_EMPRESA, q)}
              itemKey={(p) => p.cod_persona}
              itemTitle={(p) => p.nombre ?? `Persona ${p.cod_persona}`}
              itemSub={(p) => [p.nro_ruc, p.nro_ci].filter(Boolean).join(" · ") || "—"}
              onSelect={(p) => {
                setCodPersona(p.cod_persona);
                setProveedorLabel(p.nombre ?? `Persona ${p.cod_persona}`);
                traerSugeridos(p.cod_persona, serTimbrado);
              }}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c_tip">Tipo</Label>
              <select
                id="c_tip"
                value={tipComprobante}
                onChange={(e) => setTipComprobante(e.target.value)}
                disabled={saving}
                className={selectCls}
              >
                {TIP_COMPROBANTES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_ser">Serie</Label>
              <Input
                id="c_ser"
                value={serTimbrado}
                onChange={(e) => setSerTimbrado(e.target.value)}
                onBlur={() => {
                  const s = normalizarSerie(serTimbrado);
                  setSerTimbrado(s);
                  traerSugeridos(codPersona, s);
                }}
                disabled={saving}
                maxLength={7}
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_timb">Nro timbrado</Label>
              <InputMonto
                id="c_timb"
                value={nroTimbrado}
                onValueChange={setNroTimbrado}
                maxDecimals={0}
                disabled={saving}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c_nro">Nro comprobante</Label>
              <InputMonto
                id="c_nro"
                value={nroComprobante}
                onValueChange={setNroComprobante}
                maxDecimals={0}
                disabled={saving}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_fec">Fecha</Label>
              <Input
                id="c_fec"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_venc">Vencimiento</Label>
              <Input
                id="c_venc"
                type="date"
                value={vencimiento}
                onChange={(e) => setVencimiento(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c_cond">Condición</Label>
              <select
                id="c_cond"
                value={idCondicion ?? ""}
                onChange={(e) => setIdCondicion(e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                className={selectCls}
              >
                <option value="">Seleccionar...</option>
                {(condiciones ?? []).map((c) => (
                  <option key={c.id_condicion} value={c.id_condicion}>
                    {c.descripcion}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_comprador">Comprador</Label>
              <select
                id="c_comprador"
                value={idComprador ?? ""}
                onChange={(e) => setIdComprador(e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                className={selectCls}
              >
                <option value="">Seleccionar...</option>
                {(vendedores ?? [])
                  .filter((v) => v.estado === "S")
                  .map((v) => (
                    <option key={v.cod_vendedor} value={v.cod_vendedor}>
                      {v.nombre}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c_moneda">Moneda</Label>
              <select
                id="c_moneda"
                value={codMoneda}
                onChange={(e) => setCodMoneda(Number(e.target.value))}
                disabled={saving}
                className={selectCls}
              >
                {(monedas ?? []).map((m) => (
                  <option key={m.cod_moneda} value={m.cod_moneda}>
                    {m.descripcion}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_cambio">Tip. cambio</Label>
              <InputMonto
                id="c_cambio"
                value={tipCambio}
                onValueChange={setTipCambio}
                maxDecimals={0}
                disabled={saving}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_delivery">Delivery</Label>
              <InputMonto
                id="c_delivery"
                value={costoDelivery}
                onValueChange={setCostoDelivery}
                maxDecimals={0}
                disabled={saving}
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
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear y cargar artículos
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de edición de la cabecera (solo update) ──────────────────────────

function CompraEditDialog({
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

  const { data: condiciones } = useQuery({
    queryKey: ["condiciones-facturas"],
    queryFn: listarCondicionesFacturas,
    enabled: open,
    retry: false,
  });

  const [tipComprobante, setTipComprobante] = useState("");
  const [nroComprobante, setNroComprobante] = useState("");
  const [fecha, setFecha] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [codPersona, setCodPersona] = useState<number | null>(null);
  const [proveedorLabel, setProveedorLabel] = useState("");
  const [idCondicion, setIdCondicion] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_factura ?? "none"}`;
  if (open && item && key !== lastKey) {
    setLastKey(key);
    setTipComprobante(item.tip_comprobante ?? "");
    setNroComprobante(String(item.nro_comprobante ?? ""));
    setFecha(item.fec_comprobante ?? "");
    setVencimiento(item.fec_vencimiento ?? "");
    setCodPersona(item.cod_persona);
    setProveedorLabel(item.nombre_proveedor ?? `Proveedor ${item.cod_persona}`);
    setIdCondicion(item.id_condicion);
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
    if (!codPersona) return setError("Selecciona el proveedor");

    setSaving(true);
    try {
      const input: CompraCabeceraInput = {
        cod_empresa: COD_EMPRESA,
        tip_comprobante: tipComprobante.trim(),
        nro_comprobante: nroNum,
        fec_comprobante: fecha,
        fec_vencimiento: vencimiento || null,
        cod_persona: codPersona,
        id_condicion: idCondicion,
        id_comprador: item.id_comprador, // se preserva (no editable en esta pantalla)
      };
      await actualizarCompra(item.id_factura, input);
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
          <DialogTitle>Editar compra {item?.id_factura}</DialogTitle>
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
            <Label>Proveedor</Label>
            <BuscadorSelect
              placeholder="Buscar proveedor por nombre, RUC o CI..."
              emptyLabel="Sin proveedores"
              value={codPersona}
              label={proveedorLabel}
              buscar={(q) => buscarProveedoresCompra(COD_EMPRESA, q)}
              itemKey={(p) => p.cod_persona}
              itemTitle={(p) => p.nombre ?? `Persona ${p.cod_persona}`}
              itemSub={(p) => [p.nro_ruc, p.nro_ci].filter(Boolean).join(" · ") || "—"}
              onSelect={(p) => {
                setCodPersona(p.cod_persona);
                setProveedorLabel(p.nombre ?? `Persona ${p.cod_persona}`);
              }}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fec_vencimiento">Vencimiento</Label>
              <Input
                id="fec_vencimiento"
                type="date"
                value={vencimiento}
                onChange={(e) => setVencimiento(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="id_condicion">Condición</Label>
              <select
                id="id_condicion"
                value={idCondicion ?? ""}
                onChange={(e) => setIdCondicion(e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccionar...</option>
                {(condiciones ?? []).map((c) => (
                  <option key={c.id_condicion} value={c.id_condicion}>
                    {c.descripcion}
                  </option>
                ))}
              </select>
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

// ─── Dialog artículos de la factura (pág 36) ─────────────────────────────────

type LineaModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; linea: CompraDetalleLinea };

function DetalleDialog({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const qc = useQueryClient();
  const open = state.mode === "detalle";
  const item = open ? state.item : null;

  const [lineaModal, setLineaModal] = useState<LineaModalState>({ mode: "closed" });
  const [aEliminarLinea, setAEliminarLinea] = useState<CompraDetalleLinea | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["compra-detalle", item?.id_factura],
    queryFn: () => listarCompraDetalle(item!.id_factura),
    enabled: open && item != null,
    retry: false,
  });

  const eliminarLineaMut = useMutation({
    mutationFn: (nroLinea: number) => eliminarCompraDetalle(item!.id_factura, nroLinea),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compra-detalle"] });
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
          <DialogDescription>{item?.nombre_proveedor ?? ""}</DialogDescription>
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
                  <th className="px-3 py-2 text-right font-medium">Costo ant.</th>
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
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {fmtNum(l.costo_anterior)}
                    </td>
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
            qc.invalidateQueries({ queryKey: ["compra-detalle"] });
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

  const { data: ivas } = useQuery({
    queryKey: ["iva"],
    queryFn: listarIva,
    enabled: open,
    retry: false,
  });

  const [idArticulo, setIdArticulo] = useState<number | null>(null);
  const [articuloLabel, setArticuloLabel] = useState("");
  const [codProveedor, setCodProveedor] = useState("");
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);
  const [codIva, setCodIva] = useState<number | null>(null);
  const [costoAnterior, setCostoAnterior] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${linea?.nro_linea ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setIdArticulo(linea?.id_articulo ?? null);
    setArticuloLabel(
      linea ? (linea.descripcion_articulo ?? `Artículo ${linea.id_articulo}`) : "",
    );
    setCodProveedor("");
    setCantidad(linea?.cantidad ?? null);
    setPrecio(linea?.precio ?? null);
    setCodIva(linea?.cod_iva ?? null);
    setCostoAnterior(linea?.costo_anterior ?? null);
    setError("");
  }

  const total = (cantidad ?? 0) * (precio ?? 0);

  // DA carga_iva (pág 36): al elegir artículo autocarga su IVA y el costo anterior.
  async function onSelectArticulo(a: {
    id_articulo: number;
    descripcion: string | null;
    cod_iva?: number | null;
  }) {
    setIdArticulo(a.id_articulo);
    setArticuloLabel(a.descripcion ?? `Artículo ${a.id_articulo}`);
    if (a.cod_iva != null) setCodIva(a.cod_iva);
  }

  // DA recupera_codigo (pág 36): al salir del campo cód. proveedor resuelve el
  // artículo (id, descripción, IVA, costo anterior) para el proveedor de la factura.
  async function onResolverCodProveedor() {
    const cod = codProveedor.trim();
    if (!cod) return;
    setResolviendo(true);
    setError("");
    try {
      const r = await resolverCodProveedor(idFactura, cod);
      if (r) {
        setIdArticulo(r.id_articulo);
        setArticuloLabel(r.descripcion_articulo ?? `Artículo ${r.id_articulo}`);
        setCodIva(r.cod_iva);
        setCostoAnterior(r.costo_anterior);
      } else {
        setError("Sin artículo para ese código de proveedor");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resolver el código");
    } finally {
      setResolviendo(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idArticulo) return setError("Selecciona el artículo");
    if (cantidad == null) return setError("Indica la cantidad");
    if (precio == null) return setError("Indica el precio");

    setSaving(true);
    try {
      await guardarCompraDetalle(idFactura, {
        nro_linea: linea?.nro_linea ?? null,
        id_articulo: idArticulo,
        cantidad,
        precio,
        cod_iva: codIva,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{linea ? "Editar artículo" : "Agregar artículo"}</DialogTitle>
          <DialogDescription>Factura {idFactura}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cod_proveedor">Código del proveedor</Label>
            <div className="relative">
              <Input
                id="cod_proveedor"
                value={codProveedor}
                onChange={(e) => setCodProveedor(e.target.value.toUpperCase())}
                onBlur={onResolverCodProveedor}
                placeholder="Opcional — resuelve el artículo"
                disabled={saving}
                className="font-mono"
              />
              {resolviendo && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Artículo</Label>
            <BuscadorSelect
              placeholder="Buscar artículo por descripción, código o ID..."
              emptyLabel="Sin artículos"
              value={idArticulo}
              label={articuloLabel}
              buscar={(q) => buscarArticulosCompra(COD_EMPRESA, q)}
              itemKey={(a) => a.id_articulo}
              itemTitle={(a) => a.descripcion ?? `Artículo ${a.id_articulo}`}
              itemSub={(a) =>
                `#${a.id_articulo}${a.codigo_oem ? ` · OEM ${a.codigo_oem}` : ""}`
              }
              onSelect={onSelectArticulo}
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
              <Label htmlFor="linea_iva">IVA</Label>
              <select
                id="linea_iva"
                value={codIva ?? ""}
                onChange={(e) => setCodIva(e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                className={selectCls}
              >
                <option value="">Seleccionar...</option>
                {(ivas ?? []).map((iv) => (
                  <option key={iv.cod_iva} value={iv.cod_iva}>
                    {iv.descripcion}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="costo_anterior">Precio anterior</Label>
              <Input
                id="costo_anterior"
                value={costoAnterior == null ? "—" : fmtNum(costoAnterior)}
                disabled
                className="font-mono text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Total</Label>
            <Input value={fmtNum(total)} disabled className="font-mono font-semibold" />
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
