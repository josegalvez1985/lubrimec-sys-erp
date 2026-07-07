import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

// Faceta del sidebar con el formato visual de "Pedidos de Artículos" (pág 63):
// título simple en negrita, checkboxes con texto muted que resalta al hover,
// conteo entre paréntesis y "Mostrar todo/menos" cuando pasa del límite.
// Usar este componente en toda vista con búsqueda facetada (unifica el look).

const LIMITE = 8;

export function Faceta({
  titulo,
  valores,
  seleccion,
  onToggle,
}: {
  titulo: string;
  valores: { valor: string; n: number }[];
  seleccion: Set<string>;
  onToggle: (v: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const visibles = abierta ? valores : valores.slice(0, LIMITE);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{titulo}</p>
      {visibles.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin opciones</p>
      ) : (
        visibles.map(({ valor, n }) => (
          <label
            key={valor}
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Checkbox checked={seleccion.has(valor)} onCheckedChange={() => onToggle(valor)} />
            <span className="min-w-0 flex-1 truncate">{valor}</span>
            <span className="shrink-0 text-xs">({n})</span>
          </label>
        ))
      )}
      {valores.length > LIMITE && (
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {abierta ? "Mostrar menos" : "Mostrar todo"}
        </button>
      )}
    </div>
  );
}
