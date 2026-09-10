import { useState, type ComponentType, type Ref } from "react";
import { ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Selector de lista de valores en formato modal con botones (reemplazo del <select>
// nativo). Pensado para catálogos cortos: monedas, billetes, vendedores, talonarios,
// formas de cobro, bancos. Para catálogos grandes (artículos, clientes) va
// `ui/buscador-select.tsx`, que filtra por texto.
//
// Si alguna opción trae `imagen`, las tarjetas muestran la imagen arriba (modelo:
// los billetes de MONEDAS_DETALLE en Conteo de Efectivo); si ninguna la trae, las
// tarjetas son compactas de solo texto.

export type OpcionSelector<T extends string | number> = {
  valor: T;
  titulo: string;
  sub?: string | null; // segunda línea (siglas, nro de timbrado, etc.)
  imagen?: string | null; // data URL o URL de la imagen de la opción
  mono?: boolean; // título en monoespaciada (montos)
};

export function SelectorModal<T extends string | number>({
  id,
  titulo,
  descripcion,
  opciones,
  value,
  onSelect,
  placeholder = "Seleccionar...",
  vacioLabel = "No hay opciones disponibles.",
  disabled,
  icono: Icono,
  triggerRef,
}: {
  id?: string;
  titulo: string; // título del modal
  descripcion?: string;
  opciones: OpcionSelector<T>[];
  value: T | null;
  onSelect: (v: T) => void;
  placeholder?: string;
  vacioLabel?: string;
  disabled?: boolean;
  icono?: ComponentType<{ className?: string }>;
  // Ref al botón disparador (para enfocarlo desde afuera, ej. al abrir un modal).
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const [abierto, setAbierto] = useState(false);
  const sel = opciones.find((o) => o.valor === value) ?? null;
  const hayImagenes = opciones.some((o) => o.imagen);

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        onClick={() => setAbierto(true)}
        disabled={disabled}
        className="flex h-[var(--control-h)] w-full items-center gap-2 rounded-md border border-input bg-background px-[var(--control-px)] text-[length:var(--field-font)] ring-offset-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sel?.imagen && (
          <img
            src={sel.imagen}
            alt=""
            className="h-6 w-10 shrink-0 rounded-sm border border-border object-cover"
          />
        )}
        <span
          className={cn(
            "flex-1 truncate text-left",
            sel?.mono && "font-mono",
            !sel && "text-muted-foreground",
          )}
        >
          {sel ? sel.titulo : placeholder}
        </span>
        {Icono ? (
          <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
          </DialogHeader>

          {opciones.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{vacioLabel}</p>
          ) : (
            <div className={cn("grid gap-3", hayImagenes ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2")}>
              {opciones.map((o) => {
                const activo = o.valor === value;
                return (
                  <button
                    key={String(o.valor)}
                    type="button"
                    onClick={() => {
                      onSelect(o.valor);
                      setAbierto(false);
                    }}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-card text-left shadow-elegant transition-all hover:-translate-y-0.5 hover:shadow-glow",
                      activo ? "border-primary ring-2 ring-primary" : "border-border",
                    )}
                  >
                    {hayImagenes && (
                      <div className="grid h-20 place-items-center bg-muted/40">
                        {o.imagen ? (
                          <img
                            src={o.imagen}
                            alt={o.titulo}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          Icono && <Icono className="h-7 w-7 text-muted-foreground/50" />
                        )}
                      </div>
                    )}
                    <div className={cn("px-3 py-2.5", hayImagenes && "text-center")}>
                      <p className={cn("truncate text-sm font-semibold", o.mono && "font-mono tabular-nums")}>
                        {o.titulo}
                      </p>
                      {o.sub && (
                        <p className="truncate text-xs text-muted-foreground">{o.sub}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
