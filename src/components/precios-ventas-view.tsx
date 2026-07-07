import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Tags, X } from "lucide-react";
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
  listarPreciosVentas,
  crearPrecioVenta,
  actualizarPrecioVenta,
  eliminarPrecioVenta,
  sugerirPrecio,
  articulosParaPrecio,
  buscarArticulos,
  buscarCompras,
  type PrecioVenta,
  type PrecioVentaInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtFechaHora = (iso: string | null) => {
  if (!iso) return "—";
  const [fecha, hora] = iso.split("T");
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}${hora ? ` ${hora.slice(0, 5)}` : ""}`;
};

function labelArticulo(a: { id_articulo: number; descripcion: string | null }): string {
  return a.descripcion ?? `Artículo ${a.id_articulo}`;
}

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
  | { mode: "edit"; item: PrecioVenta }
  | { mode: "view"; item: PrecioVenta };

const COLUMNAS: Column<PrecioVenta>[] = [
  {
    key: "id_precio",
    header: "ID",
    num: true,
    accessor: (r) => r.id_precio,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.id_precio}
      </Badge>
    ),
    className: "w-16",
  },
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => fmtFechaHora(r.fecha),
  },
  {
    key: "articulo",
    header: "Artículo",
    accessor: (r) => r.descripcion_articulo ?? `Artículo ${r.id_articulo}`,
    render: (r) => (
      <div className="flex flex-col">
        <span>{r.descripcion_articulo ?? "—"}</span>
        <span className="font-mono text-xs text-muted-foreground">#{r.id_articulo}</span>
      </div>
    ),
    hideable: false,
  },
  {
    key: "precio_compra",
    header: "Precio Compra",
    num: true,
    accessor: (r) => r.precio_compra ?? 0,
    render: (r) => <span className="font-mono">{fmtNum(r.precio_compra)}</span>,
  },
  {
    key: "porc_recargo",
    header: "% Recargo",
    num: true,
    accessor: (r) => r.porc_recargo ?? 0,
    render: (r) => (r.porc_recargo == null ? "—" : `${r.porc_recargo}%`),
  },
  {
    key: "precio_venta",
    header: "Precio Venta",
    num: true,
    accessor: (r) => r.precio_venta,
    render: (r) => <span className="font-mono font-semibold">{fmtNum(r.precio_venta)}</span>,
    hideable: false,
  },
  {
    key: "margen",
    header: "Margen %",
    num: true,
    accessor: (r) => r.margen ?? 0,
    render: (r) =>
      r.margen == null ? "—" : `${r.margen.toLocaleString("es-PY", { maximumFractionDigits: 2 })}%`,
  },
  {
    key: "rubro",
    header: "Rubro",
    accessor: (r) => r.rubro ?? "",
    render: (r) => r.rubro || "—",
  },
  {
    key: "marca",
    header: "Marca",
    accessor: (r) => r.marca ?? "",
    render: (r) => r.marca || "—",
  },
  {
    key: "codigo_oem",
    header: "Código OEM",
    accessor: (r) => r.codigo_oem ?? "",
    render: (r) => r.codigo_oem || "—",
  },
  {
    key: "id_factura",
    header: "Factura compra",
    accessor: (r) => r.id_factura ?? "",
    render: (r) => (r.id_factura ? `#${r.id_factura}` : "—"),
  },
];

