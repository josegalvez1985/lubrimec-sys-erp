import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScanBarcode,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { BuscadorSelect } from "@/components/ui/buscador-select";
import { InputMonto } from "@/components/ui/input-monto";
import { Faceta } from "@/components/ui/faceta";
import { imgArticuloUrl } from "@/components/articulo-img-modal";
import {
  getSesion,
  listarArticulosPOS,
  buscarArticuloPorBarra,
  siguienteNroComprobante,
  registrarVentaPOS,
  buscarPersonas,
  listarVendedores,
  listarTalonarios,
  listarFormasCobroPago,
  listarBancos,
  type ArticuloPOS,
  type VentaPOSInput,
} from "@/lib/api";

const COD_EMPRESA = 24;
const FORMA_EFECTIVO = 1; // id_forma efectivo (muestra moneda/vuelto en el APEX)

const fmtGs = (n: number | null) =>
  n == null ? "0" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// Línea del carrito (estado React, reemplaza la colección CARRITO del APEX).
type ItemCarrito = {
  id_articulo: number;
  descripcion: string;
  cantidad: number;
  precio: number; // precio con descuento aplicado (precio unitario a facturar)
  precio_lista: number; // precio de venta original
  descuento: number; // % descuento
};

// Forma de cobro cargada (reemplaza la colección FORMAPAGO).
type Cobro = {
  id_forma: number;
  desc_forma: string;
  total: number;
  id_banco: number | null;
  nro_transaccion: string | null;
  efectivo_recibido: number | null;
  efectivo_vuelto: number | null;
  observacion: string | null;
};

