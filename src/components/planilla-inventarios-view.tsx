import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ClipboardPen, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InputMonto } from "@/components/ui/input-monto";
import { DataTable, type Column } from "@/components/ui/data-table";
import { BuscadorSelect } from "@/components/ui/buscador-select";
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
  listarPlanillaInventarios,
  pendientesPlanilla,
  crearPlanillaInventario,
  actualizarCantidadPlanilla,
  subirFotoInventario,
  urlFotoInventario,
  urlImagenArticulo,
  type PlanillaInventario,
  type ArticuloPendiente,
} from "@/lib/api";

const COD_EMPRESA = 24;

const fmtNum = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(v);

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function PlanillaInventariosView() {
  const qc = useQueryClient();
  const [modalPlanilla, setModalPlanilla] = useState(false);
  const [aEditar, setAEditar] = useState<PlanillaInventario | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planilla-inventarios", COD_EMPRESA],
    queryFn: () => listarPlanillaInventarios(COD_EMPRESA),
    retry: false,
  });

  const filas = data ?? [];

  const COLUMNAS: Column<PlanillaInventario>[] = [
    {
      key: "id_inventario",
      header: "ID",
      num: true,
      accessor: (r) => r.id_inventario,
      render: (r) => (
        <button
          type="button"
          onClick={() => setAEditar(r)}
          className="font-mono text-primary hover:underline"
        >
          {r.id_inventario}
        </button>
      ),
      className: "w-24",
    },
    {
      key: "articulo",
      header: "Artículo",
      accessor: (r) => r.articulo ?? "",
      render: (r) => r.articulo || "—",
      hideable: false,
    },
    {
      key: "cantidad_fisica",
      header: "Cantidad",
      num: true,
      accessor: (r) => r.cantidad_fisica ?? 0,
      render: (r) => fmtNum(r.cantidad_fisica),
      className: "w-28",
    },
    {
      key: "fecha_ultima_compra",
      header: "Fecha Última Compra",
      accessor: (r) => r.fecha_ultima_compra ?? "",
      render: (r) => fmtFecha(r.fecha_ultima_compra),
      className: "w-36",
    },
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha ?? "",
      render: (r) => fmtFecha(r.fecha),
      className: "w-28",
    },
    {
      key: "observacion",
      header: "Observación",
      accessor: (r) => r.observacion ?? "",
      render: (r) => r.observacion || "—",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-xl font-bold">Planilla para inventarios</h2>
          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? "conteo abierto" : "conteos abiertos"}
          </p>
        </div>
        <Button
          onClick={() => setModalPlanilla(true)}
          className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear
        </Button>
      </div>

      {isError ? (
        <p className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudo cargar la planilla"}
        </p>
      ) : filas.length === 0 && !isLoading ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardPen className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">No hay conteos abiertos</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Genera una planilla con el botón “Crear”.
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <DataTable
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_inventario}
            initialSort={{ key: "cantidad_fisica", dir: "asc" }}
            exportName="planilla-inventarios"
          />
        </div>
      )}

      <CrearPlanillaDialog
        open={modalPlanilla}
        onClose={() => setModalPlanilla(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["planilla-inventarios"] });
          setModalPlanilla(false);
        }}
      />

      <CantidadDialog
        item={aEditar}
        onClose={() => setAEditar(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["planilla-inventarios"] });
          setAEditar(null);
        }}
      />
    </div>
  );
}

// ─── Modal Crear Planilla (pág 113) ──────────────────────────────────────────
// Fecha de referencia (parámetro FECHA_INVENTario) + LOVs Rubro/Marca/
// Viscosidad en cascada derivadas de los artículos pendientes (LOV completa +
// filtro front). El insert masivo replica el proceso CREAR_PLANILLA del APEX.

type Lov = { id: number; descripcion: string };

function CrearPlanillaDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(""); // dd/mm/yyyy
  const [rubro, setRubro] = useState<Lov | null>(null);
  const [marca, setMarca] = useState<Lov | null>(null);
  const [viscosidad, setViscosidad] = useState<Lov | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset al abrir.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFecha("");
      setRubro(null);
      setMarca(null);
      setViscosidad(null);
      setError("");
    }
  }

  const pendientesQ = useQuery({
    queryKey: ["planilla-pendientes", COD_EMPRESA, fecha],
    queryFn: () => pendientesPlanilla(COD_EMPRESA, fecha || null),
    enabled: open,
    retry: false,
  });

  // Primera carga sin fecha: el backend usa el parámetro FECHA_INVENTARIO y
  // devuelve la fecha usada; se refleja en el input.
  const fechaResp = pendientesQ.data?.fecha ?? null;
  if (open && !fecha && fechaResp) setFecha(fechaResp);

  const pendientes = useMemo(() => pendientesQ.data?.data ?? [], [pendientesQ.data]);

  // LOVs en cascada (replica el APEX: rubro libre, marca por rubro,
  // viscosidad por rubro+marca).
  const uniq = (
    items: ArticuloPendiente[],
    id: (p: ArticuloPendiente) => number | null | undefined,
    desc: (p: ArticuloPendiente) => string | null | undefined,
  ): Lov[] => {
    const m = new Map<number, string>();
    for (const p of items) {
      const i = id(p);
      if (i != null && !m.has(i)) m.set(i, desc(p) ?? `ID ${i}`);
    }
    return [...m.entries()]
      .map(([i, d]) => ({ id: i, descripcion: d }))
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  };

  const lovRubros = uniq(pendientes, (p) => p.id_rubro, (p) => p.rubro);
  const lovMarcas = uniq(
    pendientes.filter((p) => rubro == null || p.id_rubro === rubro.id),
    (p) => p.id_marca,
    (p) => p.marca,
  );
  const lovViscosidades = uniq(
    pendientes.filter(
      (p) =>
        (rubro == null || p.id_rubro === rubro.id) &&
        (marca == null || p.id_marca === marca.id),
    ),
    (p) => p.id_viscosidad,
    (p) => p.viscosidad,
  );

  const filtrarLov = (items: Lov[], q: string) => {
    const qn = q.trim().toUpperCase();
    if (!qn) return items;
    return items.filter((i) => `${i.descripcion} ${i.id}`.toUpperCase().includes(qn));
  };

  async function crear() {
    setError("");
    setSaving(true);
    try {
      const n = await crearPlanillaInventario({
        cod_empresa: COD_EMPRESA,
        id_rubro: rubro?.id ?? null,
        id_marca: marca?.id ?? null,
        id_viscosidad: viscosidad?.id ?? null,
      });
      toast.success(`Planilla generada (${n} artículo${n === 1 ? "" : "s"})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la planilla");
    } finally {
      setSaving(false);
      setConfirmar(false);
    }
  }

  // LOV con botón X para volver a "Todos" (mismo look que Crear Inventario).
  const lovCampo = (
    label: string,
    sel: Lov | null,
    setSel: (v: Lov | null) => void,
    items: Lov[],
    onClear?: () => void,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <BuscadorSelect
            key={`${label}-${items.length}`}
            value={sel?.id ?? null}
            label={sel?.descripcion ?? ""}
            placeholder="Todos"
            emptyLabel="Sin resultados"
            buscar={async (q) => filtrarLov(items, q)}
            itemKey={(i: Lov) => i.id}
            itemTitle={(i: Lov) => i.descripcion}
            itemSub={(i: Lov) => `ID ${i.id}`}
            onSelect={(i: Lov) => {
              setSel(i);
              onClear?.();
            }}
            disabled={saving || pendientesQ.isLoading}
          />
        </div>
        {sel && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={() => {
              setSel(null);
              onClear?.();
            }}
            aria-label={`Quitar ${label.toLowerCase()}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Planilla</DialogTitle>
          <DialogDescription>
            Genera un conteo por cada artículo activo que coincida con los filtros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lovCampo("Rubro", rubro, setRubro, lovRubros, () => {
            setMarca(null);
            setViscosidad(null);
          })}
          {lovCampo("Marca", marca, setMarca, lovMarcas, () => setViscosidad(null))}
          {lovCampo("Viscosidad", viscosidad, setViscosidad, lovViscosidades)}

          <div className="space-y-2">
            <Label htmlFor="fecha_inv">Fecha de Inventario</Label>
            <Input
              id="fecha_inv"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setRubro(null);
                setMarca(null);
                setViscosidad(null);
              }}
              placeholder="dd/mm/yyyy"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Referencia para las listas: artículos sin inventario o inventariados antes de
              esta fecha.
            </p>
          </div>

          {pendientesQ.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {pendientesQ.error instanceof Error
                ? pendientesQ.error.message
                : "No se pudieron cargar las listas"}
            </p>
          )}
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
              type="button"
              onClick={() => setConfirmar(true)}
              disabled={saving}
              className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear Planilla
            </Button>
          </DialogFooter>
        </div>

        <AlertDialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro de generar la planilla?</AlertDialogTitle>
              <AlertDialogDescription>
                Se insertará un conteo por cada artículo que coincida con{" "}
                <span className="font-semibold">{rubro?.descripcion ?? "todos los rubros"}</span>
                {" / "}
                <span className="font-semibold">{marca?.descripcion ?? "todas las marcas"}</span>
                {" / "}
                <span className="font-semibold">
                  {viscosidad?.descripcion ?? "todas las viscosidades"}
                </span>
                .
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void crear();
                }}
                disabled={saving}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal Cantidad de Inventario (pág 115) ──────────────────────────────────
