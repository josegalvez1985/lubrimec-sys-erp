import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleDashed,
  FolderPlus,
  LayoutList,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { cn } from "@/lib/utils";
import { VISTAS } from "@/lib/vistas";
import {
  actualizarPaginaFront,
  crearPaginaFront,
  eliminarPaginaFront,
  listarPaginasFront,
  type CategoriaMenu,
  type PaginaFront,
  type PaginaFrontInput,
} from "@/lib/api";

// Páginas del Menú (pág 122): alta, cambio y baja de las páginas que existen
// solo en el front (PAGINAS_FRONT) y se suman al menú del APEX — menú híbrido.
//
// Dar de alta una página la pone en el menú con sus permisos; la pantalla en sí
// se programa aparte y se registra en vistas.tsx. La columna "Pantalla" lo
// muestra mirando VISTAS: sin entrada, al abrirla se ve "en construcción".
//
// Modificar solo JOSEG: lo decide el backend (403) y lo informa en el GET
// (puede_editar), así el front no repite la regla.

const MAX_TEXTO = 255;
const SEQ_AL_FINAL = 999;

function normalizar(s: string | null | undefined): string {
  // Igual que el backend: sin espacios de más, mayúsculas ni acentos.
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function usuariosTexto(n: number): string {
  return n === 1 ? "1 usuario" : `${n} usuarios`;
}

function tienePantalla(pageId: number): boolean {
  return Object.prototype.hasOwnProperty.call(VISTAS, pageId);
}

// Fila → input del PUT (para el switch de la grilla).
function aInput(p: PaginaFront): PaginaFrontInput {
  return {
    page_id: p.page_id,
    page_title: p.page_title,
    entry_text: p.entry_text ?? null,
    categoria: p.categoria ?? null,
    seq_categoria: p.seq_categoria ?? null,
    seq_pagina: p.seq_pagina ?? null,
    activa: p.activa,
  };
}

// Cómo va a quedar la categoría en el menú, para la grilla y el formulario.
type EstadoCategoria =
  | { tipo: "vacia" }
  | { tipo: "menu"; nombre: string }
  | { tipo: "propia"; nombre: string }
  | { tipo: "nueva"; nombre: string };

function estadoCategoria(texto: string, categorias: CategoriaMenu[]): EstadoCategoria {
  const clave = normalizar(texto);
  if (!clave) return { tipo: "vacia" };
  const c = categorias.find((x) => normalizar(x.categoria) === clave);
  if (!c) return { tipo: "nueva", nombre: texto.trim() };
  return c.origen === "APEX"
    ? { tipo: "menu", nombre: c.categoria }
    : { tipo: "propia", nombre: c.categoria };
}

type ModalState = { modo: "cerrado" } | { modo: "crear" } | { modo: "editar"; pagina: PaginaFront };

// ─── Vista ───────────────────────────────────────────────────────────────────

export function PaginasFrontView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ modo: "cerrado" });
  const [aEliminar, setAEliminar] = useState<PaginaFront | null>(null);
  const [cambiando, setCambiando] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["paginas-front"],
    queryFn: listarPaginasFront,
    retry: false,
  });

  const paginas = data?.paginas ?? [];
  const categorias = data?.categorias ?? [];
  const puedeEditar = data?.puedeEditar ?? false;

  // Cambios que mueven el menú: refrescar también el sidebar.
  function refrescar() {
    qc.invalidateQueries({ queryKey: ["paginas-front"] });
    qc.invalidateQueries({ queryKey: ["menu-paginas"] });
  }

  const activaMut = useMutation({
    mutationFn: (p: PaginaFront) =>
      actualizarPaginaFront({ ...aInput(p), activa: p.activa === "S" ? "N" : "S" }),
    onMutate: (p) => setCambiando(p.page_id),
    onSuccess: (_, p) => {
      refrescar();
      toast.success(
        p.activa === "S"
          ? `“${p.page_title}” ya no se ve en el menú`
          : `“${p.page_title}” vuelve al menú`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo cambiar la página"),
    onSettled: () => setCambiando(null),
  });

  const eliminarMut = useMutation({
    mutationFn: (p: PaginaFront) => eliminarPaginaFront(p.page_id),
    onSuccess: (_, p) => {
      refrescar();
      setAEliminar(null);
      toast.success(`Página “${p.page_title}” eliminada`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo eliminar la página"),
  });

  const columnas: Column<PaginaFront>[] = [
    {
      key: "page_id",
      header: "N°",
      num: true,
      accessor: (r) => r.page_id,
      render: (r) => <span className="font-mono tabular-nums">{r.page_id}</span>,
      className: "w-16",
    },
    {
      key: "page_title",
      header: "Página",
      hideable: false,
      accessor: (r) => r.page_title,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.page_title}</p>
          {r.entry_text && r.entry_text !== r.page_title && (
            <p className="text-xs text-muted-foreground">En el menú: {r.entry_text}</p>
          )}
          {r.titulo_apex && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3" />
              El APEX tiene el mismo número ({r.titulo_apex})
            </p>
          )}
        </div>
      ),
    },
    {
      key: "categoria",
      header: "Categoría",
      accessor: (r) => r.categoria_menu ?? r.categoria ?? null,
      render: (r) =>
        !r.categoria ? (
          <span className="text-muted-foreground">General</span>
        ) : r.categoria_menu ? (
          <span>{r.categoria_menu}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {r.categoria}
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              grupo propio
            </span>
          </span>
        ),
    },
    {
      key: "seq_pagina",
      header: "Posición",
      num: true,
      accessor: (r) => r.seq_pagina ?? 0,
      className: "w-24",
    },
    {
      key: "usuarios",
      header: "Acceso",
      num: true,
      accessor: (r) => r.usuarios,
      render: (r) =>
        r.usuarios > 0 ? (
          <span className="tabular-nums">{usuariosTexto(r.usuarios)}</span>
        ) : (
          <span className="font-medium text-amber-700 dark:text-amber-400">Nadie</span>
        ),
      className: "w-28",
    },
    {
      key: "pantalla",
      header: "Pantalla",
      accessor: (r) => (tienePantalla(r.page_id) ? "Programada" : "Pendiente"),
      render: (r) =>
        tienePantalla(r.page_id) ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="h-4 w-4" />
            Programada
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            title="Al abrirla se ve la pantalla de 'en construcción'"
          >
            <CircleDashed className="h-4 w-4" />
            Pendiente
          </span>
        ),
      className: "w-32",
    },
    {
      key: "activa",
      header: "En el menú",
      accessor: (r) => (r.activa === "S" ? "Visible" : "Oculta"),
      render: (r) => (
        <label
          className={cn(
            "inline-flex items-center gap-2 whitespace-nowrap",
            puedeEditar && "cursor-pointer",
          )}
        >
          <Switch
            checked={r.activa === "S"}
            onCheckedChange={() => activaMut.mutate(r)}
            disabled={!puedeEditar || cambiando === r.page_id}
            aria-label={`Mostrar ${r.page_title} en el menú`}
          />
          <span
            className={cn(
              "text-sm",
              r.activa === "S" ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {r.activa === "S" ? "Visible" : "Oculta"}
          </span>
          {cambiando === r.page_id && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </label>
      ),
      className: "w-36",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-[var(--panel-p)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Páginas del menú</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Cargando páginas…"
              : `${paginas.length} ${paginas.length === 1 ? "página propia" : "páginas propias"}, además de las que vienen del APEX`}
          </p>
        </div>
        {puedeEditar && (
          <Button
            onClick={() => setModal({ modo: "crear" })}
            className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Nueva página
          </Button>
        )}
      </div>

      {data && !puedeEditar && (
        <p className="mx-[var(--panel-p)] mt-[var(--panel-p)] flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          Solo el administrador puede crear o modificar páginas.
        </p>
      )}

      <div className="p-[var(--panel-p)]">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar las páginas"}
          </p>
        ) : paginas.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <LayoutList className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">Todavía no hay páginas propias</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Las páginas que crees acá aparecen en el menú junto a las del APEX.
            </p>
            {puedeEditar && (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setModal({ modo: "crear" })}
              >
                <Plus className="h-4 w-4" />
                Crear la primera
              </Button>
            )}
          </div>
        ) : (
          <DataTable
            columns={columnas}
            rows={paginas}
            getRowId={(r) => r.page_id}
            initialSort={{ key: "page_id", dir: "asc" }}
            searchPlaceholder="Buscar página o categoría…"
            emptyText="No hay páginas para mostrar."
            exportName="paginas-menu"
            actions={
              puedeEditar
                ? (r) => (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setModal({ modo: "editar", pagina: r })}
                        aria-label={`Editar ${r.page_title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setAEliminar(r)}
                        aria-label={`Eliminar ${r.page_title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                : undefined
            }
          />
        )}
      </div>

      <PaginaDialog
        state={modal}
        paginas={paginas}
        categorias={categorias}
        siguientePageId={data?.siguientePageId ?? 0}
        onClose={() => setModal({ modo: "cerrado" })}
        onSaved={(titulo, pageId, creada, permisos) => {
          refrescar();
          setModal({ modo: "cerrado" });
          if (!creada) {
            toast.success(`Página “${titulo}” actualizada`);
            return;
          }
          toast.success(`Página “${titulo}” creada`, {
            description: [
              permisos === 1
                ? "Con permiso para 1 usuario."
                : `Con permiso para ${permisos} usuarios.`,
              tienePantalla(pageId)
                ? null
                : "La pantalla todavía no está programada: por ahora se ve “en construcción”.",
            ]
              .filter(Boolean)
              .join(" "),
          });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la página?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{aEliminar?.page_title}</span> sale
              del menú
              {aEliminar && !aEliminar.titulo_apex && aEliminar.usuarios > 0
                ? ` y se borran sus permisos (${usuariosTexto(aEliminar.usuarios)})`
                : ""}
              . Si solo querés esconderla, apagá “En el menú”.
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
              {eliminarMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar página
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Formulario ──────────────────────────────────────────────────────────────

function Campo({
  id,
  label,
  ayuda,
  children,
  className,
}: {
  id: string;
  label: string;
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function enteroONull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function PaginaDialog({
  state,
  paginas,
  categorias,
  siguientePageId,
  onClose,
  onSaved,
}: {
  state: ModalState;
  paginas: PaginaFront[];
  categorias: CategoriaMenu[];
  siguientePageId: number;
  onClose: () => void;
  onSaved: (titulo: string, pageId: number, creada: boolean, permisos: number) => void;
}) {
  const abierto = state.modo !== "cerrado";
  const editando = state.modo === "editar" ? state.pagina : null;

  const [pageId, setPageId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [textoMenu, setTextoMenu] = useState("");
  const [categoria, setCategoria] = useState("");
  const [seqPagina, setSeqPagina] = useState("");
  const [seqCategoria, setSeqCategoria] = useState("");
  const [activa, setActiva] = useState(true);
  const [permiso, setPermiso] = useState<"YO" | "TODOS">("YO");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Carga el formulario al abrir (crear o una página distinta).
  const [ultima, setUltima] = useState("");
  const clave = `${state.modo}:${editando?.page_id ?? "nueva"}`;
  if (abierto && clave !== ultima) {
    setUltima(clave);
    setPageId(editando ? String(editando.page_id) : siguientePageId ? String(siguientePageId) : "");
    setTitulo(editando?.page_title ?? "");
    setTextoMenu(editando?.entry_text ?? "");
    setCategoria(editando?.categoria_menu ?? editando?.categoria ?? "");
    setSeqPagina(String(editando ? (editando.seq_pagina ?? 0) : SEQ_AL_FINAL));
    setSeqCategoria(editando?.seq_categoria != null ? String(editando.seq_categoria) : "");
    setActiva(editando ? editando.activa === "S" : true);
    setPermiso("YO");
    setError("");
  }
  if (!abierto && ultima) setUltima("");

  const cat = useMemo(() => estadoCategoria(categoria, categorias), [categoria, categorias]);
  const numero = Number(pageId);
  const numeroRepetido =
    !editando && Number.isInteger(numero) && paginas.some((p) => p.page_id === numero);

  const ayudaCategoria =
    cat.tipo === "vacia"
      ? "Sin categoría va al grupo General."
      : cat.tipo === "menu"
        ? `Se agrupa con las páginas de ${cat.nombre}.`
        : cat.tipo === "propia"
          ? "Grupo propio que ya usan otras páginas de esta lista."
          : "Grupo nuevo: aparece en el menú con este nombre.";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const id = Number(pageId);
    if (!Number.isInteger(id) || id < 2 || id > 9998) {
      setError("El número tiene que ser un entero entre 2 y 9998.");
      return;
    }
    if (numeroRepetido) {
      setError(`Ya hay una página con el número ${id}.`);
      return;
    }
    if (!titulo.trim()) {
      setError("Escribí el título de la página.");
      return;
    }
    const sp = enteroONull(seqPagina);
    const sc = cat.tipo === "nueva" ? enteroONull(seqCategoria) : null;
    if (Number.isNaN(sp) || Number.isNaN(sc) || (sp ?? 0) < 0 || (sc ?? 0) < 0) {
      setError("Las posiciones tienen que ser números positivos.");
      return;
    }

    const input: PaginaFrontInput = {
      page_id: id,
      page_title: titulo.trim(),
      entry_text: textoMenu.trim() || null,
      // Si coincide con una categoría existente se guarda con su nombre exacto.
      categoria: cat.tipo === "vacia" ? null : cat.nombre,
      seq_categoria: sc,
      seq_pagina: sp,
      activa: activa ? "S" : "N",
    };

    setGuardando(true);
    try {
      if (editando) {
        await actualizarPaginaFront(input);
        onSaved(input.page_title, id, false, 0);
      } else {
        const permisos = await crearPaginaFront(input, permiso);
        onSaved(input.page_title, id, true, permisos);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la página");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{editando ? "Editar página" : "Nueva página"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Los cambios se ven en el menú al guardar."
              : "La página aparece en el menú de quienes tengan permiso. La pantalla se programa aparte."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
            <Campo id="pf-numero" label="Número">
              <Input
                id="pf-numero"
                inputMode="numeric"
                value={pageId}
                onChange={(e) => setPageId(e.target.value.replace(/\D/g, ""))}
                disabled={!!editando || guardando}
                className="font-mono tabular-nums"
                aria-invalid={numeroRepetido}
              />
            </Campo>
            <Campo id="pf-titulo" label="Título">
              <Input
                id="pf-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={MAX_TEXTO}
                placeholder="Ej. Agenda de Citas"
                disabled={guardando}
              />
            </Campo>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {editando ? (
              "El número no se cambia: es el que usa la pantalla y los permisos."
            ) : numeroRepetido ? (
              <span className="text-destructive">
                Ese número ya lo usa otra página de esta lista.
              </span>
            ) : (
              "Te proponemos el primero libre. No puede repetir uno del APEX."
            )}
          </p>

          <Campo
            id="pf-texto-menu"
            label="Texto en el menú"
            ayuda="Opcional. Si queda vacío se usa el título."
          >
            <Input
              id="pf-texto-menu"
              value={textoMenu}
              onChange={(e) => setTextoMenu(e.target.value)}
              maxLength={MAX_TEXTO}
              placeholder={titulo.trim() || "Igual al título"}
              disabled={guardando}
            />
          </Campo>

          <Campo
            id="pf-categoria"
            label="Categoría"
            ayuda={
              <span className="inline-flex items-start gap-1">
                {cat.tipo === "nueva" && (
                  <FolderPlus className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                {ayudaCategoria}
              </span>
            }
          >
            <Input
              id="pf-categoria"
              list="pf-categorias"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              maxLength={MAX_TEXTO}
              placeholder="Elegí una o escribí una nueva"
              autoComplete="off"
              disabled={guardando}
            />
            <datalist id="pf-categorias">
              {categorias.map((c) => (
                <option key={`${c.origen}:${c.categoria}`} value={c.categoria} />
              ))}
            </datalist>
          </Campo>

          <div className={cn("grid gap-3", cat.tipo === "nueva" && "sm:grid-cols-2")}>
            <Campo
              id="pf-seq-pagina"
              label="Posición en la categoría"
              ayuda="Más bajo, más arriba. 999 la deja al final."
            >
              <Input
                id="pf-seq-pagina"
                inputMode="numeric"
                value={seqPagina}
                onChange={(e) => setSeqPagina(e.target.value.replace(/\D/g, ""))}
                className="tabular-nums"
                disabled={guardando}
              />
            </Campo>
            {cat.tipo === "nueva" && (
              <Campo
                id="pf-seq-categoria"
                label="Posición del grupo"
                ayuda="Vacío: el grupo va al final del menú."
              >
                <Input
                  id="pf-seq-categoria"
                  inputMode="numeric"
                  value={seqCategoria}
                  onChange={(e) => setSeqCategoria(e.target.value.replace(/\D/g, ""))}
                  className="tabular-nums"
                  disabled={guardando}
                />
              </Campo>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Visible en el menú</span>
              <span className="block text-xs text-muted-foreground">
                Apagada, la página se esconde sin perder sus datos ni permisos.
              </span>
            </span>
            <Switch checked={activa} onCheckedChange={setActiva} disabled={guardando} />
          </label>

          {!editando && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                Quién la ve
              </legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {(
                  [
                    { valor: "YO", titulo: "Solo yo", detalle: "Para probarla antes" },
                    {
                      valor: "TODOS",
                      titulo: "Todos los usuarios",
                      detalle: "Con alta, cambio y baja",
                    },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    role="radio"
                    aria-checked={permiso === o.valor}
                    onClick={() => setPermiso(o.valor)}
                    disabled={guardando}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      permiso === o.valor
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        permiso === o.valor && "text-primary",
                      )}
                    >
                      {o.titulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">{o.detalle}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Después se ajusta por usuario en Roles de Páginas.
              </p>
            </fieldset>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={guardando}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? "Guardar cambios" : "Crear página"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
