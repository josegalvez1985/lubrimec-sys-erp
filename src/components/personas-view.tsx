import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  listarPersonas,
  crearPersona,
  actualizarPersona,
  eliminarPersona,
  type Persona,
  type PersonaInput,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

// Catálogos de los campos código (1 carácter).
const TIPO_PERSONA = [
  { v: "F", label: "Física" },
  { v: "J", label: "Jurídica" },
];
const IND_CLI_PROV = [
  { v: "C", label: "Cliente" },
  { v: "P", label: "Proveedor" },
  { v: "A", label: "Ambos" },
];
const SEXO = [
  { v: "M", label: "Masculino" },
  { v: "F", label: "Femenino" },
];

const labelDe = (opts: { v: string; label: string }[], v: string | null) =>
  opts.find((o) => o.v === v)?.label ?? (v && v !== "-" ? v : "—");

const selectCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; persona: Persona }
  | { mode: "view"; persona: Persona };

export function PersonasView() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Persona | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["personas", COD_EMPRESA],
    queryFn: () => listarPersonas(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarPersona(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personas"] });
      setAEliminar(null);
    },
  });

  const q = filtro.toLowerCase();
  const personas = (data ?? [])
    .filter((p) =>
      `${p.nombre ?? ""} ${p.nombre_fantasia ?? ""} ${p.nro_ci ?? ""} ${p.nro_ruc ?? ""} ${p.nro_telefono ?? ""}`
        .toLowerCase()
        .includes(q),
    )
    .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Personas</h2>
          <p className="text-sm text-muted-foreground">
            {personas.length} {personas.length === 1 ? "persona" : "personas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, CI, RUC..."
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
            <span className="hidden sm:inline">Nueva persona</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar las personas"}
        </p>
      ) : personas.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">{filtro ? "Sin resultados" : "Aún no hay personas"}</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {filtro
              ? "Prueba con otro término de búsqueda."
              : "Crea la primera con el botón “Nueva persona”."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cli/Prov</TableHead>
                <TableHead>CI</TableHead>
                <TableHead>RUC</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personas.map((p) => (
                <TableRow key={p.cod_persona} className="group">
                  <TableCell className="font-medium">
                    {p.nombre || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{labelDe(TIPO_PERSONA, p.tipo_persona)}</Badge>
                  </TableCell>
                  <TableCell>{labelDe(IND_CLI_PROV, p.ind_cliente_proveedor)}</TableCell>
                  <TableCell className="tabular-nums">
                    {p.nro_ci && p.nro_ci !== "-" ? p.nro_ci : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {p.nro_ruc && p.nro_ruc !== "-" ? p.nro_ruc : "—"}
                  </TableCell>
                  <TableCell>
                    {p.nro_telefono && p.nro_telefono !== "-" ? p.nro_telefono : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ mode: "view", persona: p })}
                        aria-label="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ mode: "edit", persona: p })}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setAEliminar(p)}
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

      <PersonaDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["personas"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar persona?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.nombre}</span>. Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.cod_persona);
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

// Campo "-" en la BD equivale a vacío en el form.
const limpiar = (v: string | null) => (v && v !== "-" ? v : "");

function PersonaDialog({
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
  const persona = state.mode === "edit" || state.mode === "view" ? state.persona : null;

  const [form, setForm] = useState<PersonaInput>({
    tipo_persona: "F",
    nombre: "",
    nombre_fantasia: "",
    sexo: "",
    fec_nacimiento: "",
    nro_telefono: "",
    direccion: "",
    nro_ci: "",
    nro_ruc: "",
    ind_cliente_proveedor: "C",
    cod_empresa: COD_EMPRESA,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Mientras esté false, "Nombre de fantasía" replica "Nombre" automáticamente.
  const [fantasiaTocada, setFantasiaTocada] = useState(false);

  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${persona?.cod_persona ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    // Al editar una persona con fantasía ya distinta del nombre, no autocopiar.
    setFantasiaTocada(
      !!persona &&
        limpiar(persona.nombre_fantasia ?? "") !== "" &&
        limpiar(persona.nombre_fantasia ?? "") !== limpiar(persona.nombre ?? ""),
    );
    setForm({
      tipo_persona:
        persona?.tipo_persona && persona.tipo_persona !== "-" ? persona.tipo_persona : "F",
      nombre: limpiar(persona?.nombre ?? ""),
      nombre_fantasia: limpiar(persona?.nombre_fantasia ?? ""),
      sexo: limpiar(persona?.sexo ?? ""),
      fec_nacimiento: limpiar(persona?.fec_nacimiento ?? ""),
      nro_telefono: limpiar(persona?.nro_telefono ?? ""),
      direccion: limpiar(persona?.direccion ?? ""),
      nro_ci: limpiar(persona?.nro_ci ?? ""),
      nro_ruc: limpiar(persona?.nro_ruc ?? ""),
      ind_cliente_proveedor:
        persona?.ind_cliente_proveedor && persona.ind_cliente_proveedor !== "-"
          ? persona.ind_cliente_proveedor
          : "C",
      cod_empresa: COD_EMPRESA,
    });
    setError("");
  }

  function set<K extends keyof PersonaInput>(k: K, v: PersonaInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Cadenas vacías → null.
      const input: PersonaInput = {
        ...form,
        nombre: form.nombre?.trim() || null,
        nombre_fantasia: form.nombre_fantasia?.trim() || null,
        sexo: form.sexo || null,
        fec_nacimiento: form.fec_nacimiento || null,
        nro_telefono: form.nro_telefono?.trim() || null,
        direccion: form.direccion?.trim() || null,
        nro_ci: form.nro_ci?.trim() || null,
        nro_ruc: form.nro_ruc?.trim() || null,
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarPersona(state.persona.cod_persona, input);
      } else {
        await crearPersona(input);
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
      ? "Nueva persona"
      : state.mode === "edit"
        ? "Editar persona"
        : "Detalle de persona";

  const dis = isView || saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Completa los datos de la persona y guarda.</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && persona && (
            <div className="text-sm text-muted-foreground">
              Código: <span className="font-mono text-foreground">{persona.cod_persona}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={form.nombre ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                // Copia el nombre a fantasía mientras no se haya editado a mano.
                setForm((f) => ({
                  ...f,
                  nombre: v,
                  nombre_fantasia: fantasiaTocada ? f.nombre_fantasia : v,
                }));
              }}
              placeholder="Nombre o razón social"
              disabled={dis}
              required={!isView}
              autoFocus={!isView}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nombre_fantasia">Nombre de fantasía</Label>
            <Input
              id="nombre_fantasia"
              value={form.nombre_fantasia ?? ""}
              onChange={(e) => {
                setFantasiaTocada(true);
                set("nombre_fantasia", e.target.value);
              }}
              placeholder="Se copia del nombre; editable"
              disabled={dis}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tipo_persona">Tipo</Label>
              <select
                id="tipo_persona"
                className={selectCls}
                value={form.tipo_persona ?? "F"}
                onChange={(e) => set("tipo_persona", e.target.value)}
                disabled={dis}
              >
                {TIPO_PERSONA.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ind">Cliente / Proveedor</Label>
              <select
                id="ind"
                className={selectCls}
                value={form.ind_cliente_proveedor ?? "C"}
                onChange={(e) => set("ind_cliente_proveedor", e.target.value)}
                disabled={dis}
              >
                {IND_CLI_PROV.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nro_ci">Nro. CI</Label>
              <Input
                id="nro_ci"
                value={form.nro_ci ?? ""}
                onChange={(e) => set("nro_ci", e.target.value)}
                disabled={dis}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nro_ruc">Nro. RUC</Label>
              <Input
                id="nro_ruc"
                value={form.nro_ruc ?? ""}
                onChange={(e) => set("nro_ruc", e.target.value)}
                disabled={dis}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sexo">Sexo</Label>
              <select
                id="sexo"
                className={selectCls}
                value={form.sexo ?? ""}
                onChange={(e) => set("sexo", e.target.value)}
                disabled={dis}
              >
                <option value="">—</option>
                {SEXO.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fec_nacimiento">Fecha de nacimiento</Label>
              <Input
                id="fec_nacimiento"
                type="date"
                value={form.fec_nacimiento ?? ""}
                onChange={(e) => set("fec_nacimiento", e.target.value)}
                disabled={dis}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nro_telefono">Teléfono</Label>
            <Input
              id="nro_telefono"
              value={form.nro_telefono ?? ""}
              onChange={(e) => set("nro_telefono", e.target.value)}
              disabled={dis}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              value={form.direccion ?? ""}
              onChange={(e) => set("direccion", e.target.value)}
              disabled={dis}
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
