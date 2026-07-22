import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, Check, Minus, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  listarRolesPaginas,
  crearRolPagina,
  actualizarRolPagina,
  eliminarRolPagina,
  copiarRolesPaginas,
  lovUsuariosRoles,
  lovPaginasRoles,
  type RolPagina,
  type RolPaginaInput,
  type PaginaLov,
} from "@/lib/api";

// Los 5 permisos del rol, en el orden del modal 38.
const FLAGS = [
  ["puede_insertar", "Puede Insertar"],
  ["puede_actualizar", "Puede Actualizar"],
  ["puede_borrar", "Puede Borrar"],
  ["ver_campos", "Ver Campos"],
  ["puede_consultar", "Puede Consultar"],
] as const;
type FlagKey = (typeof FLAGS)[number][0];

const check = (v: string) =>
  v === "S" ? (
    <Check className="h-4 w-4 text-primary" />
  ) : (
    <Minus className="h-4 w-4 text-muted-foreground/40" />
  );

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: RolPagina };

export function RolesPaginasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [modalCopiar, setModalCopiar] = useState(false);
  const [aEliminar, setAEliminar] = useState<RolPagina | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["roles-paginas"],
    queryFn: listarRolesPaginas,
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (r: RolPagina) => eliminarRolPagina(r.app_page_id, r.app_user_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles-paginas"] });
      setAEliminar(null);
    },
  });

  const filas = data ?? [];

  const COLUMNAS: Column<RolPagina>[] = [
    {
      key: "app_user_id",
      header: "Usuario",
      accessor: (r) => r.app_user_id,
      className: "w-40",
    },
    {
      key: "pagina",
      header: "Página",
      accessor: (r) => r.pagina ?? "",
      render: (r) => r.pagina || "—",
      hideable: false,
    },
    {
      key: "app_page_id",
      header: "Nº Página",
      num: true,
      accessor: (r) => r.app_page_id,
      className: "w-24",
    },
    ...FLAGS.map(
      ([key, header]): Column<RolPagina> => ({
        key,
        header,
        accessor: (r) => (r[key] === "S" ? "Sí" : "No"),
        render: (r) => check(r[key]),
        className: "w-28",
      }),
    ),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Roles de Páginas</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "rol asignado" : "roles asignados"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setModalCopiar(true)}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar Roles
          </Button>
          <Button
            onClick={() => setModal({ mode: "create" })}
            className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear
          </Button>
        </div>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los roles"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay roles asignados</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Asigna el primero con el botón “Crear”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => `${r.app_page_id}|${r.app_user_id}`}
            initialSort={{ key: "app_user_id", dir: "asc" }}
            exportName="roles-paginas"
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
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

      <RolDialog
        state={modal}
        rolesActuales={filas}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["roles-paginas"] });
          setModal({ mode: "closed" });
        }}
      />

      <CopiarRolesDialog
        open={modalCopiar}
        onClose={() => setModalCopiar(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["roles-paginas"] });
          setModalCopiar(false);
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará el acceso de{" "}
              <span className="font-semibold">{aEliminar?.app_user_id}</span> a la página{" "}
              <span className="font-semibold">
                {aEliminar?.pagina} ({aEliminar?.app_page_id})
              </span>
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar);
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

// ─── Dialog Copiar Roles (pág 64) ────────────────────────────────────────────
// Copia los roles del usuario inicial al final (solo los que no tiene).

function CopiarRolesDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [inicial, setInicial] = useState("");
  const [final, setFinal] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setInicial("");
      setFinal("");
      setError("");
    }
  }

  const filtrar = (items: { user_name: string }[], q: string) => {
    const qn = q.trim().toUpperCase();
    if (!qn) return items;
    return items.filter((u) => u.user_name.toUpperCase().includes(qn));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!inicial || !final) {
      setError("Selecciona el usuario inicial y el final");
      return;
    }
    if (inicial === final) {
      setError("El usuario final debe ser distinto del inicial");
      return;
    }
    setSaving(true);
    try {
      const n = await copiarRolesPaginas(inicial, final);
      toast.success(`Se copiaron ${n} rol${n === 1 ? "" : "es"} a ${final}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron copiar los roles");
    } finally {
      setSaving(false);
    }
  }

  const usuarioCampo = (
    label: string,
    valor: string,
    setValor: (v: string) => void,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <BuscadorSelect
        value={valor || null}
        label={valor}
        placeholder="Buscar usuario..."
        emptyLabel="Sin resultados"
        buscar={async (q) => filtrar(await lovUsuariosRoles(), q)}
        itemKey={(u) => u.user_name}
        itemTitle={(u) => u.user_name}
        itemSub={() => "Usuario APEX"}
        onSelect={(u) => setValor(u.user_name)}
        disabled={saving}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiar Roles</DialogTitle>
          <DialogDescription>
            Copia al usuario final los roles del inicial que aún no tenga.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {usuarioCampo("Usuario Inicial", inicial, setInicial)}
          {usuarioCampo("Usuario Final", final, setFinal)}

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
              Copiar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de formulario (pág 38 Crear Rol) ─────────────────────────────────

function RolDialog({
  state,
  rolesActuales,
  onClose,
  onSaved,
}: {
  state: ModalState;
  rolesActuales: RolPagina[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = state.mode !== "closed";
  const isEdit = state.mode === "edit";
  const item = state.mode === "edit" ? state.item : null;

  const [usuario, setUsuario] = useState("");
  const [pagina, setPagina] = useState<PaginaLov | null>(null);
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>({
    puede_insertar: false,
    puede_actualizar: false,
    puede_borrar: false,
    ver_campos: false,
    puede_consultar: false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir según el ítem seleccionado.
  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item ? `${item.app_page_id}|${item.app_user_id}` : "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setUsuario(item?.app_user_id ?? "");
    setPagina(item ? { page_id: item.app_page_id, page_title: item.pagina } : null);
    setFlags({
      puede_insertar: item?.puede_insertar === "S",
      puede_actualizar: item?.puede_actualizar === "S",
      puede_borrar: item?.puede_borrar === "S",
      ver_campos: item?.ver_campos === "S",
      puede_consultar: item?.puede_consultar === "S",
    });
    setError("");
  }

  const filtrarLov = <T,>(items: T[], q: string, texto: (i: T) => string) => {
    const qn = q.trim().toUpperCase();
    if (!qn) return items;
    return items.filter((i) => texto(i).toUpperCase().includes(qn));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!usuario) {
      setError("Selecciona un usuario");
      return;
    }
    if (!pagina) {
      setError("Selecciona una página");
      return;
    }
    setSaving(true);
    try {
      const input: RolPaginaInput = {
        app_page_id: pagina.page_id,
        app_user_id: usuario,
        puede_insertar: flags.puede_insertar ? "S" : "N",
        puede_actualizar: flags.puede_actualizar ? "S" : "N",
        puede_borrar: flags.puede_borrar ? "S" : "N",
        puede_consultar: flags.puede_consultar ? "S" : "N",
        ver_campos: flags.ver_campos ? "S" : "N",
      };
      if (isEdit) {
        await actualizarRolPagina(input);
      } else {
        await crearRolPagina(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Rol" : "Crear Rol"}</DialogTitle>
          <DialogDescription>
            Define qué puede hacer el usuario en la página seleccionada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Usuario</Label>
            {isEdit ? (
              <Input value={usuario} disabled />
            ) : (
              <BuscadorSelect
                value={usuario || null}
                label={usuario}
                placeholder="Buscar usuario..."
                emptyLabel="Sin resultados"
                buscar={async (q) =>
                  filtrarLov(await lovUsuariosRoles(), q, (u) => u.user_name)
                }
                itemKey={(u) => u.user_name}
                itemTitle={(u) => u.user_name}
                itemSub={() => "Usuario APEX"}
                onSelect={(u) => setUsuario(u.user_name)}
                disabled={saving}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Página</Label>
            {isEdit ? (
              <Input value={`${pagina?.page_title ?? ""} (${pagina?.page_id ?? ""})`} disabled />
            ) : (
              <BuscadorSelect
                key={`pag-${usuario}`}
                value={pagina?.page_id ?? null}
                label={pagina?.page_title ?? ""}
                placeholder="Buscar página..."
                emptyLabel="Sin resultados"
                buscar={async (q) => {
                  // Excluye las páginas que el usuario ya tiene asignadas
                  // (réplica de la LOV del APEX al crear).
                  const asignadas = new Set(
                    rolesActuales
                      .filter((r) => r.app_user_id === usuario)
                      .map((r) => r.app_page_id),
                  );
                  const todas = (await lovPaginasRoles()).filter(
                    (p) => !asignadas.has(p.page_id),
                  );
                  return filtrarLov(todas, q, (p) => `${p.page_title ?? ""} ${p.page_id}`);
                }}
                itemKey={(p) => p.page_id}
                itemTitle={(p) => p.page_title ?? "—"}
                itemSub={(p) => `Página ${p.page_id}`}
                onSelect={(p) => setPagina(p)}
                disabled={saving}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Permisos</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {FLAGS.map(([keyFlag, label]) => (
                <label
                  key={keyFlag}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={flags[keyFlag]}
                    onCheckedChange={(v) =>
                      setFlags((f) => ({ ...f, [keyFlag]: v === true }))
                    }
                    disabled={saving}
                  />
                  {label}
                </label>
              ))}
            </div>
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
              {isEdit ? "Aplicar Cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
