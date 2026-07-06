import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// Buscador genérico con debounce para elegir una FK sin cargar todo el catálogo.
// Modelos de uso: selector de artículo/proveedor (articulos-proveedores-view),
// código OEM (vehiculos-repuestos-view). Backend: endpoints `*/buscar` (≤30 filas).
export function BuscadorSelect<T>({
  value,
  label,
  placeholder,
  emptyLabel,
  buscar,
  itemKey,
  itemTitle,
  itemSub,
  onSelect,
  disabled,
}: {
  value: string | number | null;
  label: string;
  placeholder: string;
  emptyLabel: string;
  buscar: (q: string) => Promise<T[]>;
  itemKey: (item: T) => number | string;
  itemTitle: (item: T) => string;
  itemSub: (item: T) => string;
  onSelect: (item: T) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["buscador", placeholder, qDebounced],
    queryFn: () => buscar(qDebounced),
    enabled: abierto,
    retry: false,
  });

  const items = data ?? [];
  const tieneValor = value !== null && value !== "";

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={abierto ? q : tieneValor ? label : q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-10"
        />
      </div>
      {abierto && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {isFetching ? (
            <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          ) : items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            items.map((it) => (
              <button
                key={itemKey(it)}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(it);
                  setAbierto(false);
                  setQ("");
                }}
                className="flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-accent"
              >
                <span className="text-sm font-medium">{itemTitle(it)}</span>
                <span className="text-xs text-muted-foreground">{itemSub(it)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
