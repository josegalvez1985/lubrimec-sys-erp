import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { listarMonedas } from "@/lib/api";
import { DetalleMoneda } from "@/components/monedas-view";

// Página 83 (MONEDAS_DETALLE): vista propia del detalle de monedas. Selector de
// moneda arriba; al elegir muestra sus denominaciones (valor + imagen) con
// crear/editar/borrar, reutilizando DetalleMoneda de la página 18 (Monedas).
export function MonedasDetalleView() {
  const [seleccion, setSeleccion] = useState<number | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["monedas"],
    queryFn: listarMonedas,
    retry: false,
  });
  const monedas = data ?? [];
  const monedaSel = monedas.find((m) => m.cod_moneda === seleccion) ?? null;

  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:w-72";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant sm:p-5">
        <Label htmlFor="moneda-sel" className="mb-2 block text-sm font-semibold">
          Moneda
        </Label>
        {isLoading ? (
          <Skeleton className="h-10 w-full sm:w-72" />
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Error al cargar monedas"}
          </p>
        ) : (
          <select
            id="moneda-sel"
            value={seleccion != null ? String(seleccion) : ""}
            onChange={(e) => setSeleccion(e.target.value ? Number(e.target.value) : null)}
            className={selectCls}
          >
            <option value="">Seleccioná una moneda</option>
            {monedas.map((m) => (
              <option key={m.cod_moneda} value={m.cod_moneda}>
                {m.descripcion}
                {m.siglas ? ` (${m.siglas})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-elegant">
        {!monedaSel ? (
          <div className="grid place-items-center gap-3 py-24 text-center text-muted-foreground">
            <Coins className="h-10 w-10" />
            <p className="text-sm">Seleccioná una moneda para ver sus denominaciones.</p>
          </div>
        ) : (
          <DetalleMoneda moneda={monedaSel} />
        )}
      </div>
    </div>
  );
}
