import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Coins, X } from "lucide-react";
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
import { InputMonto } from "@/components/ui/input-monto";
import {
  getSesion,
  listarConteoEfectivo,
  crearConteoEfectivo,
  actualizarConteoEfectivo,
  eliminarConteoEfectivo,
  obtenerResumenConteo,
  listarMonedas,
  listarMonedasDetalle,
  type ConteoEfectivo,
  type ConteoEfectivoInput,
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
  | { mode: "edit"; item: ConteoEfectivo }
  | { mode: "view"; item: ConteoEfectivo };

const COLUMNAS: Column<ConteoEfectivo>[] = [
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => fmtFecha(r.fecha),
    footer: () => "Total",
  },
  {
    key: "valor",
    header: "Valor",
    num: true,
    accessor: (r) => r.valor,
    render: (r) => <span className="font-mono">{fmtNum(r.valor)}</span>,
    hideable: false,
  },
  {
    key: "cantidad",
    header: "Cantidad",
    num: true,
    accessor: (r) => r.cantidad,
    render: (r) => <span className="font-mono">{fmtNum(r.cantidad)}</span>,
    footer: (rows) => (
      <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.cantidad ?? 0), 0))}</span>
    ),
  },
  {
    key: "total",
    header: "Total",
    num: true,
    accessor: (r) => r.total,
    render: (r) => <span className="font-mono font-semibold">{fmtNum(r.total)}</span>,
    footer: (rows) => (
      <span className="font-mono">{fmtNum(rows.reduce((a, r) => a + (r.total ?? 0), 0))}</span>
    ),
  },
];

