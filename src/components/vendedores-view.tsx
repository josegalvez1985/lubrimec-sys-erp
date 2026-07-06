import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  listarVendedores,
  crearVendedor,
  actualizarVendedor,
  eliminarVendedor,
  type Vendedor,
  type VendedorInput,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-PY")}%`);

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; vendedor: Vendedor }
  | { mode: "view"; vendedor: Vendedor };

const COLUMNAS: Column<Vendedor>[] = [
  {
    key: "cod_vendedor",
    header: "Código",
    num: true,
    accessor: (r) => r.cod_vendedor,
    render: (r) => (
      <Badge variant="outline" className="font-mono">
        {r.cod_vendedor}
      </Badge>
    ),
    className: "w-20",
  },
  {
    key: "nombre",
    header: "Nombre",
    accessor: (r) => r.nombre ?? "",
    render: (r) => r.nombre || <span className="text-muted-foreground">—</span>,
    className: "font-medium",
    hideable: false,
  },
  {
    key: "porc_comision",
    header: "% Comisión",
    num: true,
    accessor: (r) => r.porc_comision,
    render: (r) => fmtPct(r.porc_comision),
  },
  {
    key: "cod_usuario",
    header: "Usuario",
    accessor: (r) => r.cod_usuario ?? "",
    render: (r) =>
      r.cod_usuario ? <span className="font-mono">{r.cod_usuario}</span> : "—",
  },
  {
    key: "estado",
    header: "Estado",
    accessor: (r) => r.estado,
    render: (r) =>
      r.estado === "S" ? (
        <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">Activo</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Inactivo
        </Badge>
      ),
  },
];

export function VendedoresView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Vendedor | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["vendedores", COD_EMPRESA],
    queryFn: () => listarVendedores(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarVendedor(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendedores"] });
      setAEliminar(null);
    },
  });

  const vendedores = (data ?? []).slice().sort((a, b) => b.cod_vendedor - a.cod_vendedor);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Vendedores</h2>
          <p className="text-sm text-muted-foreground">Catálogo de vendedores y comisiones</p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo vendedor</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar los vendedores"}
          </p>
        ) : vendedores.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Aún no hay vendedores</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Crea el primero con el botón “Nuevo vendedor”.
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNAS}
            rows={vendedores}
            getRowId={(r) => r.cod_vendedor}
            searchPlaceholder="Buscar vendedor..."
            exportName="vendedores"
            initialSort={{ key: "cod_vendedor", dir: "desc" }}
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "view", vendedor: r })}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setModal({ mode: "edit", vendedor: r })}
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
        )}
      </div>

      <VendedorDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["vendedores"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.nombre}</span>. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.cod_vendedor);
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

function VendedorDialog({
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
  const vendedor = state.mode === "edit" || state.mode === "view" ? state.vendedor : null;

  const [nombre, setNombre] = useState("");
  const [porcComision, setPorcComision] = useState("0");
  const [estado, setEstado] = useState("S");
  const [codUsuario, setCodUsuario] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${vendedor?.cod_vendedor ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setNombre(vendedor?.nombre ?? "");
    setPorcComision(vendedor?.porc_comision != null ? String(vendedor.porc_comision) : "0");
    setEstado(vendedor?.estado ?? "S");
    setCodUsuario(vendedor?.cod_usuario ?? "");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) return setError("El nombre es obligatorio");
    setSaving(true);
    try {
      const input: VendedorInput = {
        nombre: nombre.trim(),
        porc_comision: porcComision.trim() === "" ? null : Number(porcComision),
        estado,
        cod_usuario: codUsuario.trim() || null,
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarVendedor(state.vendedor.cod_vendedor, input);
      } else {
        await crearVendedor(input);
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
      ? "Nuevo vendedor"
      : state.mode === "edit"
        ? "Editar vendedor"
        : "Detalle de vendedor";
  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos del vendedor y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && vendedor && (
            <div className="text-sm text-muted-foreground">
              Código: <span className="font-mono text-foreground">{vendedor.cod_vendedor}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del vendedor"
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="porc_comision">% Comisión</Label>
              <Input
                id="porc_comision"
                type="number"
                step="0.01"
                value={porcComision}
                onChange={(e) => setPorcComision(e.target.value)}
                placeholder="0"
                disabled={dis}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              {isView ? (
                <Input value={estado === "S" ? "Activo" : "Inactivo"} disabled />
              ) : (
                <select
                  id="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  disabled={saving}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="S">Activo</option>
                  <option value="N">Inactivo</option>
                </select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cod_usuario">Usuario</Label>
            <Input
              id="cod_usuario"
              value={codUsuario}
              onChange={(e) => setCodUsuario(e.target.value)}
              placeholder="Usuario del sistema (opcional)"
              disabled={dis}
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
