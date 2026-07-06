import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Car } from "lucide-react";
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
  listarVehiculosRepuestos,
  crearVehiculoRepuesto,
  actualizarVehiculoRepuesto,
  eliminarVehiculoRepuesto,
  buscarArticulos,
  type VehiculoRepuesto,
  type VehiculoRepuestoInput,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: VehiculoRepuesto }
  | { mode: "view"; item: VehiculoRepuesto };

export function VehiculosRepuestosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<VehiculoRepuesto | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["vehiculos-repuestos", COD_EMPRESA],
    queryFn: () => listarVehiculosRepuestos(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarVehiculoRepuesto(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehiculos-repuestos"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_vehiculo - a.id_vehiculo);

  const COLUMNAS: Column<VehiculoRepuesto>[] = [
    {
      key: "id_vehiculo",
      header: "ID",
      num: true,
      accessor: (r) => r.id_vehiculo,
      render: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.id_vehiculo}
        </Badge>
      ),
      className: "w-16",
    },
    {
      key: "modelo",
      header: "Modelo",
      accessor: (r) => r.modelo,
      render: (r) => <span className="font-medium">{r.modelo}</span>,
      hideable: false,
    },
    {
      key: "codigo_oem",
      header: "Código OEM",
      accessor: (r) => r.codigo_oem,
      render: (r) => <span className="font-mono">{r.codigo_oem}</span>,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Vehículos y repuestos</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "registro" : "registros"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo vehículo</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los registros"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Car className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay vehículos-repuestos</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Crea el primero con el botón “Nuevo vehículo”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_vehiculo}
            initialSort={{ key: "id_vehiculo", dir: "desc" }}
            exportName="vehiculos-repuestos"
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

      <VehiculoRepuestoDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["vehiculos-repuestos"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el modelo <span className="font-semibold">{aEliminar?.modelo}</span> (OEM{" "}
              <span className="font-semibold">{aEliminar?.codigo_oem}</span>). Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_vehiculo);
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

function VehiculoRepuestoDialog({
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

  const [modelo, setModelo] = useState("");
  const [codigoOem, setCodigoOem] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_vehiculo ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setModelo(item?.modelo ?? "");
    setCodigoOem(item?.codigo_oem ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!codigoOem.trim()) {
      setError("Selecciona un artículo para tomar su código OEM.");
      return;
    }
    setSaving(true);
    try {
      const input: VehiculoRepuestoInput = {
        modelo: modelo.trim(),
        codigo_oem: codigoOem.trim(),
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarVehiculoRepuesto(state.item.id_vehiculo, input);
      } else {
        await crearVehiculoRepuesto(input);
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
      ? "Nuevo vehículo-repuesto"
      : state.mode === "edit"
        ? "Editar vehículo-repuesto"
        : "Detalle del vehículo-repuesto";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Relaciona un modelo de vehículo con el código OEM del repuesto.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_vehiculo}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="modelo">Modelo</Label>
            <Input
              id="modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ej. Toyota Hilux 2015"
              disabled={isView || saving}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigo_oem">Código OEM</Label>
            {isView ? (
              <Input value={codigoOem} disabled className="font-mono" />
            ) : (
              <>
                {/* Buscador: elegir un artículo toma su código OEM. */}
                <BuscadorSelect
                  placeholder="Buscar artículo por descripción, OEM o ID..."
                  emptyLabel="Sin artículos"
                  value={codigoOem || null}
                  label={codigoOem}
                  buscar={(q) => buscarArticulos(COD_EMPRESA, q)}
                  itemKey={(a) => a.id_articulo}
                  itemTitle={(a) => a.descripcion ?? "—"}
                  itemSub={(a) =>
                    `ID ${a.id_articulo}${a.codigo_oem ? ` · OEM ${a.codigo_oem}` : " · sin OEM"}`
                  }
                  onSelect={(a) => setCodigoOem(a.codigo_oem ?? "")}
                  disabled={saving}
                />
                {codigoOem && (
                  <p className="text-xs text-muted-foreground">
                    OEM seleccionado: <span className="font-mono text-foreground">{codigoOem}</span>
                  </p>
                )}
              </>
            )}
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
