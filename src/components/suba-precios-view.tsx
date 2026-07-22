import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Search, X, Pencil, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InputMonto } from "@/components/ui/input-monto";
import { listarSubaPrecios, crearSubaPrecio, type SubaPrecio, type SubaPrecioInput } from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n)}%`;
const fmtFecha = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const COLUMNAS: Column<SubaPrecio>[] = [
  {
    key: "articulo",
    header: "Artículo",
    accessor: (r) => r.articulo ?? "",
    render: (r) => (
      <div className="flex flex-col">
        <span>{r.articulo ?? "—"}</span>
        {r.codigo_oem && (
          <span className="font-mono text-xs text-muted-foreground">OEM {r.codigo_oem}</span>
        )}
      </div>
    ),
    hideable: false,
  },
  { key: "marca", header: "Marca", accessor: (r) => r.marca ?? "" },
  { key: "rubro", header: "Rubro", accessor: (r) => r.rubro ?? "" },
  {
    key: "stock",
    header: "Stock",
    num: true,
    accessor: (r) => r.stock,
    render: (r) => fmtNum(r.stock),
  },
  {
    key: "precio_compra",
    header: "Precio Compra",
    num: true,
    accessor: (r) => r.precio_compra,
    render: (r) => <span className="font-mono">{fmtNum(r.precio_compra)}</span>,
  },
  {
    key: "precio_venta_anterior",
    header: "Precio Anterior",
    num: true,
    accessor: (r) => r.precio_venta_anterior,
    render: (r) => <span className="font-mono">{fmtNum(r.precio_venta_anterior)}</span>,
  },
  {
    key: "precio_venta",
    header: "Precio",
    num: true,
    accessor: (r) => r.precio_venta,
    render: (r) => <span className="font-mono font-semibold">{fmtNum(r.precio_venta)}</span>,
  },
  {
    key: "porc_recargo",
    header: "Porc Recargo",
    num: true,
    accessor: (r) => r.porc_recargo,
    render: (r) => fmtPct(r.porc_recargo),
  },
  {
    key: "margen",
    header: "Margen",
    num: true,
    accessor: (r) => r.margen,
    render: (r) => fmtPct(r.margen),
  },
  {
    key: "fecha",
    header: "Fecha",
    accessor: (r) => r.fecha ?? "",
    render: (r) => fmtFecha(r.fecha),
  },
];

function Faceta({
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
  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold">{titulo}</div>
      <div className="max-h-60 space-y-1 overflow-auto p-2">
        {valores.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">Sin valores</p>
        ) : (
          valores.map(({ valor, n }) => (
            <label
              key={valor}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={seleccion.has(valor)} onCheckedChange={() => onToggle(valor)} />
              <span className="flex-1 truncate">{valor}</span>
              <span className="text-xs text-muted-foreground">{n}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function SubaPreciosView() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [marcasSel, setMarcasSel] = useState<Set<string>>(new Set());
  const [rubrosSel, setRubrosSel] = useState<Set<string>>(new Set());
  const [editar, setEditar] = useState<SubaPrecio | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["suba-precios", COD_EMPRESA],
    queryFn: () => listarSubaPrecios(COD_EMPRESA),
    retry: false,
  });

  const filas = useMemo(() => data ?? [], [data]);

  // Conteo de facetas sobre las filas ya filtradas por las OTRAS facetas + búsqueda.
  const coincide = (r: SubaPrecio, ignora: "marca" | "rubro" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const txt = `${r.articulo ?? ""} ${r.marca ?? ""} ${r.rubro ?? ""} ${r.codigo_oem ?? ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (ignora !== "marca" && marcasSel.size > 0 && !marcasSel.has(r.marca ?? "")) return false;
    if (ignora !== "rubro" && rubrosSel.size > 0 && !rubrosSel.has(r.rubro ?? "")) return false;
    return true;
  };

  const facetMarcas = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filas) if (coincide(r, "marca") && r.marca) c.set(r.marca, (c.get(r.marca) ?? 0) + 1);
    return [...c.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, marcasSel, rubrosSel]);

  const facetRubros = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of filas) if (coincide(r, "rubro") && r.rubro) c.set(r.rubro, (c.get(r.rubro) ?? 0) + 1);
    return [...c.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, marcasSel, rubrosSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, marcasSel, rubrosSel],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setMarcasSel(new Set());
    setRubrosSel(new Set());
  };

  const hayFiltro = busqueda.trim() !== "" || marcasSel.size > 0 || rubrosSel.size > 0;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Suba de Precios</h2>
          <p className="text-sm text-muted-foreground">
            Último precio por artículo con margen y stock
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
          {error instanceof Error ? error.message : "No se pudieron cargar los precios"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <TrendingUp className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Sin precios para mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[240px_1fr]">
          <aside className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar artículo, marca, OEM..."
                className="pl-10"
              />
            </div>
            <Faceta
              titulo="Marca"
              valores={facetMarcas}
              seleccion={marcasSel}
              onToggle={(v) => toggle(marcasSel, setMarcasSel, v)}
            />
            <Faceta
              titulo="Rubro"
              valores={facetRubros}
              seleccion={rubrosSel}
              onToggle={(v) => toggle(rubrosSel, setRubrosSel, v)}
            />
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_precio}
              exportName="suba-precios"
              initialSort={{ key: "margen", dir: "asc" }}
              actions={(r) => (
                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => setEditar(r)}
                    aria-label="Actualizar precio"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      <SubaPrecioDialog
        item={editar}
        onClose={() => setEditar(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["suba-precios"] });
          setEditar(null);
        }}
      />
    </div>
  );
}