export function PuntoVentaView() {
  const sesion = getSesion();
  const [busqueda, setBusqueda] = useState("");
  const [codBarra, setCodBarra] = useState("");
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [marcaSel, setMarcaSel] = useState<Set<string>>(new Set());
  const [descuento, setDescuento] = useState(0);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [modal, setModal] = useState<"cerrado" | "cobro">("cerrado");

  // Se trae todo el dataset (con el descuento aplicado en el precio); rubro,
  // marca y búsqueda se filtran en el front (facetas dependientes).
  const { data: todos, isLoading } = useQuery({
    queryKey: ["pos-articulos", COD_EMPRESA, descuento],
    queryFn: () => listarArticulosPOS(COD_EMPRESA, { descuento }),
    retry: false,
  });

  const filas = useMemo(() => todos ?? [], [todos]);

  const coincide = (a: ArticuloPOS, ignora: "rubro" | "marca" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${a.descripcion ?? ""} ${a.codigo_oem ?? ""} ${a.marca ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(a.rubro ?? "")) return false;
    if (ignora !== "marca" && marcaSel.size > 0 && !marcaSel.has(a.marca ?? "")) return false;
    return true;
  };

  const facet = (campo: "rubro" | "marca") => {
    const c = new Map<string, number>();
    for (const a of filas) {
      const v = a[campo];
      if (coincide(a, campo) && v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    return [...c.entries()]
      .map(([valor, n]) => ({ valor, n }))
      .sort((x, y) => y.n - x.n || x.valor.localeCompare(y.valor));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetRubro = useMemo(() => facet("rubro"), [filas, busqueda, rubroSel, marcaSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetMarca = useMemo(() => facet("marca"), [filas, busqueda, rubroSel, marcaSel]);

  const articulos = useMemo(
    () => filas.filter((a) => coincide(a, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, rubroSel, marcaSel],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const total = carrito.reduce((a, i) => a + i.precio * i.cantidad, 0);

  function agregar(a: ArticuloPOS) {
    const precio = a.precio_con_descuento ?? a.precio_venta ?? 0;
    setCarrito((prev) => {
      const ix = prev.findIndex((i) => i.id_articulo === a.id_articulo);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = { ...next[ix], cantidad: next[ix].cantidad + 1 };
        return next;
      }
      return [
        ...prev,
        {
          id_articulo: a.id_articulo,
          descripcion: a.descripcion ?? `Artículo ${a.id_articulo}`,
          cantidad: 1,
          precio,
          precio_lista: a.precio_venta ?? precio,
          descuento,
        },
      ];
    });
  }

  function cambiarCantidad(id: number, delta: number) {
    setCarrito((prev) =>
      prev
        .map((i) => (i.id_articulo === id ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0),
    );
  }

  function quitar(id: number) {
    setCarrito((prev) => prev.filter((i) => i.id_articulo !== id));
  }

  async function onBarra(e: FormEvent) {
    e.preventDefault();
    const cb = codBarra.trim();
    if (!cb) return;
    try {
      const art = await buscarArticuloPorBarra(COD_EMPRESA, cb);
      if (art) {
        agregar({
          id_articulo: art.id_articulo,
          descripcion: art.descripcion,
          id_rubro: null,
          id_marca: null,
          rubro: null,
          marca: null,
          codigo_oem: null,
          precio_venta: art.precio_venta,
          precio_con_descuento: art.precio_venta,
        });
        setCodBarra("");
      } else {
        toast.error("Código de barra no encontrado");
      }
    } catch {
      toast.error("Error al buscar el código");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Panel de artículos: facetas + lista */}
      <div className="rounded-2xl border border-border bg-card shadow-elegant">
        <div className="space-y-3 border-b border-border p-4 sm:p-5">
          <h2 className="font-display text-xl font-bold">Punto de Venta</h2>
          <div className="flex flex-wrap items-end gap-3">
            <form onSubmit={onBarra} className="relative min-w-0 flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={codBarra}
                onChange={(e) => setCodBarra(e.target.value)}
                placeholder="Escaneá un código de barra..."
                className="h-11 pl-11"
              />
            </form>
            <div className="w-28 space-y-1">
              <Label className="text-xs">% Descuento</Label>
              <InputMonto
                value={descuento || null}
                onValueChange={(v) => setDescuento(v ?? 0)}
                maxDecimals={0}
                placeholder="0"
                className="h-11 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[220px_1fr]">
          {/* Sidebar de facetas */}
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="pl-10"
              />
            </div>
            <Faceta
              titulo="Marca"
              valores={facetMarca.map((f) => ({ valor: f.valor, n: 0 }))}
              seleccion={marcaSel}
              onToggle={(v) => toggle(marcaSel, setMarcaSel, v)}
            />
            <Faceta
              titulo="Rubro"
              valores={facetRubro.map((f) => ({ valor: f.valor, n: 0 }))}
              seleccion={rubroSel}
              onToggle={(v) => toggle(rubroSel, setRubroSel, v)}
            />
          </aside>

          {/* Lista de artículos con imagen */}
          <div className="min-w-0">
            {isLoading ? (
              <div className="grid place-items-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : articulos.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Sin artículos con stock
              </p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-border overflow-auto rounded-xl border border-border">
                {articulos.map((a) => (
                  <li key={a.id_articulo}>
                    <button
                      type="button"
                      onClick={() => agregar(a)}
                      className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <ThumbArticulo id={a.id_articulo} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.descripcion}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[a.marca, a.codigo_oem ? `OEM ${a.codigo_oem}` : null]
                            .filter(Boolean)
                            .join(" · ") || `#${a.id_articulo}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {a.precio_con_descuento != null &&
                          a.precio_con_descuento !== a.precio_venta && (
                            <p className="text-xs text-muted-foreground line-through">
                              {fmtGs(a.precio_venta)}
                            </p>
                          )}
                        <p className="font-mono font-semibold text-primary">
                          ₲ {fmtGs(a.precio_con_descuento ?? a.precio_venta)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Carrito */}
      <div className="flex flex-col rounded-2xl border border-border bg-card shadow-elegant lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Carrito</h3>
          <Badge variant="outline" className="ml-auto">
            {carrito.length}
          </Badge>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {carrito.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Carrito vacío</p>
          ) : (
            <ul className="space-y-2">
              {carrito.map((i) => (
                <li key={i.id_articulo} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{i.descripcion}</p>
                    <button
                      type="button"
                      onClick={() => quitar(i.id_articulo)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => cambiarCantidad(i.id_articulo, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center font-mono text-sm">{i.cantidad}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => cambiarCantidad(i.id_articulo, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <span className="font-mono text-sm font-semibold">
                      ₲ {fmtGs(i.precio * i.cantidad)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-display text-2xl font-bold tabular-nums">₲ {fmtGs(total)}</span>
          </div>
          <Button
            disabled={carrito.length === 0}
            onClick={() => setModal("cobro")}
            className="w-full bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Facturar
          </Button>
        </div>
      </div>

      {modal === "cobro" && (
        <FacturarDialog
          total={total}
          detalle={carrito}
          vendedorDefault={sesion?.app_user ?? ""}
          onClose={() => setModal("cerrado")}
          onDone={(idFactura) => {
            toast.success(`Venta registrada · Factura ${idFactura}`);
            setCarrito([]);
            setModal("cerrado");
          }}
        />
      )}
    </div>
  );
}

// Miniatura del artículo con fallback a un ícono si no hay imagen.
function ThumbArticulo({ id }: { id: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <ShoppingCart className="h-4 w-4" />
      </div>
    );
  }
  return (
    <img
      src={imgArticuloUrl(String(id))}
      alt=""
      loading="lazy"
      onError={() => setOk(false)}
      className="h-10 w-10 shrink-0 rounded-lg border border-border object-contain"
    />
  );
}

// ─── Dialog de facturación: datos de factura + formas de cobro ───────────────

function FacturarDialog({
  total,
  detalle,
  onClose,
  onDone,
}: {
  total: number;
  detalle: ItemCarrito[];
  vendedorDefault: string;
  onClose: () => void;
  onDone: (idFactura: number) => void;
}) {
  // Datos de factura (pág 45)
  const [codPersona, setCodPersona] = useState<number | null>(null);
  const [clienteLabel, setClienteLabel] = useState("");
  const [codVendedor, setCodVendedor] = useState<number | null>(null);
  const [idTalonario, setIdTalonario] = useState<number | null>(null);
  const [nroTelefono, setNroTelefono] = useState("");
  const [observacion, setObservacion] = useState("");
  // Cobros (pág 47)
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: vendedores } = useQuery({
    queryKey: ["vendedores", COD_EMPRESA],
    queryFn: () => listarVendedores(COD_EMPRESA),
    retry: false,
  });
  const { data: talonarios } = useQuery({
    queryKey: ["talonarios", COD_EMPRESA],
    queryFn: () => listarTalonarios(COD_EMPRESA),
    retry: false,
  });
  const { data: formas } = useQuery({
    queryKey: ["formas-cobro-pago"],
    queryFn: listarFormasCobroPago,
    retry: false,
  });

  const talonario = useMemo(
    () => (talonarios ?? []).find((t) => t.id_talonario === idTalonario),
    [talonarios, idTalonario],
  );

  const totalCobrado = cobros.reduce((a, c) => a + c.total, 0);
  const restante = total - totalCobrado;

  async function onSubmit() {
    setError("");
    if (!codPersona) return setError("Selecciona el cliente");
    if (!codVendedor) return setError("Selecciona el vendedor");
    if (!idTalonario || !talonario) return setError("Selecciona la serie/talonario");
    if (cobros.length === 0) return setError("Agrega al menos una forma de cobro");
    if (Math.abs(restante) > 0.5) return setError(`Falta cobrar ₲ ${fmtGs(restante)}`);

    setSaving(true);
    try {
      const nro = await siguienteNroComprobante(COD_EMPRESA, talonario.ser_timbrado ?? "");
      const input: VentaPOSInput = {
        cabecera: {
          tip_comprobante: "FCO",
          ser_timbrado: talonario.ser_timbrado ?? "",
          nro_timbrado: talonario.nro_timbrado ?? null,
          nro_comprobante: nro,
          cod_persona: codPersona,
          cod_moneda: 1,
          tip_cambio: 1,
          id_talonario: idTalonario,
          cod_vendedor: codVendedor,
          nro_voucher: null,
          nro_telefono: nroTelefono.trim() || null,
          observacion: observacion.trim() || null,
          modelo_vehiculo: null,
        },
        detalle: detalle.map((i) => ({
          id_articulo: i.id_articulo,
          cantidad: i.cantidad,
          precio: i.precio,
          descuento: i.descuento || null,
          precio_lista: i.precio_lista,
        })),
        cobros: cobros.map((c) => ({
          id_forma: c.id_forma,
          id_banco: c.id_banco,
          nro_transaccion: c.nro_transaccion,
          observacion: c.observacion,
          total: c.total,
          cod_moneda: 1,
          efectivo_recibido: c.efectivo_recibido,
          efectivo_vuelto: c.efectivo_vuelto,
        })),
      };
      const idFactura = await registrarVentaPOS(COD_EMPRESA, input);
      onDone(idFactura);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la venta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Facturar · Total ₲ {fmtGs(total)}</DialogTitle>
          <DialogDescription>Datos de la factura y formas de cobro.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vendedor">Vendedor</Label>
              <select
                id="vendedor"
                value={codVendedor ?? ""}
                onChange={(e) => setCodVendedor(e.target.value ? Number(e.target.value) : null)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <Label htmlFor="talonario">Serie / Talonario</Label>
              <select
                id="talonario"
                value={idTalonario ?? ""}
                onChange={(e) => setIdTalonario(e.target.value ? Number(e.target.value) : null)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {(talonarios ?? []).map((t) => (
                  <option key={t.id_talonario} value={t.id_talonario}>
                    {t.ser_timbrado}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="telefono">Celular</Label>
              <Input
                id="telefono"
                value={nroTelefono}
                onChange={(e) => setNroTelefono(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="obs">Observación</Label>
              <Input
                id="obs"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          {/* Formas de cobro */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Formas de cobro</p>
              <span
                className={`text-xs font-medium ${
                  restante > 0.5 ? "text-amber-600" : restante < -0.5 ? "text-destructive" : "text-emerald-600"
                }`}
              >
                {restante > 0.5
                  ? `Falta ₲ ${fmtGs(restante)}`
                  : restante < -0.5
                    ? `Excede ₲ ${fmtGs(-restante)}`
                    : "Cubierto"}
              </span>
            </div>

            {cobros.map((c, ix) => (
              <div key={ix} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.desc_forma}</span>
                <span className="font-mono font-semibold">₲ {fmtGs(c.total)}</span>
                <button
                  type="button"
                  onClick={() => setCobros((prev) => prev.filter((_, i) => i !== ix))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Quitar cobro"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            <AgregarCobro
              formas={formas ?? []}
              restante={Math.max(restante, 0)}
              onAdd={(c) => setCobros((prev) => [...prev, c])}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={saving}
            className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-form: agregar una forma de cobro ────────────────────────────────────

function AgregarCobro({
  formas,
  restante,
  onAdd,
}: {
  formas: { id_forma: number; descripcion: string | null }[];
  restante: number;
  onAdd: (c: Cobro) => void;
}) {
  const [idForma, setIdForma] = useState<number | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [idBanco, setIdBanco] = useState<number | null>(null);
  const [nroTransaccion, setNroTransaccion] = useState("");
  const [efectivoRecibido, setEfectivoRecibido] = useState<number | null>(null);

  const { data: bancos } = useQuery({ queryKey: ["bancos"], queryFn: listarBancos, retry: false });

  const esEfectivo = idForma === FORMA_EFECTIVO;
  const vuelto =
    esEfectivo && efectivoRecibido != null && monto != null
      ? Math.max(efectivoRecibido - monto, 0)
      : null;

  function add() {
    if (!idForma || monto == null || monto <= 0) return;
    const desc = formas.find((f) => f.id_forma === idForma)?.descripcion ?? "Cobro";
    onAdd({
      id_forma: idForma,
      desc_forma: desc,
      total: monto,
      id_banco: esEfectivo ? null : idBanco,
      nro_transaccion: esEfectivo ? null : nroTransaccion.trim() || null,
      efectivo_recibido: esEfectivo ? efectivoRecibido : null,
      efectivo_vuelto: vuelto,
      observacion: null,
    });
    setIdForma(null);
    setMonto(null);
    setIdBanco(null);
    setNroTransaccion("");
    setEfectivoRecibido(null);
  }

  const selectCls =
    "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={idForma ?? ""}
          onChange={(e) => setIdForma(e.target.value ? Number(e.target.value) : null)}
          className={selectCls}
        >
          <option value="">Forma de cobro...</option>
          {formas.map((f) => (
            <option key={f.id_forma} value={f.id_forma}>
              {f.descripcion}
            </option>
          ))}
        </select>
        <InputMonto
          value={monto}
          onValueChange={setMonto}
          maxDecimals={0}
          placeholder={restante > 0 ? `Máx ${fmtGs(restante)}` : "Monto"}
          className="h-9 font-mono"
        />
      </div>

      {idForma != null &&
        (esEfectivo ? (
          <div className="grid grid-cols-2 gap-2">
            <InputMonto
              value={efectivoRecibido}
              onValueChange={setEfectivoRecibido}
              maxDecimals={0}
              placeholder="Recibido"
              className="h-9 font-mono"
            />
            <div className="grid h-9 place-items-center rounded-md bg-muted/40 text-sm">
              Vuelto ₲ {fmtGs(vuelto)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select
              value={idBanco ?? ""}
              onChange={(e) => setIdBanco(e.target.value ? Number(e.target.value) : null)}
              className={selectCls}
            >
              <option value="">Banco...</option>
              {(bancos ?? []).map((b) => (
                <option key={b.id_banco} value={b.id_banco}>
                  {b.nombre}
                </option>
              ))}
            </select>
            <Input
              value={nroTransaccion}
              onChange={(e) => setNroTransaccion(e.target.value)}
              placeholder="Nro transacción"
              className="h-9"
            />
          </div>
        ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!idForma || monto == null || monto <= 0}
        onClick={add}
      >
        <Plus className="mr-2 h-4 w-4" />
        Agregar cobro
      </Button>
    </div>
  );
}
