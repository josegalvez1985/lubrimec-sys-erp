import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutList, Loader2, Package, Search, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  busquedaArticulos,
  busquedaPersonas,
  type ArticuloBusquedaGlobal,
  type PaginaMenu,
  type PersonaBusquedaGlobal,
} from "@/lib/api";
import { coincide, tokensBusqueda } from "@/lib/busqueda";
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
export function BusquedaGlobal({
  onNavigate,
  paginas = [],
}: {
  onNavigate: (pageId: number) => void;
  paginas?: PaginaMenu[];
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  // En el celular el buscador no está en la topbar: se abre con la lupa y ocupa el ancho.
  const [movil, setMovil] = useState(false);
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
      if (contRef.current && !contRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setMovil(false);
      }
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
        const t =
          `${p.nombre ?? ""} ${p.nro_ruc ?? ""} ${p.nro_ci ?? ""} ${p.cod_persona}`.toUpperCase();
        return matchea(t, norm(t), q);
      })
    : [];

  // Pantallas del menú (por nombre): el catálogo ya está en memoria, no hay consulta.
  const pantallas = activo
    ? (() => {
        const tokens = tokensBusqueda(q);
        return paginas
          .filter((p) =>
            coincide(`${p.entry_text ?? ""} ${p.page_title} ${p.parent_entry_text ?? ""}`, tokens),
          )
          .slice(0, 8);
      })()
    : [];

  const cargando = activo && (articulosQ.isLoading || personasQ.isLoading);

  function cerrar() {
    setAbierto(false);
    setMovil(false);
  }

  function elegirPantalla(p: PaginaMenu) {
    cerrar();
    setQ("");
    onNavigate(p.page_id);
  }

  function elegirArticulo(a: ArticuloBusquedaGlobal) {
    setBusquedaInicial(4, a.descripcion ?? String(a.id_articulo));
    cerrar();
    setQ("");
    onNavigate(4);
  }

  function elegirPersona(p: PersonaBusquedaGlobal) {
    setBusquedaInicial(2, p.nombre ?? String(p.cod_persona));
    cerrar();
    setQ("");
    onNavigate(2);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Buscar"
        onClick={() => {
          setMovil(true);
          setAbierto(true);
        }}
      >
        <Search className="h-5 w-5" />
      </Button>
      <div
        ref={contRef}
        className={
          movil
            ? "fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-border bg-background p-3 sm:static sm:z-auto sm:max-w-md sm:flex-1 sm:border-0 sm:bg-transparent sm:p-0"
            : "hidden max-w-md flex-1 sm:flex sm:items-center"
        }
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar pantallas, artículos, clientes..."
            className="h-10 pl-10"
            value={q}
            autoFocus={movil}
            onChange={(e) => {
              setQ(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cerrar();
            }}
          />

          {activo && (
            <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
              {pantallas.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-popover px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">
                    Pantallas ({pantallas.length})
                  </p>
                  {pantallas.map((p) => (
                    <button
                      key={`${p.application_id}-${p.page_id}`}
                      type="button"
                      onClick={() => elegirPantalla(p)}
                      className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <LayoutList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate">{p.entry_text ?? p.page_title}</span>
                        {p.parent_entry_text && (
                          <span className="block text-xs text-muted-foreground">
                            {p.parent_entry_text}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {cargando ? (
                <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                </p>
              ) : articulos.length === 0 && personas.length === 0 && pantallas.length === 0 ? (
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
                              {p.nro_ruc
                                ? ` · RUC ${p.nro_ruc}`
                                : p.nro_ci
                                  ? ` · CI ${p.nro_ci}`
                                  : ""}
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
        {movil && (
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label="Cerrar búsqueda"
            onClick={cerrar}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
    </>
  );
}