export function ConteoEfectivoView() {
  const qc = useQueryClient();
  const sesion = getSesion();
  const appUser = sesion?.app_user ?? "";
  const esAdmin = appUser.toUpperCase() === "JOSEG";

  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<ConteoEfectivo | null>(null);
  const [fecha, setFecha] = useState(""); // filtro por fecha exacta (solo admin)
  const [dias, setDias] = useState(3); // ventana inicial: últimos 3 días

  // Escalones del botón "Mostrar más". 0 = todos.
  const ESCALONES = [3, 7, 15, 30, 0];
  const siguienteEscalon = ESCALONES.find((d) => d > dias || d === 0) ?? 0;

  // La ventana de días solo aplica cuando no hay fecha exacta filtrada.
  const diasEfectivo = fecha ? undefined : dias;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["conteo-efectivo", COD_EMPRESA, appUser, esAdmin ? fecha : "hoy", diasEfectivo],
    queryFn: () =>
      listarConteoEfectivo(COD_EMPRESA, appUser, esAdmin ? fecha : undefined, diasEfectivo),
    retry: false,
  });

  // Fecha efectiva para el panel de control: el filtro, o hoy si no filtró.
  const fechaResumen = fecha || hoy();

  const { data: resumen } = useQuery({
    queryKey: ["conteo-efectivo-resumen", COD_EMPRESA, appUser, fechaResumen],
    queryFn: () => obtenerResumenConteo(COD_EMPRESA, appUser, fechaResumen),
    enabled: esAdmin,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarConteoEfectivo(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conteo-efectivo"] });
      qc.invalidateQueries({ queryKey: ["conteo-efectivo-resumen"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];
  const totalGeneral = filas.reduce((acc, f) => acc + (f.total ?? 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Conteo de Efectivo</h2>
          <p className="text-sm text-muted-foreground">
            {esAdmin ? "Arqueo de caja por fecha" : "Conteo del día"} · Total{" "}
            <span className="font-mono font-semibold text-foreground">{fmtNum(totalGeneral)}</span>
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo conteo</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {esAdmin && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 sm:px-5">
          <div className="space-y-1">
            <Label htmlFor="filtro_fecha" className="text-xs">
              Fecha
            </Label>
            <Input
              id="filtro_fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-44"
            />
          </div>
          {fecha && (
            <Button variant="outline" size="sm" onClick={() => setFecha("")}>
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      )}

      {esAdmin && resumen?.visible && (
        <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4 sm:px-5">
          <TotalCard label="Total en Efectivo del Día" valor={resumen.total_efectivo} tono="verde" />
          <TotalCard label="Otras Formas de Cobro" valor={resumen.no_efectivo} tono="verde" />
          <TotalCard label="Conteo del Día Anterior" valor={resumen.conteo_anterior} tono="azul" />
          <TotalCard label="Pagos a Proveedores" valor={resumen.pagos} tono="rojo" />
          <TotalCard label="Retiro de Efectivo" valor={resumen.retiro_efectivo} tono="rojo" />
          <TotalCard label="Total en Caja" valor={resumen.total_caja} tono="amarillo" />
          <TotalCard label="Total Contado del Día" valor={resumen.total_conteo} tono="azul" />
          <TotalCard label="Diferencia" valor={resumen.diferencia} tono="amarillo" resaltar />
        </div>
      )}

      <div className="p-4 sm:p-5">
        {isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar los conteos"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Coins className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Sin conteos registrados</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo conteo”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_conteo}
            exportName="conteo-efectivo"
            initialSort={{ key: "valor", dir: "asc" }}
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

        {/* Cargar más días (solo admin, sin fecha exacta y si aún no es "todos") */}
        {esAdmin && !fecha && dias !== 0 && filas.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-1">
            <p className="text-xs text-muted-foreground">Mostrando los últimos {dias} días</p>
            <Button variant="outline" size="sm" onClick={() => setDias(siguienteEscalon)}>
              {siguienteEscalon === 0 ? "Mostrar todos" : `Mostrar más (${siguienteEscalon} días)`}
            </Button>
          </div>
        )}
      </div>

      <ConteoDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["conteo-efectivo"] });
      qc.invalidateQueries({ queryKey: ["conteo-efectivo-resumen"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conteo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el conteo de{" "}
              <span className="font-semibold">
                {aEliminar && `${fmtNum(aEliminar.cantidad)} × ${fmtNum(aEliminar.valor)}`}
              </span>
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_conteo);
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

// ─── Tarjeta de total de control ─────────────────────────────────────────────

const TONOS: Record<string, string> = {
  verde: "bg-emerald-500/10 border-emerald-500/30",
  azul: "bg-sky-500/10 border-sky-500/30",
  amarillo: "bg-amber-500/10 border-amber-500/30",
  rojo: "bg-red-500/10 border-red-500/30",
};

function TotalCard({
  label,
  valor,
  tono,
  resaltar,
}: {
  label: string;
  valor: number | undefined;
  tono: keyof typeof TONOS | string;
  resaltar?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${TONOS[tono] ?? ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-mono tabular-nums ${
          resaltar ? "text-lg font-bold" : "text-base font-semibold"
        }`}
      >
        {fmtNum(valor ?? 0)}
      </p>
    </div>
  );
}

// ─── Dialog de formulario ────────────────────────────────────────────────────

function ConteoDialog({
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

  const [fecha, setFecha] = useState(hoy());
  const [codMoneda, setCodMoneda] = useState<number | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: monedas } = useQuery({
    queryKey: ["monedas"],
    queryFn: listarMonedas,
    enabled: open && !isView,
    retry: false,
  });

  // Valores (billetes) de la moneda elegida, con imagen.
  const { data: detalles } = useQuery({
    queryKey: ["monedas-detalle", codMoneda],
    queryFn: () => listarMonedasDetalle(codMoneda as number),
    enabled: open && !isView && codMoneda != null,
    retry: false,
  });

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_conteo ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setFecha(item?.fecha ?? hoy());
    setCodMoneda(item?.cod_moneda ?? 1); // moneda por defecto (Gs) como el APEX
    setValor(item?.valor ?? null);
    setCantidad(item?.cantidad ?? null);
    setError("");
  }

  const detalleSel = (detalles ?? []).find((d) => d.valor === valor);
  const total = (valor ?? 0) * (cantidad ?? 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) return setError("Indica la fecha");
    if (codMoneda == null) return setError("Selecciona la moneda");
    if (valor == null) return setError("Selecciona el valor del billete");
    if (cantidad == null) return setError("Indica la cantidad");

    setSaving(true);
    try {
      const input: ConteoEfectivoInput = {
        fecha,
        valor,
        cantidad,
        cod_moneda: codMoneda,
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarConteoEfectivo(state.item.id_conteo, input);
      } else {
        await crearConteoEfectivo(input);
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
      ? "Nuevo conteo"
      : state.mode === "edit"
        ? "Editar conteo"
        : "Detalle del conteo";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && <DialogDescription>Registra billetes/monedas contados.</DialogDescription>}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
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
              <Label htmlFor="cod_moneda">Moneda</Label>
              {isView ? (
                <Input value={item?.moneda ?? ""} disabled />
              ) : (
                <select
                  id="cod_moneda"
                  value={codMoneda ?? ""}
                  onChange={(e) => {
                    setCodMoneda(e.target.value ? Number(e.target.value) : null);
                    setValor(null);
                  }}
                  disabled={saving}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor del billete</Label>
            {isView ? (
              <Input value={fmtNum(item?.valor ?? null)} disabled className="font-mono" />
            ) : (
              <select
                id="valor"
                value={valor ?? ""}
                onChange={(e) => setValor(e.target.value ? Number(e.target.value) : null)}
                disabled={saving || codMoneda == null}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccionar...</option>
                {(detalles ?? [])
                  .slice()
                  .sort((a, b) => a.valor - b.valor)
                  .map((d) => (
                    <option key={d.valor} value={d.valor}>
                      {fmtNum(d.valor)}
                    </option>
                  ))}
              </select>
            )}
            {/* Imagen del billete elegido */}
            {!isView && detalleSel?.imagen_base64 && (
              <img
                src={`data:${detalleSel.mime_type ?? "image/png"};base64,${detalleSel.imagen_base64}`}
                alt={`Billete ${fmtNum(valor)}`}
                className="mt-1 max-h-24 rounded-md border border-border object-contain"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cantidad">Cantidad</Label>
              <InputMonto
                id="cantidad"
                value={cantidad}
                onValueChange={setCantidad}
                disabled={isView || saving}
                maxDecimals={0}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Total</Label>
              <Input
                value={fmtNum(isView && item ? item.total : total)}
                disabled
                className="font-mono font-semibold"
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
