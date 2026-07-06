import { useState, type FormEvent, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Loader2, Package, ImagePlus } from "lucide-react";
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
  listarArticulos,
  obtenerArticulo,
  crearArticulo,
  actualizarArticulo,
  eliminarArticulo,
  urlImagenArticulo,
  listarIva,
  listarUnidadesMedidas,
  listarRubros,
  listarMarcas,
  listarViscosidades,
  type Articulo,
  type ArticuloInput,
} from "@/lib/api";

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-PY"));

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; item: Articulo }
  | { mode: "view"; item: Articulo };

export function ArticulosView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [aEliminar, setAEliminar] = useState<Articulo | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["articulos", COD_EMPRESA],
    queryFn: () => listarArticulos(COD_EMPRESA),
    retry: false,
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarArticulo(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["articulos"] });
      setAEliminar(null);
    },
  });

  const filas = (data ?? []).slice().sort((a, b) => b.id_articulo - a.id_articulo);

  const COLUMNAS: Column<Articulo>[] = [
    {
      key: "id_articulo",
      header: "ID",
      num: true,
      accessor: (r) => r.id_articulo,
      render: (r) => (
        <Badge variant="outline" className="font-mono">
          {r.id_articulo}
        </Badge>
      ),
      className: "w-16",
    },
    {
      key: "imagen",
      header: "",
      sortable: false,
      filterable: false,
      hideable: false,
      className: "w-20",
      render: (r) =>
        r.tiene_imagen ? (
          <img
            src={urlImagenArticulo(r.id_articulo, COD_EMPRESA)}
            alt={r.descripcion ?? ""}
            loading="lazy"
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="grid h-16 w-16 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground/40">
            <Package className="h-6 w-6" />
          </div>
        ),
    },
    {
      key: "descripcion",
      header: "Descripción",
      accessor: (r) => r.descripcion ?? "",
      render: (r) => <span className="font-medium">{r.descripcion}</span>,
      hideable: false,
    },
    {
      key: "codigo_oem",
      header: "OEM",
      accessor: (r) => r.codigo_oem ?? "",
      render: (r) => (r.codigo_oem ? <span className="font-mono">{r.codigo_oem}</span> : "—"),
    },
    {
      key: "descripcion_rubro",
      header: "Rubro",
      accessor: (r) => r.descripcion_rubro ?? "",
    },
    {
      key: "descripcion_marca",
      header: "Marca",
      accessor: (r) => r.descripcion_marca ?? "",
    },
    {
      key: "precio_venta",
      header: "Precio",
      num: true,
      accessor: (r) => r.precio_venta ?? 0,
      render: (r) => <span className="tabular-nums">{fmt(r.precio_venta)}</span>,
    },
    {
      key: "existencia",
      header: "Stock",
      num: true,
      accessor: (r) => r.existencia ?? 0,
      render: (r) => <span className="tabular-nums">{fmt(r.existencia)}</span>,
    },
    {
      key: "es_activo",
      header: "Activo",
      accessor: (r) => r.es_activo ?? "",
      render: (r) =>
        r.es_activo === "S" ? (
          <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Sí</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">No</Badge>
        ),
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Artículos</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "artículo" : "artículos"}
          </p>
        </div>
        <Button
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nuevo artículo</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar los artículos"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Package className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">Aún no hay artículos</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Crea el primero con el botón “Nuevo artículo”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_articulo}
            initialSort={{ key: "id_articulo", dir: "desc" }}
            exportName="articulos"
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

      <ArticuloDialog
        state={modal}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["articulos"] });
          setModal({ mode: "closed" });
        }}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar artículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold">{aEliminar?.descripcion}</span>. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_articulo);
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

