import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, BadgeCheck } from "lucide-react";
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
import { DataTable, type Column } from "@/components/ui/data-table";
import { InputMonto } from "@/components/ui/input-monto";
import {
  listarCobrosPorAcreditar,
  acreditarCobro,
  type CobroPorAcreditar,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// fecha_cobro puede venir ISO (2026-07-07T14:40:56Z) o texto dd/mm/yyyy.
function fmtFechaHora(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const COLUMNAS: Column<CobroPorAcreditar>[] = [
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
    key: "fecha_cobro",
    header: "Fecha",
    accessor: (r) => r.fecha_cobro ?? "",
    render: (r) => fmtFechaHora(r.fecha_cobro),
    footer: () => "Total",
  },
  {
    key: "desc_forma",
    header: "Forma de cobro",
    accessor: (r) => r.desc_forma ?? "",
    render: (r) => r.desc_forma || "—",
    hideable: false,
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

export function CobrosAcreditarView() {
  const qc = useQueryClient();
  const [aAcreditar, setAAcreditar] = useState<CobroPorAcreditar | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cobros-acreditar", COD_EMPRESA],
    queryFn: () => listarCobrosPorAcreditar(COD_EMPRESA),
    retry: false,
  });

  const filas = data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Acreditación de Cobros</h2>
          <p className="text-sm text-muted-foreground">
            Cheques y transferencias pendientes de acreditar
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar los cobros"}
          </p>
        ) : filas.length === 0 && !isLoading ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BadgeCheck className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">No hay cobros pendientes</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Todos los cheques y transferencias están acreditados.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_cobro}
            initialSort={{ key: "id_cobro", dir: "desc" }}
            exportName="cobros-por-acreditar"
            actions={(r) => (
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary"
                  onClick={() => setAAcreditar(r)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Acreditar
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <AcreditarDialog
        cobro={aAcreditar}
        onClose={() => setAAcreditar(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["cobros-acreditar"] });
          setAAcreditar(null);
        }}
      />
    </div>
  );
}

// ─── Dialog de acreditación ──────────────────────────────────────────────────
// Exportado para reutilizarlo desde la tarjeta del dashboard.

export function AcreditarDialog({
  cobro,
  onClose,
  onSaved,
}: {
  cobro: CobroPorAcreditar | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = cobro != null;
  const [monto, setMonto] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState<number | null>(null);
  if (open && cobro.id_cobro !== lastKey) {
    setLastKey(cobro.id_cobro);
    setMonto(cobro.total); // precarga el total; el usuario puede ajustarlo
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cobro) return;
    setError("");
    if (monto == null) return setError("Indica el monto acreditado");

    setSaving(true);
    try {
      await acreditarCobro(cobro.id_cobro, monto);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo acreditar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acreditar cobro {cobro?.id_cobro}</DialogTitle>
          <DialogDescription>
            {cobro?.desc_forma ?? ""} · {fmtFechaHora(cobro?.fecha_cobro ?? null)} · Total{" "}
            <span className="font-mono font-semibold">{fmtNum(cobro?.total ?? null)}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="monto_acreditado">Monto acreditado</Label>
            <InputMonto
              id="monto_acreditado"
              value={monto}
              onValueChange={setMonto}
              disabled={saving}
              maxDecimals={0}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Precargado con el total; ajustalo si el banco acreditó un monto distinto.
            </p>
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
              Acreditar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
