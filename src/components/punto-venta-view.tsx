import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MutableRefObject,
  type Ref,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  UserPlus,
  ScanBarcode,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
  UserRound,
  FileText,
  Wallet,
  Landmark,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BuscadorSelect } from "@/components/ui/buscador-select";
import { SelectorModal } from "@/components/ui/selector-modal";
import { InputMonto } from "@/components/ui/input-monto";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal, imgArticuloUrl } from "@/components/articulo-img-modal";
import {
  getSesion,
  listarArticulosPOS,
  buscarArticuloPorBarra,
  siguienteNroComprobante,
  registrarVentaPOS,
  buscarClientesPOS,
  crearPersona,
  listarVendedores,
  listarTalonarios,
  listarFormasCobroPago,
  listarBancos,
  type ArticuloPOS,
  type PersonaInput,
  type VentaPOSInput,
} from "@/lib/api";
import { tokensBusqueda, coincide as coincideTexto } from "@/lib/busqueda";

const COD_EMPRESA = 24;
const PASO_ARTICULOS = 50; // artículos que se dibujan por tanda (mismo paso que el DataTable)
const FORMA_EFECTIVO = 1; // id_forma efectivo (muestra moneda/vuelto en el APEX)
const COD_PERSONA_SIN_CLIENTE = 1; // cliente por defecto: venta sin identificar

const fmtGs = (n: number | null) =>
  n == null ? "0" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// Celular (< 640px, el breakpoint `sm`).
