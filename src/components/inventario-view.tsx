import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Boxes, Barcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InputMonto } from "@/components/ui/input-monto";
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
import { DataTable, type Column } from "@/components/ui/data-table";
import { BuscadorSelect } from "@/components/ui/buscador-select";
import {
  listarInventario,
  crearInventario,
  actualizarInventario,
  eliminarInventario,
  lovRubrosInventario,
  lovMarcasInventario,
  buscarArticulosInventario,
  articuloPorBarra,
  type InventarioRow,
  type InventarioInput,
  type RubroLov,
  type MarcaLov,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(v);

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const hoyISO = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
};

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: InventarioRow }
  | { mode: "view"; item: InventarioRow };

export function InventarioView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<InventarioRow | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inventario", COD_EMPRESA],
    queryFn: () => listarInventario(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarInventario(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventario"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_inventario - a.id_inventario);

  const COLUMNAS: Column<InventarioRow>[] = [
    {
      key: "id_inventario",
      header: "ID Inventario",
      num: true,
      accessor: (r) => r.id_inventario,
      render: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.id_inventario}
        </Badge>
      ),
      className: "w-24",
    },
    {
      key: "id_articulo",
      header: "ID",
      num: true,
      accessor: (r) => r.id_articulo,
      className: "w-20",
    },
    {
      key: "articulo",
      header: "Artículo",
      accessor: (r) => r.articulo ?? "",
      render: (r) => r.articulo || "—",
      hideable: false,
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
      accessor: (r) => r.cantidad_fisica ?? 0,
      render: (r) => fmtNum(r.cantidad_fisica),
    },
    {
      key: "cantidad_sistema",
      header: "Cantidad Sistema",
      num: true,
      accessor: (r) => r.cantidad_sistema ?? 0,
      render: (r) => fmtNum(r.cantidad_sistema),
    },
    {
      key: "diferencia",
      header: "Diferencia",
      num: true,
      accessor: (r) => r.diferencia ?? 0,
      render: (r) => (
        <span className={(r.diferencia ?? 0) !== 0 ? "font-semibold text-destructive" : ""}>
          {fmtNum(r.diferencia)}
        </span>
      ),
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
          <h2 className="font-display text-xl font-bold">Inventario</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "conteo registrado" : "conteos registrados"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Crear</span>
          <span className="sm:hidden">Crear</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudo cargar el inventario"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Boxes className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay conteos de inventario</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Registra el primero con el botón “Crear”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_inventario}
            initialSort={{ key: "id_inventario", dir: "desc" }}
            exportName="inventario"
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", item: r })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", item: r })}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAEliminar(r)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        </div>
      )}

      <InventarioDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["inventario"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conteo de inventario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el conteo{" "}
              <span className="font-semibold">#{aEliminar?.id_inventario}</span> de{" "}
              <span className="font-semibold">{aEliminar?.articulo}</span>. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_inventario);
              }}
              disabled={eliminarMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {eliminarMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Dialog de formulario (pág 59 Crear Inventario) ──────────────────────────

function InventarioDialog({
  state,
  onClose,
  onSaved,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode !== "closed";
  const isView = state.mode === "view";
  const item = state.mode === "edit" || state.mode === "view" ? state.item : null;

  // Filtros de la LOV de artículos (región Parametros de la pág 59).
  const [esActivo, setEsActivo] = useState<string | null>("N"); // default APEX
  const [rubro, setRubro] = useState<RubroLov | null>(null);
  const [marca, setMarca] = useState<MarcaLov | null>(null);

  const [idArticulo, setIdArticulo] = useState<number | null>(null);
  const [articuloLabel, setArticuloLabel] = useState("");
  const [codBarra, setCodBarra] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [cantidadFisica, setCantidadFisica] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [buscandoBarra, setBuscandoBarra] = useState(false);

  // Sincroniza el form al abrir según el ítem seleccionado.
  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_inventario ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setEsActivo("N");
    setRubro(null);
    setMarca(null);
    setIdArticulo(item?.id_articulo ?? null);
    setArticuloLabel(item?.articulo ?? "");
    setCodBarra(item?.cod_barra ?? "");
    setFecha(item?.fecha ?? hoyISO());
    setCantidadFisica(item?.cantidad_fisica ?? null);
    setError("");
  }

  // Lector de barras: resuelve el código a su artículo (DA de la pág 59).
  async function resolverBarra() {
    if (!codBarra.trim()) return;
    setBuscandoBarra(true);
    setError("");
    try {
      const a = await articuloPorBarra(COD_EMPRESA, codBarra);
      setIdArticulo(a.id_articulo);
      setArticuloLabel(a.descripcion ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código de barras no registrado");
    } finally {
      setBuscandoBarra(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idArticulo) {
      setError("Selecciona un artículo");
      return;
    }
    if (!fecha) {
      setError("La fecha es obligatoria");
      return;
    }
    if (cantidadFisica == null) {
      setError("La cantidad física es obligatoria");
      return;
    }
    setSaving(true);
    try {
      const input: InventarioInput = {
        cod_empresa: COD_EMPRESA,
        id_articulo: idArticulo,
        fecha,
        cantidad_fisica: cantidadFisica,
        cod_barra: codBarra.trim() || null,
      };
      if (state.mode === "edit") {
        await actualizarInventario(state.item.id_inventario, input);
      } else {
        await crearInventario(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const titulo =
    state.mode === "create"
      ? "Crear Inventario"
      : state.mode === "edit"
        ? "Editar Inventario"
        : "Detalle del conteo";

  // Filtro flexible local sobre las LOVs completas (mayúsc/minúsc).
  const filtrarLov = <T,>(items: T[], q: string, texto: (i: T) => string) => {
    const qn = q.trim().toUpperCase();
    if (!qn) return items;
    return items.filter((i) => texto(i).toUpperCase().includes(qn));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Filtra el artículo, indica la cantidad contada y guarda.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID Inventario:{" "}
              <span className="font-mono text-foreground">{item.id_inventario}</span>
            </div>
          )}

          {!isView && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Filtros del artículo</p>

              <div className="space-y-2">
                <Label>¿El artículo es un Activo?</Label>
                <div className="flex gap-2">
                  {(
                    [
                      ["S", "Sí"],
                      ["N", "No"],
                    ] as const
                  ).map(([v, label]) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={esActivo === v ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setEsActivo(esActivo === v ? null : v)}
                      disabled={saving}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <BuscadorSelect
                        value={rubro?.id_rubro ?? null}
                        label={rubro?.descripcion ?? ""}
                        placeholder="Todas"
                        emptyLabel="Sin resultados"
                        buscar={async (q) =>
                          filtrarLov(
                            await lovRubrosInventario(COD_EMPRESA),
                            q,
                            (r) => `${r.descripcion ?? ""} ${r.id_rubro}`,
                          )
                        }
                        itemKey={(r) => r.id_rubro}
                        itemTitle={(r) => r.descripcion ?? "—"}
                        itemSub={(r) => `ID ${r.id_rubro}`}
                        onSelect={(r) => setRubro(r)}
                        disabled={saving}
                      />
                    </div>
                    {rubro && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        onClick={() => setRubro(null)}
                        aria-label="Quitar categoría"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Marca</Label>
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <BuscadorSelect
                        value={marca?.id_marca ?? null}
                        label={marca?.descripcion ?? ""}
                        placeholder="Todas"
                        emptyLabel="Sin resultados"
                        buscar={async (q) =>
                          filtrarLov(
                            await lovMarcasInventario(COD_EMPRESA),
                            q,
                            (m) => `${m.descripcion ?? ""} ${m.id_marca}`,
                          )
                        }
                        itemKey={(m) => m.id_marca}
                        itemTitle={(m) => m.descripcion ?? "—"}
                        itemSub={(m) => `ID ${m.id_marca}`}
                        onSelect={(m) => setMarca(m)}
                        disabled={saving}
                      />
                    </div>
                    {marca && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        onClick={() => setMarca(null)}
                        aria-label="Quitar marca"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cod_barra">Código de barras</Label>
                <div className="relative">
                  <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cod_barra"
                    value={codBarra}
                    onChange={(e) => setCodBarra(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void resolverBarra();
                      }
                    }}
                    onBlur={() => void resolverBarra()}
                    placeholder="Escanea o escribe y presiona Enter"
                    disabled={saving || buscandoBarra}
                    className="pl-10 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Artículo</Label>
            {isView ? (
              <Input value={articuloLabel} disabled />
            ) : (
              <BuscadorSelect
                key={`art-${esActivo ?? ""}-${rubro?.id_rubro ?? ""}-${marca?.id_marca ?? ""}`}
                value={idArticulo}
                label={articuloLabel}
                placeholder="Buscar artículo por descripción, OEM o ID..."
                emptyLabel="Sin resultados"
                buscar={(q) =>
                  buscarArticulosInventario(COD_EMPRESA, q, {
                    es_activo: esActivo,
                    id_rubro: rubro?.id_rubro ?? null,
                    id_marca: marca?.id_marca ?? null,
                  })
                }
                itemKey={(a) => a.id_articulo}
                itemTitle={(a) => a.descripcion ?? "—"}
                itemSub={(a) =>
                  `ID ${a.id_articulo}${a.codigo_oem ? ` · OEM ${a.codigo_oem}` : ""}`
                }
                onSelect={(a) => {
                  setIdArticulo(a.id_articulo);
                  setArticuloLabel(a.descripcion ?? "");
                }}
                disabled={saving}
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={isView || saving}
                required={!isView}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cantidad_fisica">Cantidad Física</Label>
              <InputMonto
                id="cantidad_fisica"
                value={cantidadFisica}
                onValueChange={setCantidadFisica}
                maxDecimals={2}
                placeholder="0"
                disabled={isView || saving}
              />
            </div>
          </div>

          {isView && item && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cantidad Sistema</Label>
                <Input value={fmtNum(item.cantidad_sistema)} disabled />
              </div>
              <div className="space-y-2">
                <Label>Diferencia</Label>
                <Input value={fmtNum(item.diferencia)} disabled />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            {isView ? (
              <Button type="button" onClick={onClose}>
                Cerrar
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {state.mode === "edit" ? "Aplicar Cambios" : "Crear"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
