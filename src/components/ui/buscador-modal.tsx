import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Selector de FK en MODAL propio, con buscador. Tercer selector del proyecto; elegir
// según el catálogo y el espacio:
//   - `ui/selector-modal.tsx`  → catálogo CORTO, modal de tarjetas, sin buscar.
//   - `ui/buscador-select.tsx` → catálogo grande, dropdown inline bajo el input.
//   - este                     → catálogo grande en un modal aparte, cuando el
//                                dropdown inline queda incómodo (formularios chicos,
//                                móvil) o se quiere ver la lista en grande.
//
// Sigue la regla de LOVs del proyecto: la prop `buscar` recibe el catálogo COMPLETO
// del endpoint y filtra en el front (multi-palabra en cualquier orden, ID/OEM
// parcial, sin tope). El filtro no recorta nada; solo se DIBUJAN de a 50
// resultados (con "Mostrar más"), porque dibujar el catálogo entero (1.100
// artículos) en cada tecla trababa el modal.
//
// Igual que `buscador-select`: el catálogo se consulta UNA vez por apertura
// (`buscar("")`) y el texto filtra en memoria. Antes el texto iba en la queryKey y
// cada término re-descargaba el catálogo completo de Oracle.
const PASO_ITEMS = 50;

export function BuscadorModal<T>({
  id,
  titulo,
  descripcion,
  placeholder,
  buscarPlaceholder,
  emptyLabel,
  buscar,
  itemKey,
  itemTitle,
  itemSub,
  onSelect,
  label,
  disabled,
}: {
  id?: string;
  titulo: string; // título del modal
  descripcion?: string;
  placeholder: string; // texto del botón cuando no hay nada elegido
  buscarPlaceholder: string; // placeholder del input de búsqueda
  emptyLabel: string;
  buscar: (q: string) => Promise<T[]>;
  itemKey: (item: T) => number | string;
  itemTitle: (item: T) => string;
  itemSub: (item: T) => string;
  onSelect: (item: T) => void;
  label: string; // etiqueta de lo ya elegido ("" si no hay nada)
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Al cerrar se limpia la búsqueda: la próxima apertura arranca con la lista completa.
  useEffect(() => {
    if (!abierto) {
      setQ("");
      setQDebounced("");
    }
  }, [abierto]);

  // `descripcion` en la clave: en Inventario resume los filtros (activo/categoría/
  // marca) con los que `buscar` arma el catálogo.
  const { data, isFetching } = useQuery({
    queryKey: ["buscador-modal", titulo, descripcion ?? ""],
    queryFn: () => buscar(""),
    enabled: abierto,
    retry: false,
  });

  // Filtro local, mismo criterio que buscador-select (multi-palabra en cualquier
  // orden, con y sin separadores) sobre lo que el modal muestra de cada ítem.
  const catalogo = useMemo(() => data ?? [], [data]);
  const items = useMemo(() => {
    const tokens = qDebounced.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return catalogo;
    const sinSep = (s: string) => s.replace(/[-/.\s]/g, "");
    return catalogo.filter((it) => {
      const texto = `${itemTitle(it)} ${itemSub(it)}`.toUpperCase();
      const textoSinSep = sinSep(texto);
      return tokens.every((t) => texto.includes(t) || textoSinSep.includes(sinSep(t)));
    });
  }, [catalogo, qDebounced, itemTitle, itemSub]);

  // Cada búsqueda nueva vuelve a los primeros resultados.
  const [limite, setLimite] = useState(PASO_ITEMS);
  const [qLimite, setQLimite] = useState(qDebounced);
  if (qLimite !== qDebounced) {
    setQLimite(qDebounced);
    setLimite(PASO_ITEMS);
  }
  const dibujados = items.slice(0, limite);
  const restantes = items.length - dibujados.length;

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={() => setAbierto(true)}
        disabled={disabled}
        className="flex h-[var(--control-h)] w-full items-center gap-2 rounded-md border border-input bg-background px-[var(--control-px)] text-[length:var(--field-font)] ring-offset-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate text-left", !label && "text-muted-foreground")}>
          {label || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={buscarPlaceholder}
              className="pl-10"
              autoFocus
            />
          </div>

          {/* Alto fijo: la lista scrollea dentro del modal y el buscador queda siempre visible. */}
          <div className="max-h-[50vh] min-h-[12rem] overflow-y-auto rounded-md border border-border">
            {isFetching && catalogo.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              dibujados.map((it) => (
                <button
                  key={itemKey(it)}
                  type="button"
                  onClick={() => {
                    onSelect(it);
                    setAbierto(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent"
                >
                  <span className="text-sm font-medium">{itemTitle(it)}</span>
                  <span className="text-xs text-muted-foreground">{itemSub(it)}</span>
                </button>
              ))
            )}
            {restantes > 0 && (
              <button
                type="button"
                onClick={() => setLimite((l) => l + PASO_ITEMS)}
                className="w-full px-3 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent"
              >
                Mostrar {Math.min(PASO_ITEMS, restantes)} más (quedan {restantes})
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "resultado" : "resultados"}
            {restantes > 0 && ` · mostrando ${dibujados.length}; escribí para afinar`}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
