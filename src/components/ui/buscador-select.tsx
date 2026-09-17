import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// Buscador genérico con debounce para elegir una FK. Sigue la regla de LOVs del
// proyecto: el endpoint `*/buscar` devuelve el catálogo COMPLETO y la función
// `buscar` filtra en el front (multi-palabra en cualquier orden, ID/OEM parcial,
// sin tope). Modelos de uso: selector de artículo/proveedor
// (articulos-proveedores-view), código OEM (vehiculos-repuestos-view).
//
// El texto tipeado NO va en la queryKey (regla del proyecto): como no hay caché,
// cada término nuevo era una consulta entera a Oracle —y las LOVs migradas
// ignoran su `q` al llamar al backend, así que se re-descargaba el MISMO catálogo
// completo en cada tecla—. Ahora se consulta UNA vez por apertura (`buscar("")`)
// y el texto solo filtra en memoria. Pesaba sobre todo en LOVs con subconsultas
// caras, como la de facturas de Precios de Ventas.
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
  filtraEnServidor,
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
  // Solo para las LOVs legado cuyo endpoint filtra por `q` y recorta a 30 filas
  // (personas/buscar, proveedores/buscar, ventas/buscar): ahí el catálogo NO se
  // puede traer entero, así que se sigue consultando por término. Las LOVs
  // migradas (la regla actual) no deben declararlo.
  filtraEnServidor?: boolean;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // El término solo entra en la queryKey de las LOVs legado que filtran en el
  // servidor; en las demás la consulta es una sola por apertura.
  const { data, isFetching } = useQuery({
    queryKey: ["buscador", placeholder, filtraEnServidor ? qDebounced : ""],
    queryFn: () => buscar(filtraEnServidor ? qDebounced : ""),
    enabled: abierto,
    retry: false,
    // Las LOVs traen el catálogo completo y filtran en el front: mientras llega
    // el resultado del nuevo texto, seguir mostrando el anterior en vez de
    // vaciar la lista (evita el parpadeo "Sin artículos" en cada tecla).
    placeholderData: (prev) => prev,
  });

  // Filtro local sobre el catálogo ya traído: mismo criterio flexible que usan
  // las funciones `buscar*` de api.ts (multi-palabra en cualquier orden, con y
  // sin separadores, sin tope de resultados). El texto que se compara sale de
  // las etiquetas que el propio buscador muestra, así lo que se filtra es
  // exactamente lo que el usuario ve.
  const catalogo = data ?? [];
  const items = useMemo(() => {
    if (filtraEnServidor) return catalogo; // ya viene filtrado del backend
    const tokens = qDebounced.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return catalogo;
    const sinSep = (s: string) => s.replace(/[-/.\s]/g, "");
    return catalogo.filter((it) => {
      const texto = `${itemTitle(it)} ${itemSub(it)}`.toUpperCase();
      const textoSinSep = sinSep(texto);
      return tokens.every((t) => texto.includes(t) || textoSinSep.includes(sinSep(t)));
    });
  }, [catalogo, qDebounced, filtraEnServidor, itemTitle, itemSub]);
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
          {/* El spinner solo tapa la lista mientras no hay catálogo: con el
              filtro local, tipear ya no dispara ningún fetch. */}
          {isFetching && catalogo.length === 0 ? (
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