// Edita la cantidad física y permite tomar/subir una foto (JPEG comprimido a
// 600px de ancho, máx 100KB, como el JS del APEX). Muestra la imagen del
// artículo (ARTICULOS.ARCHIVO_IMAGEN) y la foto ya guardada del conteo.

function CantidadDialog({
  item,
  onClose,
  onSaved,
}: {
  item: PlanillaInventario | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = item !== null;
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [fotoNueva, setFotoNueva] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [lastId, setLastId] = useState<number | null>(null);
  if (item && item.id_inventario !== lastId) {
    setLastId(item.id_inventario);
    setCantidad(item.cantidad_fisica);
    setFotoNueva(null);
    setPreviewUrl("");
    setError("");
  }

  // Comprime la imagen a 600px de ancho, JPEG 0.7, máx 100KB (JS de la pág 115).
  function procesarArchivo(file: File) {
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              setError("No se pudo procesar la imagen");
              return;
            }
            if (blob.size > 102400) {
              setError("La imagen comprimida supera los 100 KB. Intenta otra.");
              return;
            }
            setFotoNueva(blob);
            setPreviewUrl(URL.createObjectURL(blob));
          },
          "image/jpeg",
          0.7,
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError("");
    if (cantidad == null) {
      setError("La cantidad física es obligatoria");
      return;
    }
    setSaving(true);
    try {
      await actualizarCantidadPlanilla(item.id_inventario, COD_EMPRESA, cantidad);
      if (fotoNueva) {
        await subirFotoInventario(item.id_inventario, COD_EMPRESA, fotoNueva);
      }
      toast.success("Conteo guardado");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cantidad de Inventario</DialogTitle>
          <DialogDescription>
            {item?.articulo ?? ""} ({item?.id_articulo})
            <Badge variant="outline" className="ml-2 font-mono">
              #{item?.id_inventario}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p115_cantidad">Cantidad Física</Label>
            <InputMonto
              id="p115_cantidad"
              value={cantidad}
              onValueChange={setCantidad}
              maxDecimals={2}
              placeholder="0"
              disabled={saving}
            />
          </div>

          {/* Imagen del artículo (ARTICULOS.ARCHIVO_IMAGEN) */}
          {item && (
            <div className="space-y-2">
              <Label>Imagen del artículo</Label>
              <img
                src={urlImagenArticulo(item.id_articulo, COD_EMPRESA)}
                alt="Imagen del artículo"
                className="max-h-48 w-full rounded-lg border border-border object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          {/* Foto del conteo: la nueva (preview) o la ya guardada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Foto del conteo</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={saving}
              >
                <Camera className="mr-2 h-4 w-4" />
                Tomar Foto
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) procesarArchivo(f);
                e.target.value = "";
              }}
            />
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Vista previa de la foto"
                className="max-h-64 w-full rounded-lg border border-border object-contain"
              />
            ) : item && item.tiene_foto === 1 ? (
              <img
                src={urlFotoInventario(item.id_inventario, COD_EMPRESA)}
                alt="Foto del conteo"
                className="max-h-64 w-full rounded-lg border border-border object-contain"
              />
            ) : (
              <p className="text-xs text-muted-foreground">Sin foto registrada.</p>
            )}
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
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