// ─── Dialog: actualizar precio (inserta un precio nuevo) ─────────────────────

function SubaPrecioDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SubaPrecio | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = item !== null;

  const [precioCompra, setPrecioCompra] = useState<number | null>(null);
  const [porcRecargo, setPorcRecargo] = useState<number | null>(null);
  const [precioVenta, setPrecioVenta] = useState<number | null>(null);
  const [precioTocado, setPrecioTocado] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState<number | null>(null);
  if (open && item.id_precio !== lastKey) {
    setLastKey(item.id_precio);
    setPrecioCompra(item.precio_compra);
    setPorcRecargo(item.porc_recargo);
    setPrecioVenta(item.precio_venta);
    setPrecioTocado(false);
    setError("");
  }

  // precio_venta = CEIL(((recargo/100)*compra + compra)/1000)*1000  (igual que APEX)
  const recalcular = (compra: number | null, recargo: number | null) =>
    Math.ceil((((recargo ?? 0) / 100) * (compra ?? 0) + (compra ?? 0)) / 1000) * 1000;

  const aplicarRecalculo = (compra: number | null, recargo: number | null) => {
    if (!precioTocado) setPrecioVenta(recalcular(compra, recargo));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError("");
    if (precioVenta == null) return setError("Indica el precio de venta");

    setSaving(true);
    try {
      const input: SubaPrecioInput = {
        id_articulo: item.id_articulo,
        precio_compra: precioCompra,
        porc_recargo: porcRecargo,
        precio_venta: precioVenta,
        cod_empresa: COD_EMPRESA,
      };
      await crearSubaPrecio(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar precio</DialogTitle>
          <DialogDescription>
            {item?.articulo ?? "Artículo"} — se registra un precio nuevo (queda como el vigente).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Precio anterior:{" "}
            <span className="font-mono text-foreground">{fmtNum(item?.precio_venta ?? null)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="precio_compra">Precio Compra</Label>
              <InputMonto
                id="precio_compra"
                value={precioCompra}
                onValueChange={(v) => {
                  setPrecioCompra(v);
                  aplicarRecalculo(v, porcRecargo);
                }}
                disabled={saving}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="porc_recargo">Porc Recargo</Label>
              <InputMonto
                id="porc_recargo"
                value={porcRecargo}
                onValueChange={(v) => {
                  setPorcRecargo(v);
                  aplicarRecalculo(precioCompra, v);
                }}
                disabled={saving}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="precio_venta">Precio Venta</Label>
            <InputMonto
              id="precio_venta"
              value={precioVenta}
              onValueChange={(v) => {
                setPrecioVenta(v);
                setPrecioTocado(true);
              }}
              disabled={saving}
              maxDecimals={0}
              className="font-mono text-base font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Se calcula automáticamente al millar; podés ajustarlo a mano.
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