export function PreciosVentasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<PrecioVenta | null>(null);
  const [filtroArticulo, setFiltroArticulo] = useState<number | null>(null);
  const [filtroArticuloLabel, setFiltroArticuloLabel] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["precios-ventas", COD_EMPRESA, filtroArticulo],
    queryFn: () => listarPreciosVentas(COD_EMPRESA, filtroArticulo ?? undefined),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarPrecioVenta(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["precios-ventas"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Precios de Ventas</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "precio registrado" : "precios registrados"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo precio</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 sm:px-5">
        <div className="w-full max-w-sm space-y-1">
          <Label className="text-xs">Artículo</Label>
          <BuscadorSelect
            placeholder="Filtrar por artículo..."
            emptyLabel="Sin artículos"
            value={filtroArticulo}
            label={filtroArticuloLabel}
            buscar={(q) => buscarArticulos(COD_EMPRESA, q)}
            itemKey={(a) => a.id_articulo}
            itemTitle={(a) => labelArticulo(a)}
            itemSub={(a) => (a.codigo_oem ? `OEM ${a.codigo_oem}` : `#${a.id_articulo}`)}
            onSelect={(a) => {
              setFiltroArticulo(a.id_articulo);
              setFiltroArticuloLabel(labelArticulo(a));
            }}
          />
        </div>
        {filtroArticulo != null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFiltroArticulo(null);
              setFiltroArticuloLabel("");
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
            {error instanceof Error ? error.message : "No se pudieron cargar los precios"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Tags className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Sin precios registrados</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Registra el primero con el botón “Nuevo precio”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_precio}
            initialSort={{ key: "id_precio", dir: "desc" }}
            exportName="precios-ventas"
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

      <PrecioVentaDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["precios-ventas"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar precio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el precio{" "}
              <span className="font-semibold">{fmtNum(aEliminar?.precio_venta ?? null)}</span> de{" "}
              <span className="font-semibold">
                {aEliminar?.descripcion_articulo ?? `artículo ${aEliminar?.id_articulo}`}
              </span>
              . Si era el precio vigente, el precio de venta del artículo se recalculará con el
              anterior. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_precio);
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

function PrecioVentaDialog({
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

  const [idArticulo, setIdArticulo] = useState<number | null>(null);
  const [articuloLabel, setArticuloLabel] = useState("");
  const [precioCompra, setPrecioCompra] = useState<number | null>(null);
  const [porcRecargo, setPorcRecargo] = useState<number | null>(null);
  const [precioVenta, setPrecioVenta] = useState<number | null>(null);
  const [precioAnterior, setPrecioAnterior] = useState<number | null>(null);
  const [idFactura, setIdFactura] = useState<number | null>(null);
  const [facturaLabel, setFacturaLabel] = useState("");
  const [nroLinea, setNroLinea] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cargandoSug, setCargandoSug] = useState(false);
  // Si el usuario editó el precio de venta a mano, no lo pisamos al recalcular.
  const [ventaTocada, setVentaTocada] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_precio ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setIdArticulo(item?.id_articulo ?? null);
    setArticuloLabel(item ? (item.descripcion_articulo ?? `Artículo ${item.id_articulo}`) : "");
    setPrecioCompra(item?.precio_compra ?? null);
    setPorcRecargo(item?.porc_recargo ?? null);
    setPrecioVenta(item?.precio_venta ?? null);
    setPrecioAnterior(null);
    setIdFactura(item?.id_factura ?? null);
    setFacturaLabel(item?.id_factura ? `Factura ${item.id_factura}` : "");
    setNroLinea(item?.nro_linea != null ? String(item.nro_linea) : "");
    setVentaTocada(state.mode === "edit"); // en edición respetamos el valor guardado
    setError("");
  }

  // Fórmula del APEX (DA "CALCULO"): recargo simple sobre el costo, redondeado
  // hacia arriba al millar. Se recalcula al cambiar compra o recargo, salvo que
  // el usuario haya tocado el precio de venta a mano.
  function calcularVenta(compra: number | null, recargo: number | null): number | null {
    if (compra == null || recargo == null) return null;
    return Math.ceil((compra + (recargo / 100) * compra) / 1000) * 1000;
  }

  function onCompraChange(v: number | null) {
    setPrecioCompra(v);
    if (!ventaTocada) setPrecioVenta(calcularVenta(v, porcRecargo));
  }
  function onRecargoChange(v: number | null) {
    setPorcRecargo(v);
    if (!ventaTocada) setPrecioVenta(calcularVenta(precioCompra, v));
  }

  // Al elegir artículo: precarga compra/recargo/nro_linea/venta y el precio anterior.
  async function onArticuloSelect(a: { id_articulo: number; descripcion: string | null }) {
    setIdArticulo(a.id_articulo);
    setArticuloLabel(a.descripcion ?? `Artículo ${a.id_articulo}`);
    setCargandoSug(true);
    try {
      const s = await sugerirPrecio(COD_EMPRESA, a.id_articulo, idFactura);
      setPrecioAnterior(s.precio_venta_anterior);
      if (s.precio_compra != null) setPrecioCompra(s.precio_compra);
      if (s.porc_recargo != null) setPorcRecargo(s.porc_recargo);
      if (s.nro_linea != null) setNroLinea(String(s.nro_linea));
      if (s.precio_venta != null) {
        setPrecioVenta(s.precio_venta);
        setVentaTocada(false); // el sugerido manda; el usuario aún puede editarlo
      }
    } catch {
      // si falla la sugerencia, el usuario completa a mano
    } finally {
      setCargandoSug(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idArticulo) return setError("Selecciona el artículo");
    if (precioVenta == null) return setError("Indica el precio de venta");

    setSaving(true);
    try {
      const nroLineaNum = nroLinea.trim() ? Number(nroLinea) : null;
      const input: PrecioVentaInput = {
        id_articulo: idArticulo,
        porc_recargo: porcRecargo,
        precio_compra: precioCompra,
        precio_venta: precioVenta,
        cod_empresa: COD_EMPRESA,
        nro_linea: nroLineaNum,
        id_factura: idFactura,
      };
      if (state.mode === "edit") {
        await actualizarPrecioVenta(state.item.id_precio, input);
      } else {
        await crearPrecioVenta(input);
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
      ? "Nuevo precio de venta"
      : state.mode === "edit"
        ? "Editar precio"
        : "Detalle del precio";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Elegí la factura de compra y el artículo: el precio de venta se calcula solo (podés
              ajustarlo). Al guardar pasa a ser el precio vigente del artículo.
            </DialogDescription>
          )}
          {isView && item && (
            <DialogDescription>Registrado el {fmtFechaHora(item.fecha)}</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Factura de compra (opcional)</Label>
            {isView ? (
              <Input value={item?.id_factura ? facturaLabel : "—"} disabled />
            ) : (
              <BuscadorSelect
                placeholder="Buscar factura de compra por ID, comprobante o proveedor..."
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
                  // cambió la factura: se limpia el artículo (LOV en cascada)
                  setIdArticulo(null);
                  setArticuloLabel("");
                }}
                disabled={saving}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Artículo</Label>
            {isView ? (
              <Input value={articuloLabel} disabled />
            ) : (
              <BuscadorSelect
                key={idFactura ?? "sin-factura"} // reinicia el buscador al cambiar la factura
                placeholder="Buscar artículo por descripción, código o ID..."
                emptyLabel="Sin artículos"
                value={idArticulo}
                label={articuloLabel}
                buscar={(q) => articulosParaPrecio(COD_EMPRESA, q, idFactura)}
                itemKey={(a) => a.id_articulo}
                itemTitle={(a) => labelArticulo(a)}
                itemSub={(a) => (a.codigo_oem ? `OEM ${a.codigo_oem}` : `#${a.id_articulo}`)}
                onSelect={onArticuloSelect}
                disabled={saving}
              />
            )}
          </div>

          {/* Precio de venta anterior (referencia, como el APEX) */}
          {!isView && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Precio de venta anterior: </span>
              <span className="font-mono font-semibold">
                {cargandoSug ? "…" : precioAnterior != null ? fmtNum(precioAnterior) : "—"}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="precio_compra">Precio Compra</Label>
              <InputMonto
                id="precio_compra"
                value={precioCompra}
                onValueChange={onCompraChange}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="porc_recargo">% Recargo</Label>
              <InputMonto
                id="porc_recargo"
                value={porcRecargo}
                onValueChange={onRecargoChange}
                disabled={isView || saving}
                maxDecimals={2}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="precio_venta">
              Precio Venta <span className="text-xs text-muted-foreground">(calculado)</span>
            </Label>
            <InputMonto
              id="precio_venta"
              value={precioVenta}
              onValueChange={(v) => {
                setPrecioVenta(v);
                setVentaTocada(true);
              }}
              disabled={isView || saving}
              maxDecimals={0}
              className="font-mono font-semibold"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nro_linea">Nro línea de la factura (opcional)</Label>
            <Input
              id="nro_linea"
              type="number"
              value={nroLinea}
              onChange={(e) => setNroLinea(e.target.value)}
              disabled={isView || saving}
              className="font-mono"
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
