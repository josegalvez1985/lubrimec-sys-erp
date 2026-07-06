import { useState, type FormEvent, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, Coins, ImagePlus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import {
  listarMonedas,
  crearMoneda,
  actualizarMoneda,
  eliminarMoneda,
  listarMonedaDetalle,
  guardarMonedaDetalle,
  eliminarMonedaDetalle,
  type Moneda,
  type MonedaInput,
  type MonedaDetalle,
} from "@/lib/api";

const fmt = (n: number | null) => (n == null ? "" : n.toLocaleString("es-PY"));

export function MonedasView() {
  const qc = useQueryClient();
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [modalMoneda, setModalMoneda] = useState<
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; moneda: Moneda }
  >({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Moneda | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["monedas"],
    queryFn: listarMonedas,
    retry: false,
  });
  const monedas = data ?? [];

  const eliminarMut = useMutation({
    mutationFn: (cod: number) => eliminarMoneda(cod),
    onSuccess: (_r, cod) => {
      qc.invalidateQueries({ queryKey: ["monedas"] });
      if (seleccion === cod) setSeleccion(null);
      setAEliminar(null);
    },
  });

  const monedaSel = monedas.find((m) => m.cod_moneda === seleccion) ?? null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Panel maestro: lista de monedas */}
      <aside className="w-full shrink-0 rounded-2xl border border-border bg-card shadow-elegant lg:w-72">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-lg font-bold">Monedas</h2>
          <Button size="sm" onClick={() => setModalMoneda({ mode: "create" })} className="gap-1">
            <Plus className="h-4 w-4" /> Nueva
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Error al cargar"}
          </p>
        ) : monedas.length === 0 ? (
          <div className="grid place-items-center gap-2 py-12 text-center text-muted-foreground">
            <Coins className="h-8 w-8" />
            <p className="text-sm">Sin monedas. Creá la primera.</p>
          </div>
        ) : (
          <ul className="p-2">
            {monedas.map((m) => (
              <li key={m.cod_moneda}>
                <button
                  type="button"
                  onClick={() => setSeleccion(m.cod_moneda)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                    seleccion === m.cod_moneda ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.siglas ?? "—"} · {m.cant_detalle} denom.
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Panel detalle */}
      <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card shadow-elegant">
        {!monedaSel ? (
          <div className="grid place-items-center gap-3 py-24 text-center text-muted-foreground">
            <Coins className="h-10 w-10" />
            <p className="text-sm">Seleccioná una moneda para ver sus denominaciones.</p>
          </div>
        ) : (
          <DetalleMoneda
            moneda={monedaSel}
            onEditar={() => setModalMoneda({ mode: "edit", moneda: monedaSel })}
            onEliminar={() => setAEliminar(monedaSel)}
          />
        )}
      </div>

      {/* Modal cabecera crear/editar */}
      <MonedaDialog
        state={modalMoneda}
        onClose={() => setModalMoneda({ mode: "closed" })}
        onSaved={(cod) => {
          qc.invalidateQueries({ queryKey: ["monedas"] });
          setModalMoneda({ mode: "closed" });
          if (cod) setSeleccion(cod);
        }}
      />

      {/* Confirmación eliminar moneda */}
      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar moneda?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.descripcion}</span> y todas
              sus denominaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.cod_moneda);
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

// ─── Panel de detalle (denominaciones) ───────────────────────────────────────

export function DetalleMoneda({
  moneda,
  onEditar,
  onEliminar,
}: {
  moneda: Moneda;
  // Sin handlers (ej. página 83): no se muestran los botones de cabecera.
  onEditar?: () => void;
  onEliminar?: () => void;
}) {
  const qc = useQueryClient();
  const [modalDetalle, setModalDetalle] = useState(false);
  const [aBorrar, setABorrar] = useState<MonedaDetalle | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["moneda-detalle", moneda.cod_moneda],
    queryFn: () => listarMonedaDetalle(moneda.cod_moneda),
    retry: false,
  });
  const detalle = data ?? [];

  const borrarMut = useMutation({
    mutationFn: (valor: number) => eliminarMonedaDetalle(moneda.cod_moneda, valor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moneda-detalle", moneda.cod_moneda] });
      qc.invalidateQueries({ queryKey: ["monedas"] });
      setABorrar(null);
    },
  });

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold">{moneda.descripcion}</h2>
            {moneda.siglas && <Badge variant="outline">{moneda.siglas}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {moneda.decimales ?? 0} decimales · {detalle.length} denominaciones
          </p>
        </div>
        {(onEditar || onEliminar) && (
          <div className="flex gap-1">
            {onEditar && (
              <Button variant="outline" size="sm" onClick={onEditar} className="gap-1">
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
            {onEliminar && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={onEliminar}
                aria-label="Eliminar moneda"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Denominaciones</h3>
          <Button size="sm" onClick={() => setModalDetalle(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : detalle.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin denominaciones. Agregá la primera.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {detalle.map((d) => (
              <div
                key={d.valor}
                className="group relative overflow-hidden rounded-xl border border-border bg-background"
              >
                <div className="grid h-24 place-items-center bg-muted/40">
                  {d.imagen_base64 ? (
                    <img
                      src={`data:${d.mime_type ?? "image/png"};base64,${d.imagen_base64}`}
                      alt={`Denominación ${d.valor}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="text-sm font-semibold tabular-nums">{fmt(d.valor)}</span>
                  <button
                    type="button"
                    onClick={() => setABorrar(d)}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Eliminar denominación"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal agregar denominación */}
      <DetalleDialog
        open={modalDetalle}
        codMoneda={moneda.cod_moneda}
        valoresExistentes={detalle.map((d) => d.valor)}
        onClose={() => setModalDetalle(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["moneda-detalle", moneda.cod_moneda] });
          qc.invalidateQueries({ queryKey: ["monedas"] });
          setModalDetalle(false);
        }}
      />

      {/* Confirmación borrar denominación */}
      <AlertDialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar denominación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la denominación{" "}
              <span className="font-semibold">{fmt(aBorrar?.valor ?? null)}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aBorrar) borrarMut.mutate(aBorrar.valor);
              }}
              disabled={borrarMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {borrarMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Modal cabecera ──────────────────────────────────────────────────────────

function MonedaDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { mode: "closed" } | { mode: "create" } | { mode: "edit"; moneda: Moneda };
  onClose: () => void;
  onSaved: (cod?: number) => void;
}) {
  const open = state.mode !== "closed";
  const moneda = state.mode === "edit" ? state.moneda : null;

  const [descripcion, setDescripcion] = useState("");
  const [siglas, setSiglas] = useState("");
  const [decimales, setDecimales] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${moneda?.cod_moneda ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setDescripcion(moneda?.descripcion ?? "");
    setSiglas(moneda?.siglas ?? "");
    setDecimales(moneda?.decimales != null ? String(moneda.decimales) : "0");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: MonedaInput = {
        descripcion: descripcion.trim() || null,
        siglas: siglas.trim() || null,
        decimales: decimales.trim() === "" ? null : Number(decimales),
      };
      if (state.mode === "edit") {
        await actualizarMoneda(state.moneda.cod_moneda, input);
        onSaved(state.moneda.cod_moneda);
      } else {
        const cod = await crearMoneda(input);
        onSaved(cod);
      }
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
          <DialogTitle>{state.mode === "edit" ? "Editar moneda" : "Nueva moneda"}</DialogTitle>
          <DialogDescription>Datos de la moneda (cabecera).</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Guaraní, Dólar..."
              disabled={saving}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="siglas">Siglas</Label>
              <Input
                id="siglas"
                value={siglas}
                onChange={(e) => setSiglas(e.target.value.toUpperCase())}
                placeholder="PYG, USD..."
                maxLength={5}
                disabled={saving}
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="decimales">Decimales</Label>
              <Input
                id="decimales"
                type="number"
                min={0}
                value={decimales}
                onChange={(e) => setDecimales(e.target.value)}
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

// ─── Modal denominación (detalle) ────────────────────────────────────────────

function DetalleDialog({
  open,
  codMoneda,
  valoresExistentes,
  onClose,
  onSaved,
}: {
  open: boolean;
  codMoneda: number;
  valoresExistentes: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [valor, setValor] = useState("");
  const [imagen, setImagen] = useState<{ base64: string; nombre: string; mime: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setValor("");
    setImagen(null);
    setError("");
  }
  if (!open && wasOpen) setWasOpen(false);

  async function onImagen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    setImagen({ base64: btoa(bin), nombre: file.name, mime: file.type || "image/png" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const v = Number(valor);
    if (!valor.trim() || Number.isNaN(v)) {
      setError("Ingresá un valor numérico.");
      return;
    }
    if (valoresExistentes.includes(v)) {
      setError("Ya existe una denominación con ese valor.");
      return;
    }
    setSaving(true);
    try {
      await guardarMonedaDetalle(codMoneda, {
        valor: v,
        imagen_base64: imagen?.base64 ?? null,
        nombre_imagen: imagen?.nombre ?? null,
        mime_type: imagen?.mime ?? null,
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
          <DialogTitle>Nueva denominación</DialogTitle>
          <DialogDescription>Valor e imagen del billete/moneda.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="valor">Valor</Label>
            <Input
              id="valor"
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ej. 50000"
              disabled={saving}
              required
              autoFocus
              className="tabular-nums"
            />
          </div>

          <div className="space-y-2">
            <Label>Imagen</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              {imagen ? (
                <img
                  src={`data:${imagen.mime};base64,${imagen.base64}`}
                  alt="Previsualización"
                  className="max-h-24 object-contain"
                />
              ) : (
                <>
                  <ImagePlus className="h-5 w-5" /> Subir imagen
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={onImagen}
                className="hidden"
                disabled={saving}
              />
            </label>
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
