import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listarCobrosTarjeta,
  acreditarCobroTarjeta,
  type CobroTarjeta,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtGs = (n: number) =>
  `₲ ${Math.round(n).toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;
// "2026-07-04" -> "04/07/2026" sin construir Date (evita corrimientos de zona).
const fmtFecha = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

// Tarjeta del dashboard: cobros con tarjeta/transferencia pendientes de que el
// banco los acredite. Cada fila abre un modal para cargar el monto acreditado,
// lo que marca el cobro como acreditado y lo saca de la lista.
export function CobrosTarjetaView() {
  const qc = useQueryClient();
  const [cobro, setCobro] = useState<CobroTarjeta | null>(null); // null = modal cerrado
  const [monto, setMonto] = useState("");
  const [lastId, setLastId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cobrosQuery = useQuery({
    queryKey: ["cobros-tarjeta", COD_EMPRESA],
    queryFn: () => listarCobrosTarjeta(COD_EMPRESA),
    retry: false,
  });
  const cobros = cobrosQuery.data ?? [];

  // Sincroniza el input al abrir/cambiar de cobro (patrón lastKey, sin useEffect):
  // por defecto propone el total del cobro como monto acreditado.
  if (cobro && cobro.id_cobro !== lastId) {
    setLastId(cobro.id_cobro);
    setMonto(String(cobro.total ?? ""));
    setError(null);
  }

  const acreditarMut = useMutation({
    mutationFn: (v: { id: number; monto: number }) =>
      acreditarCobroTarjeta(v.id, v.monto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cobros-tarjeta"] });
      setCobro(null);
      setLastId(null);
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : "No se pudo acreditar el cobro"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cobro) return;
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Ingresá un monto válido");
      return;
    }
    acreditarMut.mutate({ id: cobro.id_cobro, monto: n });
  }

  const totalPendiente = cobros.reduce((t, c) => t + (c.total ?? 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <CreditCard className="h-5 w-5 text-primary" />
            Cobros con tarjeta por acreditar
          </h2>
          <p className="text-sm text-muted-foreground">
            {cobrosQuery.isSuccess && cobros.length > 0
              ? `${cobros.length} pendiente${cobros.length === 1 ? "" : "s"} · ${fmtGs(totalPendiente)}`
              : "Cargá el monto que acreditó el banco"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {cobrosQuery.isLoading ? (
          <div className="grid h-32 place-items-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : cobrosQuery.isError ? (
          <p className="grid h-32 place-items-center text-center text-sm text-destructive">
            {cobrosQuery.error instanceof Error
              ? cobrosQuery.error.message
              : "No se pudieron cargar los cobros"}
          </p>
        ) : cobros.length === 0 ? (
          <div className="grid h-32 place-items-center gap-2 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-primary/70" />
            <p className="text-sm">No hay cobros pendientes de acreditar.</p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {cobros.map((c) => (
              <li
                key={c.id_cobro}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.desc_forma}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtFecha(c.fecha_cobro)} · Cobro {c.id_cobro}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtGs(c.total)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setCobro(c)}>
                    Acreditar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal para cargar el monto acreditado */}
      <Dialog
        open={cobro != null}
        onOpenChange={(o) => {
          if (!o) {
            setCobro(null);
            setLastId(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Acreditar cobro</DialogTitle>
            <DialogDescription>
              {cobro
                ? `${cobro.desc_forma} · ${fmtFecha(cobro.fecha_cobro)} · Cobro ${cobro.id_cobro}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total del cobro: </span>
              <span className="font-semibold tabular-nums">
                {cobro ? fmtGs(cobro.total) : ""}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="monto-acreditado">Monto acreditado por el banco</Label>
              <Input
                id="monto-acreditado"
                type="number"
                inputMode="numeric"
                min={0}
                step="any"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCobro(null);
                  setLastId(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={acreditarMut.isPending}>
                {acreditarMut.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