const MQ_CELULAR = "(max-width: 639.98px)";
function useEsCelular() {
  return useSyncExternalStore(
    (f) => {
      const mq = window.matchMedia(MQ_CELULAR);
      mq.addEventListener("change", f);
      return () => mq.removeEventListener("change", f);
    },
    () => window.matchMedia(MQ_CELULAR).matches,
    () => false,
  );
}

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
  // En móvil el carrito se abre en un modal desde un botón flotante (FAB).
  const [verCarrito, setVerCarrito] = useState(false);
  // Artículo cuya imagen se está viendo ampliada (click en la miniatura).
  const [imgArticulo, setImgArticulo] = useState<ArticuloPOS | null>(null);
  // Celular: panel con las facetas Marca y Rubro.
  const [verFiltros, setVerFiltros] = useState(false);
  const esCelular = useEsCelular();
  const barraRef = useRef<HTMLInputElement>(null);

  // Autofoco para escanear directo (en celular no: abriría el teclado al entrar).
  useEffect(() => {
    if (!window.matchMedia(MQ_CELULAR).matches) barraRef.current?.focus();
  }, []);

  // Salir de la pantalla con el carrito cargado (botón atrás del APK, menú) pide
  // confirmación; con un diálogo abierto, el atrás primero lo cierra.
  const hayDialogo = verCarrito || modal === "cobro" || imgArticulo != null || verFiltros;
  const estadoRef = useRef({ items: 0, hayDialogo: false });
  estadoRef.current = { items: carrito.length, hayDialogo };
  const paginaDe = (l: { pathname: string; search: unknown }) =>
    `${l.pathname}?${(l.search as { p?: string } | undefined)?.p ?? ""}`;
  const bloqueo = useBlocker({
    shouldBlockFn: ({ current, next, action }) => {
      const e = estadoRef.current;
      if (action === "BACK" && e.hayDialogo) return true;
      if (e.items === 0) return false;
      return paginaDe(current) !== paginaDe(next);
    },
    enableBeforeUnload: () => estadoRef.current.items > 0,
    withResolver: true,
  });
  const atrasCierraDialogo =
    bloqueo.status === "blocked" && bloqueo.action === "BACK" && hayDialogo;
  useEffect(() => {
    if (!atrasCierraDialogo) return;
    bloqueo.reset?.();
    setVerCarrito(false);
    setModal("cerrado");
    setImgArticulo(null);
    setVerFiltros(false);
  }, [atrasCierraDialogo, bloqueo]);

  // Se trae todo el dataset; rubro, marca y búsqueda se filtran en el front
  // (facetas dependientes).
  //
  // El % de descuento NO va en la queryKey ni al endpoint: recalcularlo del lado
  // de Oracle obliga a rehacer la suma de stock sobre todo el historial de compras
  // y ventas (~12 s en frío), y tipear el descuento disparaba esa consulta de nuevo
  // en cada tecla. Se pide siempre el dataset base y el descuento manual se aplica
  // acá, que es aritmética pura sobre precio_venta.
  const {
    data: todos,
    isLoading,
    error: errorArticulos,
  } = useQuery({
    queryKey: ["pos-articulos", COD_EMPRESA],
    queryFn: () => listarArticulosPOS(COD_EMPRESA),
    retry: false,
  });

  // Con descuento manual (> 0) el precio es precio_venta * (1 - d/100), igual que
  // hacía el SQL. Con descuento 0 se respeta precio_con_descuento tal cual vino:
  // ahí el backend aplicó FN_PORC_DESCUENTO (descuento automático por precio y
  // rubro), lógica que vive en la base y no se replica acá.
  const filas = useMemo(() => {
    const base = todos ?? [];
    if (!descuento) return base;
    const factor = 1 - descuento / 100;
    return base.map((a) => ({
      ...a,
      precio_con_descuento:
        a.precio_venta == null ? a.precio_con_descuento : Math.round(a.precio_venta * factor),
    }));
  }, [todos, descuento]);

  const tokens = useMemo(() => tokensBusqueda(busqueda), [busqueda]);

  const coincide = (a: ArticuloPOS, ignora: "rubro" | "marca" | null) => {
    if (tokens.length > 0) {
      const txt = `${a.descripcion ?? ""} ${a.codigo_oem ?? ""} ${a.marca ?? ""}`;
      if (!coincideTexto(txt, tokens)) return false;
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

  // Se dibujan de a 50 artículos ("Mostrar más"): dibujar los ~450 en cada tecla
  // trababa el listado. El filtro sigue sobre todos; cambiarlo vuelve a los 50.
  const [limite, setLimite] = useState(PASO_ARTICULOS);
  const claveLimite = `${busqueda}|${[...rubroSel].join(",")}|${[...marcaSel].join(",")}`;
  const [claveAnterior, setClaveAnterior] = useState(claveLimite);
  if (claveAnterior !== claveLimite) {
    setClaveAnterior(claveLimite);
    setLimite(PASO_ARTICULOS);
  }
  const articulosDibujados = articulos.slice(0, limite);
  const restantes = articulos.length - articulosDibujados.length;

  const hayFiltros = busqueda.trim() !== "" || marcaSel.size > 0 || rubroSel.size > 0;
  function limpiarFiltros() {
    setBusqueda("");
    setMarcaSel(new Set());
    setRubroSel(new Set());
  }

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

  // Mínimo 1: para sacar una línea se usa la papelera.
  function fijarCantidad(id: number, cantidad: number) {
    const c = Math.max(1, Math.floor(cantidad) || 1);
    setCarrito((prev) => prev.map((i) => (i.id_articulo === id ? { ...i, cantidad: c } : i)));
  }

  function quitar(id: number) {
    const ix = carrito.findIndex((i) => i.id_articulo === id);
    if (ix < 0) return;
    const item = carrito[ix];
    setCarrito((prev) => prev.filter((i) => i.id_articulo !== id));
    toast(`Quitaste ${item.descripcion}`, {
      action: {
        label: "Deshacer",
        onClick: () =>
          setCarrito((prev) => {
            if (prev.some((i) => i.id_articulo === id)) return prev;
            const next = [...prev];
            next.splice(Math.min(ix, next.length), 0, item);
            return next;
          }),
      },
    });
  }

  // Precio unitario editable por línea (como P40 del APEX).
  function cambiarPrecio(id: number, precio: number | null) {
    setCarrito((prev) =>
      prev.map((i) => (i.id_articulo === id ? { ...i, precio: precio ?? 0 } : i)),
    );
  }

  async function onBarra(e: FormEvent) {
    e.preventDefault();
    const cb = codBarra.trim();
    if (!cb) return;
    // Se limpia y se reenfoca de entrada: el próximo escaneo nunca se pega al anterior.
    setCodBarra("");
    barraRef.current?.focus();
    try {
      const art = await buscarArticuloPorBarra(COD_EMPRESA, cb);
      if (art) {
        // El listado trae el precio con descuento (el mismo que al tocar el artículo);
        // el endpoint por código solo resuelve el id y sirve de respaldo si el
        // artículo no está en el listado.
        const delListado = filas.find((a) => a.id_articulo === art.id_articulo);
        agregar(
          delListado ?? {
            id_articulo: art.id_articulo,
            descripcion: art.descripcion,
            id_rubro: null,
            id_marca: null,
            rubro: null,
            marca: null,
            codigo_oem: null,
            precio_venta: art.precio_venta,
            precio_con_descuento: art.precio_venta,
          },
        );
      } else {
        toast.error(`Código de barra ${cb} no encontrado`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al buscar el código");
    }
    barraRef.current?.focus();
  }

  // Contenido del carrito (lista + total + Facturar). Se reutiliza en la columna
  // lateral (desktop) y en el modal del FAB (móvil).
  const carritoContenido = (
    <>
      <div className="hidden items-center gap-2 border-b border-border p-4 lg:flex">
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
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-destructive max-sm:-my-1.5 sm:h-8 sm:w-8"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {(i.descuento > 0 || i.precio < i.precio_lista) && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-emerald-600">
                      {i.descuento > 0 ? `${i.descuento}% desc.` : "Con descuento"}
                    </Badge>
                    <span className="line-through">₲ {fmtGs(i.precio_lista)}</span>
                  </p>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 sm:h-8 sm:w-8"
                      disabled={i.cantidad <= 1}
                      aria-label="Menos"
                      onClick={() => fijarCantidad(i.id_articulo, i.cantidad - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <CantidadInput
                      value={i.cantidad}
                      onChange={(n) => fijarCantidad(i.id_articulo, n)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 sm:h-8 sm:w-8"
                      aria-label="Más"
                      onClick={() => fijarCantidad(i.id_articulo, i.cantidad + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Precio unitario editable */}
                  <InputMonto
                    value={i.precio}
                    onValueChange={(v) => cambiarPrecio(i.id_articulo, v)}
                    maxDecimals={0}
                    className="h-11 w-28 font-mono text-base sm:h-8 sm:w-24 sm:text-xs"
                  />
                </div>
                <div className="mt-1 text-right font-mono text-sm font-semibold">
                  ₲ {fmtGs(i.precio * i.cantidad)}
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
          onClick={() => {
            setVerCarrito(false);
            setModal("cobro");
          }}
          className="w-full bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Facturar
        </Button>
      </div>
    </>
  );

  const facetas = (
    <>
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
    </>
  );

  return (
    // Con carrito, en celular se deja lugar al final para que la barra inferior no tape el último artículo.
    <div
      className={`grid gap-4 lg:grid-cols-[1fr_360px] ${carrito.length > 0 ? "max-sm:pb-20" : ""}`}
    >
      {/* Panel de artículos: facetas + lista */}
      <div className="rounded-2xl border border-border bg-card shadow-elegant">
        <div className="space-y-3 border-b border-border p-4 sm:p-5">
          <h2 className="font-display text-xl font-bold">Punto de Venta</h2>
          <div className="flex flex-wrap items-end gap-3">
            <form onSubmit={onBarra} className="relative min-w-0 flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={barraRef}
                value={codBarra}
                onChange={(e) => setCodBarra(e.target.value)}
                placeholder="Escaneá un código de barra..."
                className="h-11 pl-11"
                autoComplete="off"
                aria-label="Código de barra"
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
          <p className="text-xs text-muted-foreground">
            El % de descuento se aplica a los artículos que agregues a partir de ahora.
          </p>
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
            {/* Limpia búsqueda + facetas; solo aparece si hay algo activo. */}
            {hayFiltros && (
              <Button variant="outline" size="sm" className="w-full" onClick={limpiarFiltros}>
                <X className="mr-2 h-4 w-4" />
                Limpiar
              </Button>
            )}
            {esCelular ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => setVerFiltros(true)}
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filtros
                {marcaSel.size + rubroSel.size > 0 ? ` (${marcaSel.size + rubroSel.size})` : ""}
              </Button>
            ) : (
              facetas
            )}
          </aside>

          {/* Lista de artículos con imagen */}
          <div className="min-w-0">
            {isLoading ? (
              <div className="grid place-items-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : errorArticulos ? (
              <p className="py-16 text-center text-sm text-destructive">
                {errorArticulos instanceof Error
                  ? errorArticulos.message
                  : "No se pudieron cargar los artículos"}
              </p>
            ) : articulos.length === 0 ? (
              <div className="grid place-items-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  {!hayFiltros
                    ? "No hay artículos con stock."
                    : busqueda.trim()
                      ? `Nada coincide con “${busqueda.trim()}”.`
                      : "Ningún artículo coincide con los filtros."}
                </p>
                {hayFiltros && (
                  <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                    <X className="mr-2 h-4 w-4" />
                    Limpiar
                  </Button>
                )}
              </div>
            ) : (
              // Alto del listado: el doble del original (60vh) para ver más artículos
              // de una. Al pasar de la pantalla, la página scrollea (el carrito es sticky).
              <ul className="max-h-[120vh] divide-y divide-border overflow-auto rounded-xl border border-border">
                {articulosDibujados.map((a) => (
                  // La miniatura es su propio botón (abre la imagen ampliada), por eso la
                  // fila no puede ser un único <button>: el resto es el botón "agregar".
                  <li
                    key={a.id_articulo}
                    className="flex items-center gap-3 p-2.5 transition-colors hover:bg-accent"
                  >
                    <ThumbArticulo id={a.id_articulo} onClick={() => setImgArticulo(a)} />
                    <button
                      type="button"
                      onClick={() => agregar(a)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
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
                {restantes > 0 && (
                  <li className="flex flex-wrap items-center justify-center gap-2 p-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLimite((l) => l + PASO_ARTICULOS)}
                    >
                      Mostrar {Math.min(PASO_ARTICULOS, restantes)} más
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setLimite(articulos.length)}
                    >
                      Mostrar todos ({articulos.length})
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Carrito — columna lateral en desktop, oculta en móvil (se abre por FAB). */}
      <div className="hidden flex-col rounded-2xl border border-border bg-card shadow-elegant lg:flex lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        {carritoContenido}
      </div>

      {/* Celular: barra inferior a lo ancho con total e ítems; abre el carrito. */}
      {carrito.length > 0 && (
        <button
          type="button"
          onClick={() => setVerCarrito(true)}
          className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center gap-3 bg-gradient-primary px-4 font-semibold text-primary-foreground shadow-glow sm:hidden"
        >
          <ShoppingCart className="h-5 w-5" />
          <span>Ver carrito</span>
          <Badge className="bg-primary-foreground/20 text-primary-foreground">
            {carrito.reduce((a, i) => a + i.cantidad, 0)} ítems
          </Badge>
          <span className="ml-auto tabular-nums">₲ {fmtGs(total)}</span>
        </button>
      )}

      {/* Tablet: botón flotante que abre el carrito. */}
      {carrito.length > 0 && (
        <Button
          type="button"
          onClick={() => setVerCarrito(true)}
          className="fixed bottom-5 right-5 z-40 hidden h-14 rounded-full bg-gradient-primary px-5 font-semibold text-primary-foreground shadow-glow sm:flex lg:hidden"
        >
          <ShoppingCart className="mr-2 h-5 w-5" />
          <span className="tabular-nums">₲ {fmtGs(total)}</span>
          <Badge className="ml-2 bg-primary-foreground/20 text-primary-foreground">
            {carrito.length}
          </Badge>
        </Button>
      )}

      {/* Celular: facetas Marca y Rubro en una hoja. */}
      {esCelular && (
        <Sheet open={verFiltros} onOpenChange={setVerFiltros}>
          <SheetContent side="bottom" className="max-h-[85vh] space-y-4 overflow-auto">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            {facetas}
            <div className="flex gap-2">
              {hayFiltros && (
                <Button variant="outline" className="h-11 flex-1" onClick={limpiarFiltros}>
                  Limpiar
                </Button>
              )}
              <Button className="h-11 flex-1" onClick={() => setVerFiltros(false)}>
                Ver {articulos.length} artículos
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Confirmación al salir con el carrito cargado. */}
      {bloqueo.status === "blocked" && !atrasCierraDialogo && (
        <Dialog open onOpenChange={(o) => !o && bloqueo.reset()}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>¿Salir del Punto de Venta?</DialogTitle>
              <DialogDescription>
                Tenés {carrito.length} {carrito.length === 1 ? "artículo" : "artículos"} en el
                carrito. Si salís, se pierden.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => bloqueo.reset()}>
                Seguir vendiendo
              </Button>
              <Button variant="destructive" onClick={() => bloqueo.proceed()}>
                Salir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Carrito en modal (móvil). */}
      {verCarrito && (
        <Dialog open onOpenChange={(o) => !o && setVerCarrito(false)}>
          <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md lg:hidden">
            <DialogHeader className="border-b border-border p-4">
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" /> Carrito
              </DialogTitle>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col">{carritoContenido}</div>
          </DialogContent>
        </Dialog>
      )}

      {/* Imagen ampliada del artículo (click en la miniatura). */}
      <ArticuloImgModal
        open={imgArticulo != null}
        id={imgArticulo ? String(imgArticulo.id_articulo) : null}
        titulo={imgArticulo?.descripcion}
        onClose={() => setImgArticulo(null)}
      />

      {modal === "cobro" && (
        <FacturarDialog
          total={total}
          detalle={carrito}
          vendedorDefault={sesion?.app_user ?? ""}
          onClose={() => setModal("cerrado")}
          onDone={(idFactura, vuelto) => {
            toast.success(
              `Venta registrada · Factura ${idFactura}` +
                (vuelto > 0 ? ` · Vuelto ₲ ${fmtGs(vuelto)}` : ""),
              { duration: vuelto > 0 ? 10000 : undefined },
            );
            setCarrito([]);
            setVerCarrito(false);
            setModal("cerrado");
            // Tras cerrar el diálogo, el foco vuelve al campo para el próximo escaneo.
            setTimeout(() => barraRef.current?.focus(), 150);
          }}
        />
      )}
    </div>
  );
}

// Cantidad editable de una línea del carrito: se puede tipear; vacío o 0 se
// corrige al salir del campo (mínimo 1).
function CantidadInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <Input
      inputMode="numeric"
      aria-label="Cantidad"
      value={texto ?? String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, "").slice(0, 6);
        setTexto(t);
        const n = Number(t);
        if (n >= 1) onChange(n);
      }}
      onBlur={() => setTexto(null)}
      className="h-11 w-14 px-1 text-center font-mono text-base sm:h-8 sm:w-12 sm:text-sm"
    />
  );
}

// Miniatura del artículo con fallback a un ícono si no hay imagen. Con imagen es
// un botón que abre el modal con la imagen ampliada (sin agregar al carrito).
function ThumbArticulo({ id, onClick }: { id: number; onClick: () => void }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <ShoppingCart className="h-4 w-4" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver imagen"
      aria-label="Ver imagen del artículo"
      className="shrink-0 rounded-lg"
    >
      <img
        src={imgArticuloUrl(String(id))}
        alt=""
        loading="lazy"
        onError={() => setOk(false)}
        className="h-10 w-10 rounded-lg border border-border object-contain"
      />
    </button>
  );
}

// ─── Dialog de facturación: datos de factura + formas de cobro ───────────────

function FacturarDialog({
  total,
  detalle,
  vendedorDefault,
  onClose,
  onDone,
}: {
  total: number;
  detalle: ItemCarrito[];
  vendedorDefault: string;
  onClose: () => void;
  onDone: (idFactura: number, vuelto: number) => void;
}) {
  // Datos de factura (pág 45). El cliente arranca fijo en "sin cliente" (cod 1):
  // no hace falta consultar la LOV para eso, solo si el cajero lo cambia.
  const [codPersona, setCodPersona] = useState<number | null>(COD_PERSONA_SIN_CLIENTE);
  const [clienteLabel, setClienteLabel] = useState("Sin cliente");
  const [codVendedor, setCodVendedor] = useState<number | null>(null);
  const [idTalonario, setIdTalonario] = useState<number | null>(null);
  const [nroTelefono, setNroTelefono] = useState("");
  const [modeloVehiculo, setModeloVehiculo] = useState("");
  // Cobros (pág 47)
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  // Arma el cobro del subformulario (si está completo) para agregarlo sin tocar "Agregar cobro".
  const armarCobroRef = useRef<(() => Cobro | null) | null>(null);
  // Cliente, vendedor y talonario ya vienen cargados: al abrir se va directo a la
  // forma de cobro (se enfoca y se desplaza hasta ahí).
  const formaCobroRef = useRef<HTMLButtonElement>(null);

  const { data: vendedores } = useQuery({
    queryKey: ["vendedores", COD_EMPRESA],
    queryFn: () => listarVendedores(COD_EMPRESA),
    retry: false,
  });

  // Solo los vendedores activos (estado 'S') se ofrecen en la lista.
  const vendedoresActivos = useMemo(
    () => (vendedores ?? []).filter((v) => (v.estado ?? "").toUpperCase() === "S"),
    [vendedores],
  );

  // Autocarga del vendedor por usuario (pág 45, DA "Vendedor": cod_usuario =
  // app_user). Solo una vez, al llegar los vendedores, si aún no se eligió uno.
  const [vendedorAuto, setVendedorAuto] = useState(false);
  if (!vendedorAuto && vendedores && codVendedor == null) {
    setVendedorAuto(true);
    const propio = vendedoresActivos.find(
      (v) => (v.cod_usuario ?? "").toUpperCase() === vendedorDefault.toUpperCase(),
    );
    if (propio) setCodVendedor(propio.cod_vendedor);
  }
  const { data: talonarios } = useQuery({
    queryKey: ["talonarios", COD_EMPRESA],
    queryFn: () => listarTalonarios(COD_EMPRESA),
    retry: false,
  });

  // Serie/talonario por defecto: la serie "A" (prefiere la activa). Igual que el
  // vendedor, se aplica una sola vez y se puede cambiar.
  const [talonarioAuto, setTalonarioAuto] = useState(false);
  if (!talonarioAuto && talonarios && idTalonario == null) {
    setTalonarioAuto(true);
    const esSerieA = (t: { ser_timbrado: string | null }) =>
      (t.ser_timbrado ?? "").trim().toUpperCase() === "A";
    const serieA =
      talonarios.find((t) => esSerieA(t) && (t.activo ?? "").toUpperCase() === "S") ??
      talonarios.find(esSerieA);
    if (serieA) setIdTalonario(serieA.id_talonario);
  }

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
    // Cabecera
    if (!codPersona) return setError("Elegí el cliente");
    if (!codVendedor) return setError("Elegí el vendedor");
    if (!idTalonario || !talonario) return setError("Elegí la serie/talonario");
    // Detalle
    if (detalle.length === 0) return setError("Agregá al menos un artículo");
    if (detalle.some((i) => i.cantidad <= 0))
      return setError("La cantidad de cada artículo debe ser mayor a 0");
    if (detalle.some((i) => i.precio <= 0))
      return setError("El precio de cada artículo debe ser mayor a 0");
    if (total <= 0) return setError("El total de la venta debe ser mayor a 0");
    // Cobros: sin cobros cargados, se toma el subformulario si está completo.
    let lista = cobros;
    if (lista.length === 0) {
      const auto = armarCobroRef.current?.();
      if (auto) {
        lista = [auto];
        setCobros(lista);
      }
    }
    if (lista.length === 0) return setError("Agregá al menos una forma de cobro");
    const cobrado = lista.reduce((a, c) => a + c.total, 0);
    const falta = total - cobrado;
    // El total imputado (suma de cobros) nunca puede superar el total de la venta.
    if (cobrado - total > 0.5)
      return setError(`El cobro no puede superar el total ₲ ${fmtGs(total)}`);
    // Con una sola forma de cobro no se controla el faltante; solo cuando hay varias
    // se valida que la suma de los cobros iguale el total de la venta.
    if (lista.length > 1 && Math.abs(falta) > 0.5)
      return setError(`Falta cobrar ₲ ${fmtGs(falta)}`);

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
          modelo_vehiculo: modeloVehiculo.trim() || null,
        },
        detalle: detalle.map((i) => ({
          id_articulo: i.id_articulo,
          cantidad: i.cantidad,
          precio: i.precio,
          descuento: i.descuento || null,
          precio_lista: i.precio_lista,
        })),
        cobros: lista.map((c) => ({
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
      onDone(
        idFactura,
        lista.reduce((a, c) => a + (c.efectivo_vuelto ?? 0), 0),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la venta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // En vez del primer campo (cliente), el foco arranca en la forma de cobro.
          e.preventDefault();
          formaCobroRef.current?.focus();
          formaCobroRef.current?.scrollIntoView({ block: "center" });
        }}
      >
        <DialogHeader>
          <DialogTitle>Facturar · Total ₲ {fmtGs(total)}</DialogTitle>
          <DialogDescription>Datos de la factura y formas de cobro.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Cliente</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-primary"
                onClick={() => setNuevoCliente(true)}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Nuevo cliente
              </Button>
            </div>
            <BuscadorSelect
              placeholder="Buscar cliente por nombre, RUC o CI..."
              emptyLabel="Sin clientes"
              value={codPersona}
              label={clienteLabel}
              buscar={(q) => buscarClientesPOS(COD_EMPRESA, q)}
              itemKey={(p) => p.cod_persona}
              itemTitle={(p) => p.nombre ?? `Persona ${p.cod_persona}`}
              itemSub={(p) => [p.nro_ruc, p.nro_ci].filter(Boolean).join(" · ") || "—"}
              onSelect={(p) => {
                setCodPersona(p.cod_persona);
                setClienteLabel(p.nombre ?? `Persona ${p.cod_persona}`);
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vendedor">Vendedor</Label>
              <SelectorModal
                id="vendedor"
                titulo="Vendedor"
                descripcion="Elegí el vendedor de la factura."
                icono={UserRound}
                opciones={vendedoresActivos.map((v) => ({
                  valor: v.cod_vendedor,
                  titulo: v.nombre ?? `Vendedor ${v.cod_vendedor}`,
                  sub: v.cod_usuario,
                }))}
                value={codVendedor}
                onSelect={setCodVendedor}
                vacioLabel="No hay vendedores activos."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="talonario">Serie / Talonario</Label>
              <SelectorModal
                id="talonario"
                titulo="Serie / Talonario"
                descripcion="Elegí el talonario con el que se emite."
                icono={FileText}
                opciones={(talonarios ?? []).map((t) => ({
                  valor: t.id_talonario,
                  titulo: t.ser_timbrado,
                  sub: t.nro_timbrado ? `Timbrado ${t.nro_timbrado}` : null,
                }))}
                value={idTalonario}
                onSelect={setIdTalonario}
                vacioLabel="No hay talonarios cargados."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Label htmlFor="modelo">Modelo de vehículo</Label>
              <Input
                id="modelo"
                value={modeloVehiculo}
                onChange={(e) => setModeloVehiculo(e.target.value)}
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
                {(c.efectivo_vuelto ?? 0) > 0 && (
                  <span className="font-mono text-xs font-semibold text-emerald-600">
                    Vuelto ₲ {fmtGs(c.efectivo_vuelto)}
                  </span>
                )}
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
              yaHayCobros={cobros.length > 0}
              onAdd={(c) => setCobros((prev) => [...prev, c])}
              selectRef={formaCobroRef}
              armarRef={armarCobroRef}
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

      {nuevoCliente && (
        <NuevoClienteDialog
          onClose={() => setNuevoCliente(false)}
          onCreado={(cod, nombre) => {
            setCodPersona(cod);
            setClienteLabel(nombre);
            setNuevoCliente(false);
          }}
        />
      )}
    </Dialog>
  );
}

// ─── Alta rápida de cliente (formulario mínimo) ──────────────────────────────

function NuevoClienteDialog({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: (cod: number, nombre: string) => void;
}) {
  const [tipo, setTipo] = useState<"F" | "J">("F");
  const [nombre, setNombre] = useState("");
  const [ci, setCi] = useState("");
  const [ruc, setRuc] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");

  const crear = useMutation({
    mutationFn: (input: PersonaInput) => crearPersona(input),
    onSuccess: (cod, input) => {
      toast.success("Cliente creado");
      onCreado(cod, input.nombre ?? `Persona ${cod}`);
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const n = nombre.trim();
    if (!n) return setError("Escribí el nombre del cliente");
    setError("");
    crear.mutate({
      tipo_persona: tipo,
      nombre: n,
      nombre_fantasia: n,
      sexo: null,
      fec_nacimiento: null,
      nro_telefono: telefono.trim() || null,
      direccion: null,
      nro_ci: ci.trim() || null,
      nro_ruc: ruc.trim() || null,
      ind_cliente_proveedor: "C",
      cod_empresa: COD_EMPRESA,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !crear.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>Cargá lo mínimo; el resto se completa en Personas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={tipo === "F" ? "default" : "outline"}
              className="h-11 sm:h-9"
              onClick={() => setTipo("F")}
            >
              Persona física
            </Button>
            <Button
              type="button"
              variant={tipo === "J" ? "default" : "outline"}
              className="h-11 sm:h-9"
              onClick={() => setTipo("J")}
            >
              Persona jurídica
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nc-nombre">Nombre o razón social</Label>
            <Input
              id="nc-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nc-ci">CI</Label>
              <Input
                id="nc-ci"
                value={ci}
                onChange={(e) => setCi(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-ruc">RUC</Label>
              <Input
                id="nc-ruc"
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nc-tel">Celular</Label>
            <Input
              id="nc-tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={crear.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-form: agregar una forma de cobro ────────────────────────────────────

function AgregarCobro({
  formas,
  restante,
  yaHayCobros,
  onAdd,
  selectRef,
  armarRef,
}: {
  formas: { id_forma: number; descripcion: string | null }[];
  restante: number;
  yaHayCobros: boolean;
  onAdd: (c: Cobro) => void;
  // Ref al selector de forma de cobro: el modal lo enfoca al abrirse.
  selectRef?: Ref<HTMLButtonElement>;
  // El padre lo usa para tomar el cobro pendiente al registrar la venta.
  armarRef?: MutableRefObject<(() => Cobro | null) | null>;
}) {
  const [idForma, setIdForma] = useState<number | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [idBanco, setIdBanco] = useState<number | null>(null);
  const [nroTransaccion, setNroTransaccion] = useState("");
  const [efectivoRecibido, setEfectivoRecibido] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const { data: bancos } = useQuery({ queryKey: ["bancos"], queryFn: listarBancos, retry: false });

  const esEfectivo = idForma === FORMA_EFECTIVO;
  // En efectivo el cajero ingresa lo recibido; se imputa a la venta el mínimo entre
  // lo recibido y lo que falta cobrar, y el excedente es el vuelto. Así el total
  // imputado nunca supera el total de la venta pero se guarda el efectivo real.
  const imputadoEfectivo =
    esEfectivo && efectivoRecibido != null
      ? Math.min(efectivoRecibido, restante)
      : null;
  const vuelto =
    esEfectivo && efectivoRecibido != null
      ? Math.max(efectivoRecibido - restante, 0)
      : null;

  // Al elegir la forma de cobro, el monto se completa con lo que falta cobrar (con un
  // solo cobro, el total de la venta). En efectivo se completa lo recibido (vuelto 0).
  // Si el cajero ya escribió un monto, se respeta; siempre lo puede cambiar.
  function elegirForma(v: number | null) {
    setIdForma(v);
    setErr("");
    if (v == null || restante <= 0) return;
    if (v === FORMA_EFECTIVO) setEfectivoRecibido((prev) => prev ?? restante);
    else setMonto((prev) => prev ?? restante);
  }

  // Arma el cobro con lo cargado y limpia el subformulario; null si no es válido.
  function armar(): Cobro | null {
    setErr("");
    const totalImputado = esEfectivo ? imputadoEfectivo : monto;
    if (!idForma || totalImputado == null || totalImputado <= 0) return null;
    // Solo se controla el monto cuando ya hay otra forma de cobro (reparto entre
    // varias): el primer cobro puede tomar cualquier monto sin tope.
    if (!esEfectivo && yaHayCobros && totalImputado - restante > 0.5) {
      setErr(`Monto permitido: ₲ ${fmtGs(restante)}`);
      return null;
    }
    const desc = formas.find((f) => f.id_forma === idForma)?.descripcion ?? "Cobro";
    const cobro: Cobro = {
      id_forma: idForma,
      desc_forma: desc,
      total: totalImputado,
      id_banco: esEfectivo ? null : idBanco,
      nro_transaccion: esEfectivo ? null : nroTransaccion.trim() || null,
      efectivo_recibido: esEfectivo ? efectivoRecibido : null,
      efectivo_vuelto: vuelto,
      observacion: null,
    };
    setIdForma(null);
    setMonto(null);
    setIdBanco(null);
    setNroTransaccion("");
    setEfectivoRecibido(null);
    return cobro;
  }

  function add() {
    const c = armar();
    if (c) onAdd(c);
  }

  if (armarRef) armarRef.current = armar;

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SelectorModal
          triggerRef={selectRef}
          titulo="Forma de cobro"
          descripcion="Elegí cómo paga el cliente."
          icono={Wallet}
          placeholder="Forma de cobro..."
          opciones={formas.map((f) => ({
            valor: f.id_forma,
            titulo: f.descripcion ?? `Forma ${f.id_forma}`,
          }))}
          value={idForma}
          onSelect={elegirForma}
          vacioLabel="No hay formas de cobro cargadas."
        />
        <InputMonto
          value={esEfectivo ? imputadoEfectivo : monto}
          onValueChange={setMonto}
          maxDecimals={0}
          disabled={esEfectivo}
          placeholder={restante > 0 ? `Máx ${fmtGs(restante)}` : "Monto"}
          className="h-9 font-mono"
        />
      </div>

      {idForma != null &&
        (esEfectivo ? (
          <div className="space-y-2">
            <InputMonto
              value={efectivoRecibido}
              onValueChange={setEfectivoRecibido}
              maxDecimals={0}
              placeholder="Recibido"
              aria-label="Efectivo recibido"
              className="h-11 font-mono sm:h-9"
            />
            <div
              className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${
                (vuelto ?? 0) > 0
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              <span className="text-sm font-medium">Vuelto</span>
              <span className="font-display text-2xl font-bold tabular-nums">
                ₲ {fmtGs(vuelto)}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SelectorModal
              titulo="Banco"
              descripcion="Banco de la transacción."
              icono={Landmark}
              placeholder="Banco..."
              opciones={(bancos ?? []).map((b) => ({
                valor: b.id_banco,
                titulo: b.nombre ?? `Banco ${b.id_banco}`,
              }))}
              value={idBanco}
              onSelect={setIdBanco}
              vacioLabel="No hay bancos cargados."
            />
            <Input
              value={nroTransaccion}
              onChange={(e) => setNroTransaccion(e.target.value)}
              placeholder="Nro transacción"
              className="h-9"
            />
          </div>
        ))}

      {err && <p className="text-xs font-medium text-destructive">{err}</p>}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={
          !idForma ||
          (esEfectivo
            ? efectivoRecibido == null || efectivoRecibido <= 0
            : monto == null || monto <= 0)
        }
        onClick={add}
      >
        <Plus className="mr-2 h-4 w-4" />
        Agregar cobro
      </Button>
    </div>
  );
}
