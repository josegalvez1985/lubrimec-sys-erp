import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownUp, Loader2, Search, Wrench, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InputMonto } from "@/components/ui/input-monto";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Faceta } from "@/components/ui/faceta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listarInventarioAjustes,
  aplicarAjusteInventario,
  ajustarDiferenciasCero,
  urlFotoInventario,
  type InventarioAjuste,
  type AplicarAjusteInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(v);

const fmtMiles = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(v);

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function AjustarInventariosView() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [cerradoSel, setCerradoSel] = useState<string | null>(null); // 'S' | 'N'
  const [difSel, setDifSel] = useState<string | null>(null); // 'Si' | 'No'
  const [rubroSel, setRubroSel] = useState<Set<string>>(new Set());
  const [marcaSel, setMarcaSel] = useState<Set<string>>(new Set());
  const [aAjustar, setAAjustar] = useState<InventarioAjuste | null>(null);
  const [confirmDif0, setConfirmDif0] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventario-ajustes", COD_EMPRESA],
    queryFn: () => listarInventarioAjustes(COD_EMPRESA),
    retry: false,
  });

  const dif0Mut = useMutation({
    mutationFn: () => ajustarDiferenciasCero(COD_EMPRESA),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["inventario-ajustes"] });
      setConfirmDif0(false);
      toast.success(`Se cerraron ${n} conteo${n === 1 ? "" : "s"} con diferencia 0`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo ajustar"),
  });

  const filas = useMemo(() => data ?? [], [data]);

  const dif = (r: InventarioAjuste) => (r.cant_diferencia !== 0 ? "Si" : "No");

  const coincide = (r: InventarioAjuste, ignora: "rubro" | "marca" | null) => {
    const q = busqueda.trim().toLowerCase();
    if (
      q &&
      !`${r.id_articulo} ${r.descripcion ?? ""} ${r.codigo_oem ?? ""} ${r.rubro ?? ""} ${r.marca ?? ""} ${fmtFecha(r.fecha)}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (cerradoSel !== null && r.cerrado !== cerradoSel) return false;
    if (difSel !== null && dif(r) !== difSel) return false;
    if (ignora !== "rubro" && rubroSel.size > 0 && !rubroSel.has(r.rubro ?? "")) return false;
    if (ignora !== "marca" && marcaSel.size > 0 && !marcaSel.has(r.marca ?? "")) return false;
    return true;
  };

  const facetRubro = useMemo(() => {
    const c = new Set<string>();
    for (const r of filas) if (coincide(r, "rubro") && r.rubro) c.add(r.rubro);
    return [...c].map((valor) => ({ valor, n: 0 })).sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, cerradoSel, difSel, rubroSel, marcaSel]);

  const facetMarca = useMemo(() => {
    const c = new Set<string>();
    for (const r of filas) if (coincide(r, "marca") && r.marca) c.add(r.marca);
    return [...c].map((valor) => ({ valor, n: 0 })).sort((a, b) => a.valor.localeCompare(b.valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, cerradoSel, difSel, rubroSel, marcaSel]);

  const filasFiltradas = useMemo(
    () => filas.filter((r) => coincide(r, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, busqueda, cerradoSel, difSel, rubroSel, marcaSel],
  );

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const limpiar = () => {
    setBusqueda("");
    setCerradoSel(null);
    setDifSel(null);
    setRubroSel(new Set());
    setMarcaSel(new Set());
  };

  const hayFiltro =
    busqueda.trim() !== "" ||
    cerradoSel !== null ||
    difSel !== null ||
    rubroSel.size > 0 ||
    marcaSel.size > 0;

  const totalCosto = filasFiltradas.reduce(
    (acc, r) => acc + r.costo_ultimo * r.cant_diferencia,
    0,
  );

  const COLUMNAS: Column<InventarioAjuste>[] = [
    {
      key: "fec_ultima_compra",
      header: "Fec Última Compra",
      accessor: (r) => r.fec_ultima_compra ?? "",
      render: (r) => fmtFecha(r.fec_ultima_compra),
      className: "w-32",
    },
    {
      key: "codigo_oem",
      header: "Código OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) => <span className="font-mono">{r.codigo_oem || "—"}</span>,
      className: "w-32",
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
      hideable: false,
      render: (r) => (
        <button
          type="button"
          onClick={() => setAAjustar(r)}
          className="text-left font-medium text-primary hover:underline"
        >
          {r.descripcion ?? "—"} ({r.id_articulo})
        </button>
      ),
    },
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha ?? "",
      render: (r) => fmtFecha(r.fecha),
      className: "w-28",
    },
    {
      key: "cantidad_fisica",
      header: "Cantidad Física",
      num: true,
      accessor: (r) => r.cantidad_fisica,
      render: (r) => fmtNum(r.cantidad_fisica),
    },
    {
      key: "cantidad_sistema",
      header: "Cantidad Sistema",
      num: true,
      accessor: (r) => r.cantidad_sistema,
      render: (r) => fmtNum(r.cantidad_sistema),
    },
    {
      key: "cant_diferencia",
      header: "Cant. Diferencia",
      num: true,
      accessor: (r) => r.cant_diferencia,
      render: (r) => (
        <span className={r.cant_diferencia !== 0 ? "font-semibold text-destructive" : ""}>
          {fmtNum(r.cant_diferencia)}
        </span>
      ),
    },
    {
      key: "costo_ultimo",
      header: "Costo Último",
      num: true,
      accessor: (r) => r.costo_ultimo,
      render: (r) => fmtMiles(r.costo_ultimo),
    },
    {
      key: "total_costo",
      header: "Total Costo",
      num: true,
      accessor: (r) => r.costo_ultimo * r.cant_diferencia,
      render: (r) => fmtMiles(r.costo_ultimo * r.cant_diferencia),
    },
    {
      key: "cerrado",
      header: "Cerrado",
      accessor: (r) => (r.cerrado === "S" ? "Sí" : "No"),
      render: (r) =>
        r.cerrado === "S" ? <Badge>Sí</Badge> : <Badge variant="outline">No</Badge>,
      className: "w-20",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Ajustar Inventarios</h2>
          <p className="text-sm text-muted-foreground">
            {filasFiltradas.length} de {filas.length} conteos · Total Costo{" "}
            <span className="font-semibold text-foreground">{fmtMiles(totalCosto)}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {hayFiltro && (
            <Button variant="outline" size="sm" onClick={limpiar}>
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setConfirmDif0(true)}
            disabled={dif0Mut.isPending}
            className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            {dif0Mut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownUp className="mr-2 h-4 w-4" />
            )}
            Ajustar Diferencias 0
          </Button>
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
          {error instanceof Error ? error.message : "No se pudieron cargar los datos"}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Wrench className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">No se ha encontrado ningún dato</p>
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

            <div className="space-y-2">
              <p className="text-sm font-semibold">Cerrado</p>
              <div className="flex gap-2">
                {(
                  [
                    ["S", "Sí"],
                    ["N", "No"],
                  ] as const
                ).map(([v, label]) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={cerradoSel === v ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setCerradoSel(cerradoSel === v ? null : v)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Diferencia</p>
              <div className="flex gap-2">
                {(
                  [
                    ["Si", "Sí"],
                    ["No", "No"],
                  ] as const
                ).map(([v, label]) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={difSel === v ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setDifSel(difSel === v ? null : v)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <Faceta
              titulo="Rubro"
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
          </aside>

          <div className="min-w-0">
            <DataTable
              columns={COLUMNAS}
              rows={filasFiltradas}
              getRowId={(r) => r.id_inventario}
              exportName="ajustar-inventarios"
              initialSort={{ key: "descripcion", dir: "asc" }}
            />
          </div>
        </div>
      )}

      <AjustarDialog
        item={aAjustar}
        onClose={() => setAAjustar(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["inventario-ajustes"] });
          setAAjustar(null);
        }}
      />

      <AlertDialog open={confirmDif0} onOpenChange={(o) => !o && setConfirmDif0(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ajustar los artículos con diferencia 0?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cerrarán todos los conteos con diferencia 0 y se marcará su fecha de último
              inventario. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dif0Mut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                dif0Mut.mutate();
              }}
              disabled={dif0Mut.isPending}
            >
              {dif0Mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ajustar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Modal Aplicar Inventario al Stock (pág 88) ──────────────────────────────

function AjustarDialog({
  item,
  onClose,
  onSaved,
}: {
  item: InventarioAjuste | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = item !== null;
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir: cantidad = diferencia, precio = costo último.
  const [lastId, setLastId] = useState<number | null>(null);
  if (item && item.id_inventario !== lastId) {
    setLastId(item.id_inventario);
    setCantidad(item.cant_diferencia);
    setPrecio(item.costo_ultimo);
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError("");
    if (cantidad == null) {
      setError("La cantidad es obligatoria");
      return;
    }
    if (precio == null) {
      setError("El precio es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const input: AplicarAjusteInput = {
        cod_empresa: COD_EMPRESA,
        id_inventario: item.id_inventario,
        id_articulo: item.id_articulo,
        cantidad,
        precio,
        cod_iva: item.cod_iva,
      };
      await aplicarAjusteInventario(input);
      toast.success("Ajuste aplicado");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar el ajuste");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar Inventario al Stock</DialogTitle>
          <DialogDescription>
            {item?.descripcion ?? ""} ({item?.id_articulo})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aj_cantidad">Cantidad</Label>
              <InputMonto
                id="aj_cantidad"
                value={cantidad}
                onValueChange={setCantidad}
                maxDecimals={2}
                placeholder="0"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aj_precio">Precio</Label>
              <InputMonto
                id="aj_precio"
                value={precio}
                onValueChange={setPrecio}
                maxDecimals={0}
                placeholder="0"
                disabled={saving}
              />
            </div>
          </div>

          {item && item.tiene_foto === 1 && (
            <div className="space-y-2">
              <Label>Foto</Label>
              <img
                src={urlFotoInventario(item.id_inventario, COD_EMPRESA)}
                alt="Foto del inventario"
                className="max-h-64 w-full rounded-lg border border-border object-contain"
              />
            </div>
          )}

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
              Ajustar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
