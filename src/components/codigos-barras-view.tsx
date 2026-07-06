import { useState, useEffect, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Barcode, Search } from "lucide-react";
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
import {
  listarCodigosBarras,
  crearCodigoBarra,
  actualizarCodigoBarra,
  eliminarCodigoBarra,
  buscarArticulos,
  type CodigoBarra,
  type CodigoBarraInput,
  type ArticuloBusqueda,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: CodigoBarra }
  | { mode: "view"; item: CodigoBarra };

export function CodigosBarrasView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<CodigoBarra | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["codigos-barras", COD_EMPRESA],
    queryFn: () => listarCodigosBarras(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarCodigoBarra(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["codigos-barras"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_barra - a.id_barra);

  const COLUMNAS: Column<CodigoBarra>[] = [
    {
      key: "id_barra",
      header: "ID",
      num: true,
      accessor: (r) => r.id_barra,
      render: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.id_barra}
        </Badge>
      ),
      className: "w-16",
    },
    {
      key: "cod_barra",
      header: "Código de barras",
      accessor: (r) => r.cod_barra,
      render: (r) => <span className="font-mono font-medium">{r.cod_barra}</span>,
      hideable: false,
    },
    {
      key: "descripcion_articulo",
      header: "Artículo",
      accessor: (r) => r.descripcion_articulo ?? "",
    },
    {
      key: "codigo_oem",
      header: "Código OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) =>
        r.codigo_oem ? <span className="font-mono">{r.codigo_oem}</span> : "—",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Códigos de barras</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "código" : "códigos"} registrados
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo código</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los códigos"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Barcode className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay códigos de barras</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Crea el primero con el botón “Nuevo código”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_barra}
            initialSort={{ key: "id_barra", dir: "desc" }}
            exportName="codigos-barras"
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

      <CodigoBarraDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["codigos-barras"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar código de barras?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.cod_barra}</span>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_barra);
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

function CodigoBarraDialog({
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

  const [codBarra, setCodBarra] = useState("");
  const [idArticulo, setIdArticulo] = useState<number | null>(null);
  const [articuloLabel, setArticuloLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir según el ítem seleccionado.
  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_barra ?? "new"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setCodBarra(item?.cod_barra ?? "");
    setIdArticulo(item?.id_articulo ?? null);
    setArticuloLabel(
      item ? `${item.descripcion_articulo ?? ""}${item.codigo_oem ? ` (${item.codigo_oem})` : ""}` : "",
    );
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!idArticulo) {
      setError("Selecciona un artículo");
      return;
    }
    setSaving(true);
    try {
      const input: CodigoBarraInput = {
        id_articulo: idArticulo,
        cod_barra: codBarra.trim(),
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarCodigoBarra(state.item.id_barra, input);
      } else {
        await crearCodigoBarra(input);
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
      ? "Nuevo código de barras"
      : state.mode === "edit"
        ? "Editar código de barras"
        : "Detalle del código de barras";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>
              Selecciona el artículo y escribe su código de barras.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {isView && item && (
            <div className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">{item.id_barra}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Artículo</Label>
            {isView ? (
              <Input value={articuloLabel} disabled />
            ) : (
              <SelectorArticulo
                value={idArticulo}
                label={articuloLabel}
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
            <Label htmlFor="cod_barra">Código de barras</Label>
            <Input
              id="cod_barra"
              value={codBarra}
              onChange={(e) => setCodBarra(e.target.value)}
              placeholder="Ej. 7791234567890"
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

// ─── Selector de artículo (buscador con debounce) ────────────────────────────

function SelectorArticulo({
  value,
  label,
  onSelect,
  disabled,
}: {
  value: number | null;
  label: string;
  onSelect: (a: ArticuloBusqueda) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["articulos-buscar", qDebounced],
    queryFn: () => buscarArticulos(COD_EMPRESA, qDebounced),
    enabled: abierto,
    retry: false,
  });

  const articulos = data ?? [];

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={abierto ? q : value ? label : q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          placeholder="Buscar artículo por descripción, OEM o ID..."
          disabled={disabled}
          className="pl-10"
        />
      </div>
      {abierto && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {isFetching ? (
            <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          ) : articulos.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>
          ) : (
            articulos.map((a) => (
              <button
                key={a.id_articulo}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(a);
                  setAbierto(false);
                  setQ("");
                }}
                className="flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-accent"
              >
                <span className="text-sm font-medium">{a.descripcion ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  ID {a.id_articulo}
                  {a.codigo_oem ? ` · OEM ${a.codigo_oem}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
