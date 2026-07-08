import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, ImageIcon, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import { ArticuloImgModal } from "@/components/articulo-img-modal";
import { listarPreciosMayoristas, urlImagenArticulo, type PrecioMayorista } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

// Thumbnail 60x60 en la grilla (como la columna Imagen del APEX); click = ampliar.
// Si el artículo no tiene imagen (el <img> falla), muestra un ícono apagado.
function ImgCelda({ r, onClick }: { r: PrecioMayorista; onClick: () => void }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    return (
      <div className="grid h-[60px] w-[60px] place-items-center rounded-lg bg-muted text-muted-foreground">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img
      src={urlImagenArticulo(r.id_articulo, COD_EMPRESA)}
      alt={r.articulo ?? "Artículo"}
      loading="lazy"
      className="h-[60px] w-[60px] cursor-pointer rounded-lg object-contain"
      onClick={onClick}
      onError={() => setFallo(true)}
    />
  );
}

export function PreciosMayoristasView() {
  const [busqueda, setBusqueda] = useState("");
  const [marcaSel, setMarcaSel] = useState<Set<string>>(new Set());
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [viscSel, setViscSel] = useState<Set<string>>(new Set());
  const [descuento, setDescuento] = useState("");
  const [imgArticulo, setImgArticulo] = useState<PrecioMayorista | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["precios-mayoristas", COD_EMPRESA],
    queryFn: () => listarPreciosMayoristas(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  // % de descuento aplicado en vivo sobre el precio base (en APEX era el botón "Calcular").
  const porcDesc = Math.min(100, Math.max(0, Number(descuento) || 0));
  const precioConDesc = (r: PrecioMayorista) =>
    r.precio_venta == null ? null : Math.round(r.precio_venta * (1 - porcDesc / 100));

  const coincide = (r: PrecioMayorista, ignora: "marca" | "rubro" | "visc" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (
      q &&
      !`${r.articulo ?? ""} ${r.marca ?? ""} ${r.rubro ?? ""} ${r.viscosidad ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (ignora !== "marca" && marcaSel.size > 0 && !marcaSel.has(r.marca ?? "")) return false;
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(r.rubro ?? "")) return false;
    if (ignora !== "visc" && viscSel.size > 0 && !viscSel.has(r.viscosidad ?? "")) return false;
    return true;
  };

  const facet = (campo: (r: PrecioMayorista) => string | null, ignora: "marca" | "rubro" | "visc") => {
    const c = new Map<string, number>();
    for (const r of filas) {
      const v = campo(r);
      if (coincide(r, ignora) && v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    // n: 0 oculta el conteo (N) en la faceta (preferencia del proyecto).
    return [...c.keys()]
      .map((valor) => ({ valor, n: 0 }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetMarca = useMemo(() => facet((r) => r.marca, "marca"), [filas, busqueda, marcaSel, rubroSel, viscSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetRubro = useMemo(() => facet((r) => r.rubro, "rubro"), [filas, busqueda, marcaSel, rubroSel, viscSel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const facetVisc = useMemo(() => facet((r) => r.viscosidad, "visc"), [filas, busqueda, marcaSel, rubroSel, viscSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, marcaSel, rubroSel, viscSel],
  );

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setMarcaSel(new Set());
    setRubroSel(new Set());
    setViscSel(new Set());
    setDescuento("");
  };

  const hayFiltro =
    busqueda.trim() !== "" ||
    marcaSel.size > 0 ||
    rubroSel.size > 0 ||
    viscSel.size > 0 ||
    descuento !== "";

  const COLUMNAS: Column<PrecioMayorista>[] = [
    {
      key: "img",
      header: "Imagen",
      sortable: false,
      filterable: false,
      className: "w-20",
      render: (r) => <ImgCelda r={r} onClick={() => setImgArticulo(r)} />,
    },
    {
      key: "articulo",
      header: "Artículo",
      accessor: (r) => r.articulo ?? "",
      hideable: false,
    },
    {
      key: "precio",
      header: porcDesc > 0 ? `Precio (-${porcDesc}%)` : "Precio",
      num: true,
      accessor: (r) => precioConDesc(r) ?? 0,
      render: (r) => <span className="font-medium">{fmtNum(precioConDesc(r))}</span>,
    },
    {
      key: "stock",
      header: "Stock",
      num: true,
      accessor: (r) => r.stock ?? 0,
      render: (r) => fmtNum(r.stock),
    },
    {
      key: "cantidad_venta",
      header: "Cantidad Venta",
      num: true,
      accessor: (r) => r.cantidad_venta ?? 0,
      render: (r) => fmtNum(r.cantidad_venta),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Precios Mayoristas</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} artículos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="porc-desc" className="whitespace-nowrap text-sm text-muted-foreground">
            % Descuento
          </label>
          <Input
            id="porc-desc"
            type="number"
            min={0}
            max={100}
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            className="w-24"
            placeholder="0"
          />
          {hayFiltro && (
            <Button variant="outline" size="sm" onClick={limpiar} className="shrink-0">
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los precios"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <BadgePercent className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">No hay artículos con stock para listar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="pl-10"
              />
            </div>
            <Faceta
              titulo="Categoría"
              valores={facetRubro}
              seleccion={rubroSel}
              onToggle={(v) => toggleSet(rubroSel, setRubroSel, v)}
            />
            <Faceta
              titulo="Marca"
              valores={facetMarca}
              seleccion={marcaSel}
              onToggle={(v) => toggleSet(marcaSel, setMarcaSel, v)}
            />
            <Faceta
              titulo="Viscosidad"
              valores={facetVisc}
              seleccion={viscSel}
              onToggle={(v) => toggleSet(viscSel, setViscSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_articulo}
              exportName="precios-mayoristas"
              initialSort={{ key: "cantidad_venta", dir: "desc" }}
            />
          </div>
        </div>
      )}

      <ArticuloImgModal
        open={!!imgArticulo}
        id={imgArticulo ? String(imgArticulo.id_articulo) : null}
        titulo={imgArticulo?.articulo}
        src={imgArticulo ? urlImagenArticulo(imgArticulo.id_articulo, COD_EMPRESA) : undefined}
        onClose={() => setImgArticulo(null)}
      />
    </div>
  );
}
