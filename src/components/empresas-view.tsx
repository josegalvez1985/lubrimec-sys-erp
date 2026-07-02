import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Pencil, Trash2, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  listarEmpresas,
  crearEmpresa,
  actualizarEmpresa,
  eliminarEmpresa,
  type Empresa,
  type EmpresaInput,
} from "@/lib/api";

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; empresa: Empresa }
  | { mode: "view"; empresa: Empresa };

export function EmpresasView() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Empresa | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["empresas"],
    queryFn: listarEmpresas,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarEmpresa(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas"] });
      setAEliminar(null);
    },
  });

  const q = filtro.toLowerCase();
  const empresas = (data ?? [])
    .filter((e) => `${e.nombre ?? ""} ${e.nro_documento ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Empresas</h2>
          <p className="text-sm text-muted-foreground">
            {empresas.length} {empresas.length === 1 ? "empresa" : "empresas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o documento..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-10 pl-10"
            />
          </div>
          <Button
            onClick={() => setModal({ mode: "create" })}
            className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Nueva empresa</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar las empresas"}
        </p>
      ) : empresas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">{filtro ? "Sin resultados" : "Aún no hay empresas"}</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {filtro
              ? "Prueba con otro término de búsqueda."
              : "Crea la primera con el botón “Nueva empresa”."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Cód.</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Nro. Documento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas.map((e) => (
                <TableRow key={e.cod_empresa} className="group">
                  <TableCell className="text-muted-foreground">
                    <Badge variant="outline" className="font-mono">
                      {e.cod_empresa}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {e.nombre || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {e.nro_documento || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.activo === "S" ? "default" : "outline"}>
                      {e.activo === "S" ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ mode: "view", empresa: e })}
                        aria-label="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ mode: "edit", empresa: e })}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setAEliminar(e)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EmpresaDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["empresas"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.nombre}</span>. Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.cod_empresa);
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

function EmpresaDialog({
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
  const empresa = state.mode === "edit" || state.mode === "view" ? state.empresa : null;

  const [nombre, setNombre] = useState("");
  const [nroDocumento, setNroDocumento] = useState("");
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${empresa?.cod_empresa ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setNombre(empresa?.nombre ?? "");
    setNroDocumento(empresa?.nro_documento ?? "");
    setActivo(empresa ? empresa.activo === "S" : true);
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: EmpresaInput = {
        nombre: nombre.trim() || null,
        nro_documento: nroDocumento.trim() || null,
        activo: activo ? "S" : "N",
      };
      if (state.mode === "edit") {
        await actualizarEmpresa(state.empresa.cod_empresa, input);
      } else {
        await crearEmpresa(input);
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
      ? "Nueva empresa"
      : state.mode === "edit"
        ? "Editar empresa"
        : "Detalle de empresa";

  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos de la empresa y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && empresa && (
            <div className="text-sm text-muted-foreground">
              Código: <span className="font-mono text-foreground">{empresa.cod_empresa}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Razón social"
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nro_documento">Nro. Documento</Label>
            <Input
              id="nro_documento"
              value={nroDocumento}
              onChange={(e) => setNroDocumento(e.target.value)}
              placeholder="RUC / documento (único)"
              disabled={dis}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="activo" className="cursor-pointer">
              Activo
            </Label>
            <Switch id="activo" checked={activo} onCheckedChange={setActivo} disabled={dis} />
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
