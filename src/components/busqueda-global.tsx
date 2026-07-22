import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  busquedaArticulos,
  busquedaPersonas,
  type ArticuloBusquedaGlobal,
  type PersonaBusquedaGlobal,
} from "@/lib/api";
import { setBusquedaInicial } from "@/lib/busqueda-inicial";

const COD_EMPRESA = 24;

// Filtro flexible (regla LOV): multi-palabra en cualquier orden, ID parcial,
// RUC/CI con o sin guion/espacios.
const norm = (s: string) => s.toUpperCase().replace(/[-\s]/g, "");

function matchea(texto: string, textoSinSep: string, q: string) {
  const tokens = q.trim().toUpperCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => texto.includes(t) || textoSinSep.includes(norm(t)));
}

// Buscador global del header: busca artículos y clientes a la vez; al elegir
// navega a la vista correspondiente (Artículos pág 4 / Personas pág 2) con la
// búsqueda ya aplicada (via setBusquedaInicial + initialSearch del DataTable).
export function BusquedaGlobal({ onNavigate }: { onNavigate: (pageId: number) => void }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contRef = useRef<HTMLDivElement>(null);

  const activo = abierto && q.trim().length >= 2;

  const articulosQ = useQuery({
    queryKey: ["busqueda-global-articulos", COD_EMPRESA],
    queryFn: () => busquedaArticulos(COD_EMPRESA),
    enabled: activo,
    retry: false,
  });
  const personasQ = useQuery({
    queryKey: ["busqueda-global-personas", COD_EMPRESA],
    queryFn: () => busquedaPersonas(COD_EMPRESA),
    enabled: activo,
    retry: false,
  });

  // Cierra el dropdown al hacer click fuera.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (contRef.current && !contRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const articulos = activo
    ? (articulosQ.data ?? []).filter((a) => {
        const t = `${a.descripcion ?? ""} ${a.codigo_oem ?? ""} ${a.id_articulo}`.toUpperCase();
        return matchea(t, norm(t), q);
      })
    : [];
  const personas = activo
    ? (personasQ.data ?? []).filter((p) => {
        const t = `${p.nombre ?? ""} ${p.nro_ruc ?? ""} ${p.nro_ci ?? ""} ${p.cod_persona}`.toUpperCase();
        return matchea(t, norm(t), q);
      })
    : [];

  const cargando = activo && (articulosQ.isLoading || personasQ.isLoading);

  function elegirArticulo(a: ArticuloBusquedaGlobal) {
    setBusquedaInicial(4, a.descripcion ?? String(a.id_articulo));
    setAbierto(false);
    setQ("");
    onNavigate(4);
  }

  function elegirPersona(p: PersonaBusquedaGlobal) {
    setBusquedaInicial(2, p.nombre ?? String(p.cod_persona));
    setAbierto(false);
    setQ("");
    onNavigate(2);
  }

  return (
    <div ref={contRef} className="relative hidden flex-1 max-w-md sm:block">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar artículos, clientes..."
        className="h-10 pl-10"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
      />

      {activo && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          {cargando ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </p>
          ) : articulos.length === 0 && personas.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            <>
              {articulos.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-popover px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">
                    Artículos ({articulos.length})
                  </p>
                  {articulos.map((a) => (
                    <button
                      key={a.id_articulo}
                      type="button"
                      onClick={() => elegirArticulo(a)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate">{a.descripcion ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">
                          ID {a.id_articulo}
                          {a.codigo_oem ? ` · OEM ${a.codigo_oem}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {personas.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-popover px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">
                    Clientes ({personas.length})
                  </p>
                  {personas.map((p) => (
                    <button
                      key={p.cod_persona}
                      type="button"
                      onClick={() => elegirPersona(p)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate">{p.nombre ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">
                          Cód. {p.cod_persona}
                          {p.nro_ruc ? ` · RUC ${p.nro_ruc}` : p.nro_ci ? ` · CI ${p.nro_ci}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
