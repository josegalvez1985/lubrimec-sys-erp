import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  BadgeCheck,
  CreditCard,
  ArrowRightLeft,
  ReceiptText,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listarCobrosPorAcreditar, type CobroPorAcreditar } from "@/lib/api";
import { AcreditarDialog } from "@/components/cobros-acreditar-view";

const COD_EMPRESA = 24;

const fmtGs = (n: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// fecha_cobro puede venir ISO (2026-07-07T14:40:56Z) o texto dd/mm/yyyy.
// Mostrar dd/mm/yyyy HH:mm en hora local.
function fmtFechaHora(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v; // ya venía como texto legible
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Ícono según la forma de cobro (por texto, ya que el select solo trae desc_forma).
function iconoForma(desc: string | null) {
  const d = (desc ?? "").toLowerCase();
  if (d.includes("cheque")) return ReceiptText;
  if (d.includes("transfer")) return ArrowRightLeft;
  return CreditCard; // tarjeta débito/crédito y otros
}

// Tarjeta del dashboard: cobros bancarios (cheques/transferencias/tarjetas)
// pendientes de acreditar (V_COBROS_CLIENTES, id_forma 41/42/21,
// ind_acreditado='N'). Header con total + contador; cada fila abre el modal de
// acreditación (página 111) que hace el UPDATE. Se oculta si no hay pendientes.
export function CobrosAcreditarCard() {
  const qc = useQueryClient();
  const [aAcreditar, setAAcreditar] = useState<CobroPorAcreditar | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cobros-acreditar", COD_EMPRESA],
    queryFn: () => listarCobrosPorAcreditar(COD_EMPRESA),
    retry: false,
  });

  const filas = data ?? [];
  const total = filas.reduce((a, f) => a + (f.total ?? 0), 0);

  // Sin pendientes (y ya cargó): no ocupar espacio en el dashboard.
  if (!isLoading && filas.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
      {/* Header con total y contador */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <BadgeCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold leading-tight">Cobros por acreditar</h3>
            <p className="text-sm text-muted-foreground">
              Cheques, tarjetas y transferencias pendientes
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {filas.length} {filas.length === 1 ? "pendiente" : "pendientes"}
            </span>
          </div>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{fmtGs(total)}</p>
          <p className="text-xs text-muted-foreground">Total pendiente</p>
        </div>
      </div>

      {/* Lista de cobros como chips */}
      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando...
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((f) => {
            const Icono = iconoForma(f.desc_forma);
            return (
              <li
                key={f.id_cobro}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Icono className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.desc_forma ?? "Sin forma"}</p>
                  <p className="text-xs text-muted-foreground">{fmtFechaHora(f.fecha_cobro)}</p>
                </div>
                <span className="shrink-0 font-mono font-semibold tabular-nums">
                  {fmtGs(f.total ?? 0)}
                </span>
                <Button
                  size="sm"
                  className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
                  onClick={() => setAAcreditar(f)}
                >
                  Acreditar
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

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
