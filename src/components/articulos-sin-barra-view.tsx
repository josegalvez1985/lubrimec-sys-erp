import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Barcode, Search, X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import { listarArticulosSinBarra, type ArticuloSinBarra } from "@/lib/api";

const COD_EMPRESA = 24;

export function ArticulosSinBarraView() {
  const [busqueda, setBusqueda] = useState("");
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [imgArticulo, setImgArticulo] = useState<ArticuloSinBarra | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["articulos-sin-barra", COD_EMPRESA],
    queryFn: () => listarArticulosSinBarra(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  const coincide = (r: ArticuloSinBarra, ignora: "rubro" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q && !(r.descripcion ?? "").toLowerCase().includes(q)) return false;
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(r.desc_rubro ?? "")) return false;
    return true;
  };

  const facetRubro = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filas) {
      if (coincide(r, "rubro") && r.desc_rubro) c.set(r.desc_rubro, (c.get(r.desc_rubro) ?? 0) + 1);
    }
    return [...c.entries()]
      .map(([valor, n]) => ({ valor, n }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, rubroSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, rubroSel],
  );

  const toggle = (v: string) => {
    const next = new Set(rubroSel);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setRubroSel(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setRubroSel(new Set());
  };

  const hayFiltro = busqueda.trim() !== "" || rubroSel.size > 0;

  const COLUMNAS: Column<ArticuloSinBarra>[] = [
    {
      key: "img",
      header: "Img",
      sortable: false,
      filterable: false,
      className: "w-14",
      render: (r) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setImgArticulo(r)}
          aria-label="Ver imagen del artículo"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      ),
    },
    {
      key: "id_articulo",
      header: "ID",
      num: true,
      accessor: (r) => r.id_articulo,
      render: (r) => <span className="font-mono">{r.id_articulo}</span>,
      className: "w-20",
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
    },
    {
      key: "desc_rubro",
      header: "Rubro",
      accessor: (r) => r.desc_rubro ?? "",
      render: (r) => r.desc_rubro || "—",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Artículos sin Código de Barra</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} artículos
          </p>
        </div>
        {hayFiltro && (
          <Button variant="outline" size="sm" onClick={limpiar} className="shrink-0">
            <X className="mr-2 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los artículos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Barcode className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Todos los artículos tienen código de barra</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por descripción..."
                className="pl-10"
              />
            </div>
            <Faceta titulo="Rubro" valores={facetRubro} seleccion={rubroSel} onToggle={toggle} />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_articulo}
              exportName="articulos-sin-barra"
              initialSort={{ key: "id_articulo", dir: "desc" }}
            />
          </div>
        </div>
      )}

      <ArticuloImgModal
        open={!!imgArticulo}
        id={imgArticulo ? String(imgArticulo.id_articulo) : null}
        titulo={imgArticulo?.descripcion}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}
