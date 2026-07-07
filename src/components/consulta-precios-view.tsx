import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanBarcode, Loader2, PackageSearch, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { consultarPrecio, urlImagenArticulo } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtGs = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// Consulta de Precios (pág 61): se escanea/tipea un código de barra y se muestra
// la ficha del artículo (precio, existencia, imagen). Pensado para mostrador.
export function ConsultaPreciosView() {
  const [codBarra, setCodBarra] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofoco al abrir (para escanear directo).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce corto: la pistola "tipea" rápido y cierra con Enter; 250ms alcanza.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(codBarra.trim()), 250);
    return () => clearTimeout(t);
  }, [codBarra]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["consulta-precios", COD_EMPRESA, debounced],
    queryFn: () => consultarPrecio(COD_EMPRESA, debounced),
    enabled: debounced.length > 0,
    retry: false,
  });

  const articulo = debounced.length > 0 ? (data ?? null) : null;
  const sinResultado = debounced.length > 0 && !isFetching && !isError && data == null;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold">Consulta de Precios</h2>
        <p className="text-sm text-muted-foreground">Escaneá o ingresá el código de barra</p>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {/* Input de código de barra */}
        <div className="space-y-2">
          <Label htmlFor="cod_barra">Código de Barra</Label>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="cod_barra"
              ref={inputRef}
              value={codBarra}
              onChange={(e) => setCodBarra(e.target.value)}
              placeholder="Escaneá o escribí el código..."
              className="h-12 pl-11 pr-11 text-lg"
              autoComplete="off"
            />
            {codBarra && (
              <button
                type="button"
                onClick={() => {
                  setCodBarra("");
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Resultado */}
        {debounced.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PackageSearch className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Esperando código</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Escaneá un producto para ver su precio y existencia.
            </p>
          </div>
        ) : isFetching ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Buscando...
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-destructive">
            No se pudo consultar el precio
          </p>
        ) : sinResultado ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <X className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Artículo no encontrado</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              El código <span className="font-mono">{debounced}</span> no corresponde a un artículo
              activo.
            </p>
          </div>
        ) : articulo ? (
          <FichaArticulo articulo={articulo} />
        ) : null}
      </div>
    </div>
  );
}

function FichaArticulo({
  articulo,
}: {
  articulo: NonNullable<Awaited<ReturnType<typeof consultarPrecio>>>;
}) {
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl border-2 border-primary/40 shadow-glow">
      {/* Imagen embebida */}
      {articulo.tiene_imagen ? (
        <div className="grid place-items-center bg-muted/40 p-4">
          <img
            src={urlImagenArticulo(articulo.id_articulo, COD_EMPRESA)}
            alt={articulo.descripcion ?? "Artículo"}
            className="max-h-56 w-auto rounded-lg object-contain"
          />
        </div>
      ) : (
        <div className="grid h-40 place-items-center bg-muted/40 text-muted-foreground">
          <PackageSearch className="h-10 w-10" />
        </div>
      )}

      <div className="space-y-3 p-5 text-center">
        {/* Precio destacado */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Precio de venta</p>
          <p className="font-display text-3xl font-bold tabular-nums text-primary">
            ₲ {fmtGs(articulo.precio_venta)}
          </p>
        </div>

        <h3 className="font-semibold">{articulo.descripcion ?? `Artículo ${articulo.id_articulo}`}</h3>

        {/* Existencia */}
        <div>
          <Badge
            variant="outline"
            className={
              (articulo.existencia ?? 0) > 0
                ? "border-emerald-500/40 text-emerald-600"
                : "border-destructive/40 text-destructive"
            }
          >
            {fmtGs(articulo.existencia)} unidades disponibles
          </Badge>
        </div>

        {/* Atributos */}
        <div className="flex flex-wrap justify-center gap-2 pt-1 text-xs text-muted-foreground">
          {articulo.marca && <span className="rounded-full bg-muted px-2 py-1">{articulo.marca}</span>}
          {articulo.rubro && <span className="rounded-full bg-muted px-2 py-1">{articulo.rubro}</span>}
          {articulo.viscosidad && (
            <span className="rounded-full bg-muted px-2 py-1">{articulo.viscosidad}</span>
          )}
        </div>
      </div>
    </div>
  );
}
