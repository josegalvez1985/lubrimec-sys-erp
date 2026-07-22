import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  listarArticulosProveedores,
  crearArticuloProveedor,
  actualizarArticuloProveedor,
  eliminarArticuloProveedor,
  buscarArticulos,
  buscarProveedores,
  type ArticuloProveedor,
  type ArticuloProveedorInput,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: ArticuloProveedor }
  | { mode: "view"; item: ArticuloProveedor };

export function ArticulosProveedoresView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<ArticuloProveedor | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["articulos-proveedores", COD_EMPRESA],
    queryFn: () => listarArticulosProveedores(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarArticuloProveedor(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["articulos-proveedores"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? [])
    .slice()
    .sort((a, b) => b.id_articulo_proveedor - a.id_articulo_proveedor);

  const COLUMNAS: Column<ArticuloProveedor>[] = [
    {
      key: "id_articulo_proveedor",
      header: "ID",
      num: true,
      accessor: (r) => r.id_articulo_proveedor,
      render: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.id_articulo_proveedor}
        </Badge>
      ),
      className: "w-16",
    },
    {
      key: "descripcion_articulo",
      header: "Artículo",
      accessor: (r) => r.descripcion_articulo ?? "",
      hideable: false,
    },
    {
      key: "codigo_oem",
      header: "Código OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) => (r.codigo_oem ? <span className="font-mono">{r.codigo_oem}</span> : "—"),
    },
    {
      key: "nombre_proveedor",
      header: "Proveedor",
      accessor: (r) => r.nombre_proveedor ?? "",
    },
    {
      key: "id_cod_proveedor",
      header: "Cód. proveedor",
      accessor: (r) => r.id_cod_proveedor ?? "",
      render: (r) => <span className="font-mono">{r.id_cod_proveedor}</span>,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Artículos por proveedor</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "relación" : "relaciones"} registradas
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva relación</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar las relaciones"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Link2 className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay relaciones artículo-proveedor</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Crea la primera con el botón “Nueva relación”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_articulo_proveedor}
            initialSort={{ key: "id_articulo_proveedor", dir: "desc" }}
            exportName="articulos-proveedores"
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

      <ArticuloProveedorDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["articulos-proveedores"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar relación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la relación de{" "}
              <span className="font-semibold">{aEliminar?.descripcion_articulo}</span> con{" "}
              <span className="font-semibold">{aEliminar?.nombre_proveedor}</span>. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_articulo_proveedor);
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

// ─── Dialog de formulario ────────────────────────────────────────────────────

function ArticuloProveedorDialog({
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

  const [idArticulo, setIdArticulo] = useState<number | null>(null);
  const [articuloLabel, setArticuloLabel] = useState("");
  const [codPersona, setCodPersona] = useState<number | null>(null);
  const [proveedorLabel, setProveedorLabel] = useState("");
  const [idCodProveedor, setIdCodProveedor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_articulo_proveedor ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setIdArticulo(item?.id_articulo ?? null);
    setArticuloLabel(
      item ? `${item.descripcion_articulo ?? ""}${item.codigo_oem ? ` (${item.codigo_oem})` : ""}` : "",
    );
    setCodPersona(item?.cod_persona ?? null);
    setProveedorLabel(item?.nombre_proveedor ?? "");
    setIdCodProveedor(item?.id_cod_proveedor ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idArticulo) {
      setError("Selecciona un artículo");
      return;
    }
    if (!codPersona) {
      setError("Selecciona un proveedor");
      return;
    }
    setSaving(true);
    try {
      const input: ArticuloProveedorInput = {
        id_articulo: idArticulo,
        cod_persona: codPersona,
        id_cod_proveedor: idCodProveedor.trim(),
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarArticuloProveedor(state.item.id_articulo_proveedor, input);
      } else {
        await crearArticuloProveedor(input);
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
      ? "Nueva relación artículo-proveedor"
      : state.mode === "edit"
        ? "Editar relación"
        : "Detalle de la relación";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Vincula un artículo con un proveedor y su código.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_articulo_proveedor}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Artículo</Label>
            {isView ? (
              <Input value={articuloLabel} disabled />
            ) : (
              <BuscadorSelect
                placeholder="Buscar artículo por descripción, OEM o ID..."
                emptyLabel="Sin artículos"
                value={idArticulo}
                label={articuloLabel}
                buscar={(q) => buscarArticulos(COD_EMPRESA, q)}
                itemKey={(a) => a.id_articulo}
                itemTitle={(a) => a.descripcion ?? "—"}
                itemSub={(a) => `ID ${a.id_articulo}${a.codigo_oem ? ` · OEM ${a.codigo_oem}` : ""}`}
                onSelect={(a) => {
                  setIdArticulo(a.id_articulo);
                  setArticuloLabel(
                    `${a.descripcion ?? ""}${a.codigo_oem ? ` (${a.codigo_oem})` : ""}`,
                  );
                }}
                disabled={saving}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Proveedor</Label>
            {isView ? (
              <Input value={proveedorLabel} disabled />
            ) : (
              <BuscadorSelect
                placeholder="Buscar proveedor por nombre, RUC o CI..."
                emptyLabel="Sin proveedores"
                value={codPersona}
                label={proveedorLabel}
                buscar={(q) => buscarProveedores(COD_EMPRESA, q)}
                itemKey={(p) => p.cod_persona}
                itemTitle={(p) => p.nombre ?? "—"}
                itemSub={(p) =>
                  `ID ${p.cod_persona}${p.nro_ruc ? ` · RUC ${p.nro_ruc}` : p.nro_ci ? ` · CI ${p.nro_ci}` : ""}`
                }
                onSelect={(p) => {
                  setCodPersona(p.cod_persona);
                  setProveedorLabel(p.nombre ?? "");
                }}
                disabled={saving}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="id_cod_proveedor">Código del proveedor</Label>
            <Input
              id="id_cod_proveedor"
              value={idCodProveedor}
              onChange={(e) => setIdCodProveedor(e.target.value)}
              placeholder="Código con que el proveedor identifica el artículo"
              disabled={isView || saving}
              required={!isView}
              className="font-mono"
            />
          </div>

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
                  Guardar
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