function ArticuloDialog({
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

  // Catálogos para los selects FK.
  const iva = useQuery({ queryKey: ["iva"], queryFn: listarIva, enabled: open, retry: false });
  const unidades = useQuery({
    queryKey: ["unidades-medidas"],
    queryFn: listarUnidadesMedidas,
    enabled: open,
    retry: false,
  });
  const rubros = useQuery({
    queryKey: ["rubros", COD_EMPRESA],
    queryFn: () => listarRubros(COD_EMPRESA),
    enabled: open,
    retry: false,
  });
  const marcas = useQuery({
    queryKey: ["marcas", COD_EMPRESA],
    queryFn: () => listarMarcas(COD_EMPRESA),
    enabled: open,
    retry: false,
  });
  const viscosidades = useQuery({
    queryKey: ["viscosidades"],
    queryFn: listarViscosidades,
    enabled: open,
    retry: false,
  });

  // Detalle (imagen + valores) al editar/ver: se trae por OBTENER.
  const detalle = useQuery({
    queryKey: ["articulo", item?.id_articulo],
    queryFn: () => obtenerArticulo(item!.id_articulo, COD_EMPRESA),
    enabled: open && !!item,
    retry: false,
  });

  const [descripcion, setDescripcion] = useState("");
  const [codIva, setCodIva] = useState("");
  const [codUnidad, setCodUnidad] = useState("");
  const [idRubro, setIdRubro] = useState("");
  const [idMarca, setIdMarca] = useState("");
  const [idViscosidad, setIdViscosidad] = useState("");
  const [codigoOem, setCodigoOem] = useState("");
  const [valoracion, setValoracion] = useState("0");
  const [estado, setEstado] = useState("A");
  const [esActivo, setEsActivo] = useState(true);
  // Imagen: null = no tocar; { base64:null } = quitar (no soportado aquí, solo reemplazo).
  const [imagen, setImagen] = useState<{ base64: string; nombre: string; mime: string } | null>(
    null,
  );
  const [imagenPrevia, setImagenPrevia] = useState<string | null>(null); // data URL existente
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir. Para create: valores por defecto. Para edit/view:
  // se rellena cuando llega el detalle (que trae la imagen y los valores exactos).
  const [lastKey, setLastKey] = useState("");
  const key = `${state.mode}:${item?.id_articulo ?? "new"}:${detalle.data ? "d" : "0"}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    const d = detalle.data;
    if (item && d) {
      setDescripcion(d.descripcion ?? "");
      setCodIva(d.cod_iva != null ? String(d.cod_iva) : "");
      setCodUnidad(d.cod_unidad_medida ?? "");
      setIdRubro(d.id_rubro != null ? String(d.id_rubro) : "");
      setIdMarca(d.id_marca != null ? String(d.id_marca) : "");
      setIdViscosidad(d.id_viscosidad != null ? String(d.id_viscosidad) : "");
      setCodigoOem(d.codigo_oem ?? "");
      setValoracion(d.valoracion != null ? String(d.valoracion) : "0");
      setEstado(d.estado ?? "A");
      setEsActivo((d.es_activo ?? "S") === "S");
      setImagen(null);
      setImagenPrevia(
        d.imagen_base64 ? `data:${d.mime_type ?? "image/png"};base64,${d.imagen_base64}` : null,
      );
    } else if (!item) {
      setDescripcion("");
      setCodIva("");
      setCodUnidad("");
      setIdRubro("");
      setIdMarca("");
      setIdViscosidad("");
      setCodigoOem("");
      setValoracion("0");
      setEstado("A");
      setEsActivo(true);
      setImagen(null);
      setImagenPrevia(null);
    }
    setError("");
  }

  async function onImagen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    setImagen({ base64: btoa(bin), nombre: file.name, mime: file.type || "image/png" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!descripcion.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    setSaving(true);
    try {
      const input: ArticuloInput = {
        descripcion: descripcion.trim(),
        cod_iva: codIva === "" ? null : Number(codIva),
        cod_unidad_medida: codUnidad || null,
        id_rubro: idRubro === "" ? null : Number(idRubro),
        id_marca: idMarca === "" ? null : Number(idMarca),
        id_viscosidad: idViscosidad === "" ? null : Number(idViscosidad),
        codigo_oem: codigoOem.trim() || null,
        valoracion: valoracion === "" ? 0 : Number(valoracion),
        estado,
        es_activo: esActivo ? "S" : "N",
        imagen_base64: imagen?.base64 ?? null,
        nombre_imagen: imagen?.nombre ?? null,
        mime_type: imagen?.mime ?? null,
        cod_empresa: COD_EMPRESA,
      };
      if (state.mode === "edit") {
        await actualizarArticulo(state.item.id_articulo, input);
      } else {
        await crearArticulo(input);
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
      ? "Nuevo artículo"
      : state.mode === "edit"
        ? "Editar artículo"
        : "Detalle del artículo";

  // Al editar/ver esperamos el detalle antes de mostrar el form.
  const cargandoDetalle = !!item && detalle.isLoading;
  const previewSrc = imagen ? `data:${imagen.mime};base64,${imagen.base64}` : imagenPrevia;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {!isView && (
            <DialogDescription>Datos del artículo. La imagen es opcional.</DialogDescription>
          )}
        </DialogHeader>

        {cargandoDetalle ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {isView && item && (
              <div className="text-sm text-muted-foreground">
                ID: <span className="font-mono text-foreground">{item.id_articulo}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Input
                  id="descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. Filtro de aceite..."
                  disabled={isView || saving}
                  required={!isView}
                  autoFocus={!isView}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="codigo_oem">Código OEM</Label>
                <Input
                  id="codigo_oem"
                  value={codigoOem}
                  onChange={(e) => setCodigoOem(e.target.value)}
                  disabled={isView || saving}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rubro">Rubro</Label>
                <select
                  id="rubro"
                  value={idRubro}
                  onChange={(e) => setIdRubro(e.target.value)}
                  disabled={isView || saving}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {(rubros.data ?? []).map((r) => (
                    <option key={r.id_rubro} value={r.id_rubro}>
                      {r.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="marca">Marca</Label>
                <select
                  id="marca"
                  value={idMarca}
                  onChange={(e) => setIdMarca(e.target.value)}
                  disabled={isView || saving}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {(marcas.data ?? []).map((m) => (
                    <option key={m.id_marca} value={m.id_marca}>
                      {m.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="iva">IVA</Label>
                <select
                  id="iva"
                  value={codIva}
                  onChange={(e) => setCodIva(e.target.value)}
                  disabled={isView || saving}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {(iva.data ?? []).map((i) => (
                    <option key={i.cod_iva} value={i.cod_iva}>
                      {i.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidad">Unidad de medida</Label>
                <select
                  id="unidad"
                  value={codUnidad}
                  onChange={(e) => setCodUnidad(e.target.value)}
                  disabled={isView || saving}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {(unidades.data ?? []).map((u) => (
                    <option key={u.cod_unidad_medida} value={u.cod_unidad_medida}>
                      {u.descripcion ?? u.cod_unidad_medida}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="viscosidad">Viscosidad</Label>
                <select
                  id="viscosidad"
                  value={idViscosidad}
                  onChange={(e) => setIdViscosidad(e.target.value)}
                  disabled={isView || saving}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {(viscosidades.data ?? []).map((v) => (
                    <option key={v.id_viscosidad} value={v.id_viscosidad}>
                      {v.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valoracion">Valoración (0-5)</Label>
                <Input
                  id="valoracion"
                  type="number"
                  min={0}
                  max={5}
                  value={valoracion}
                  onChange={(e) => setValoracion(e.target.value)}
                  disabled={isView || saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <select
                  id="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  disabled={isView || saving}
                  className={selectCls}
                >
                  <option value="A">Activo</option>
                  <option value="I">Inactivo</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  id="es_activo"
                  type="checkbox"
                  checked={esActivo}
                  onChange={(e) => setEsActivo(e.target.checked)}
                  disabled={isView || saving}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="es_activo" className="font-normal">
                  Activo
                </Label>
              </div>
            </div>

            {/* Campos de solo lectura (calculados) — solo al ver/editar */}
            {item && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Precio de venta</p>
                  <p className="font-medium tabular-nums">{fmt(item.precio_venta)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Existencia</p>
                  <p className="font-medium tabular-nums">{fmt(item.existencia)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendidos</p>
                  <p className="font-medium tabular-nums">{fmt(item.cantidad_vendida)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Últ. costo</p>
                  <p className="font-medium tabular-nums">{fmt(item.costo_ultima_compra)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Últ. inventario</p>
                  <p className="font-medium">{item.fecha_ultimo_inventario ?? "—"}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Imagen</Label>
              {isView ? (
                previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="Artículo"
                    className="max-h-80 w-full rounded-lg border border-border object-contain"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Sin imagen.</p>
                )
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt="Previsualización"
                      className="max-h-32 object-contain"
                    />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" /> Subir imagen
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onImagen}
                    className="hidden"
                    disabled={saving}
                  />
                </label>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
