import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MessageSquare,
  Search,
  Image as ImageIcon,
  X,
  Send,
  Loader2,
  Phone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  listarNumerosWhatsapp,
  enviarWhatsapp,
  logsWhatsapp,
  subirImagenWhatsapp,
  cargarNumerosWhatsapp,
  borrarNumerosWhatsapp,
  type NumeroWhatsapp,
  type LogWhatsapp,
} from "@/lib/api";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Deja solo dígitos y un "+" inicial opcional.
function normalizarNumero(raw: string): string {
  const t = raw.trim();
  const plus = t.startsWith("+") ? "+" : "";
  return plus + t.replace(/[^\d]/g, "");
}

// Extrae números de un textarea (uno por línea, coma, punto y coma o espacio).
function parsearNumeros(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map(normalizarNumero)
    .filter((n) => n.replace(/\D/g, "").length >= 7);
}

// Extrae los números del CSV de Google Contacts (columna "Phone 1 - Value").
// Se queda solo con celulares +595 (10-12 dígitos); descarta códigos cortos, *611, etc.
function parsearCSVContactos(csv: string): string[] {
  const lineas = csv.split(/\r?\n/);
  const nums = new Set<string>();
  for (const linea of lineas) {
    // Toma el último campo con pinta de teléfono en la fila.
    const campos = linea.split(",");
    for (const campo of campos) {
      const c = campo.trim();
      if (!/^\+?\d[\d\s()-]{6,}$/.test(c)) continue;
      const n = normalizarNumero(c);
      const soloDigitos = n.replace(/\D/g, "");
      // Paraguay móvil: 595 + 9 dígitos = 12; aceptamos 11-12 con o sin +.
      if (n.startsWith("+595") && soloDigitos.length >= 11 && soloDigitos.length <= 12) {
        nums.add(n);
      }
    }
  }
  return Array.from(nums);
}

// Detecta el tipo real de la imagen por sus magic bytes. El file.type del picker
// puede mentir: en Android las galerías nombran .jpg archivos que son WEBP/HEIC
// (fotos guardadas de WhatsApp), y wasender /api/upload valida el contenido contra
// el tipo declarado ("file content does not match its declared type").
function mimeReal(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length > 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  return null; // webp/heic/gif/etc.: wasender solo acepta JPEG/PNG → recodificar
}

function bytesABase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000; // en bloques: String.fromCharCode(...todo) revienta la pila
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Recodifica a JPEG vía canvas los formatos que wasender no acepta.
async function recodificarJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer la imagen (formato no soportado)"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Persistencia del borrador (texto + imagen) para reenviar en tandas sin recargar.
const LS_MENSAJE = "wsp_draft_mensaje";
const LS_IMAGEN = "wsp_draft_imagen";
// Tope de números por corrida al enviar "De la base" (debe coincidir con
// v_max_registros en db/PROC_ENVIAR_MENSAJES_WHATSAPP.sql).
const MAX_LOTE_BASE = 50;

function leerBorradorMensaje(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_MENSAJE) ?? "";
}
function leerBorradorImagen(): { dataUrl: string; nombre: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LS_IMAGEN);
  if (!raw) return null;
  const img = JSON.parse(raw) as { dataUrl: string; nombre: string };
  // Descarta borradores guardados antes del fix de magic bytes: su mime declarado
  // puede no coincidir con el contenido real y wasender rechaza el upload (HTTP 400
  // "file content does not match its declared type").
  const m = /^data:([^;]+);base64,(.{24})/.exec(img.dataUrl);
  const bytes = m ? Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)) : null;
  if (!m || !bytes || mimeReal(bytes) !== m[1]) {
    localStorage.removeItem(LS_IMAGEN);
    return null;
  }
  return img;
}

export function WhatsappView() {
  const [tab, setTab] = useState<"base" | "manual">("base");
  const [filtro, setFiltro] = useState("");
  const [numerosManual, setNumerosManual] = useState("");
  // Texto e imagen persisten en localStorage (borrador reutilizable entre tandas).
  const [mensaje, setMensaje] = useState(leerBorradorMensaje);
  const [imagen, setImagen] = useState<{ dataUrl: string; nombre: string } | null>(
    leerBorradorImagen,
  );
  // Marca de tiempo desde la que se leen los logs de este envío.
  const [envioDesde, setEnvioDesde] = useState<string | null>(null);
  // Cantidad de destinos del envío en curso (congelada al disparar).
  const [totalDestinoEnvio, setTotalDestinoEnvio] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const numerosQuery = useQuery({
    queryKey: ["whatsapp-numeros"],
    queryFn: listarNumerosWhatsapp,
    retry: false,
  });

  const csvRef = useRef<HTMLInputElement>(null);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [avisoCarga, setAvisoCarga] = useState<string | null>(null);
  const [guiaAbierta, setGuiaAbierta] = useState(false);

  // Persiste el borrador de texto/imagen para no reescribir en cada tanda.
  useEffect(() => {
    localStorage.setItem(LS_MENSAJE, mensaje);
  }, [mensaje]);
  useEffect(() => {
    if (imagen) localStorage.setItem(LS_IMAGEN, JSON.stringify(imagen));
    else localStorage.removeItem(LS_IMAGEN);
  }, [imagen]);

  const cargarMut = useMutation({
    mutationFn: cargarNumerosWhatsapp,
    onSuccess: (r) => {
      setAvisoCarga(`${r.insertados} cargados, ${r.omitidos} ya existían`);
      numerosQuery.refetch();
    },
    onError: (e) => setAvisoCarga(e instanceof Error ? e.message : "Error al cargar"),
  });

  const borrarMut = useMutation({
    mutationFn: borrarNumerosWhatsapp,
    onSuccess: (n) => {
      setAvisoCarga(`${n} números borrados`);
      setConfirmBorrar(false);
      numerosQuery.refetch();
    },
  });

  function onCSV(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nums = parsearCSVContactos(String(reader.result));
      if (nums.length === 0) {
        setAvisoCarga("No se encontraron números válidos en el archivo");
      } else {
        cargarMut.mutate(nums);
      }
      if (csvRef.current) csvRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const contactos = useMemo(() => {
    const q = filtro.toLowerCase();
    return (numerosQuery.data ?? []).filter((c) => c.numero.toLowerCase().includes(q));
  }, [numerosQuery.data, filtro]);

  const manuales = parsearNumeros(numerosManual);

  // Poll de progreso: activo mientras haya un envío en curso; se detiene solo cuando
  // ya llegaron logs para todos los destinos.
  const logsQuery = useQuery({
    queryKey: ["whatsapp-logs", envioDesde],
    queryFn: () => logsWhatsapp(envioDesde ?? undefined),
    enabled: envioDesde != null,
    refetchInterval: (q) => {
      if (envioDesde == null) return false;
      const n = (q.state.data ?? []).length;
      const meta = totalDestinoEnvio ?? 0;
      return meta > 0 && n >= meta ? false : 4000;
    },
    retry: false,
  });

  const enviarMut = useMutation({
    mutationFn: async () => {
      // La imagen se sube primero al server Node (wasender necesita URL pública).
      const imagenUrl = imagen ? await subirImagenWhatsapp(imagen.dataUrl) : null;
      return enviarWhatsapp({
        mensaje: mensaje.trim() || null,
        imagen_url: imagenUrl,
        numeros_manual: tab === "manual" && manuales.length > 0 ? manuales : null,
      });
    },
    onMutate: () => {
      // Congela el total del envío en curso antes de que cambie la selección.
      // En "base" el backend procesa como máximo MAX_LOTE_BASE por corrida.
      setTotalDestinoEnvio(
        tab === "manual" ? manuales.length : Math.min(contactos.length, MAX_LOTE_BASE),
      );
    },
    onSuccess: () => {
      // Empieza a leer logs desde ~5s antes para no perder la primera fila.
      setEnvioDesde(new Date(Date.now() - 5000).toISOString());
    },
  });

  async function onImagen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // El mime se saca del contenido real (magic bytes), nunca de file.type:
      // wasender rechaza el upload si el tipo declarado no coincide con los bytes.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = mimeReal(bytes);
      const dataUrl = mime
        ? `data:${mime};base64,${bytesABase64(bytes)}`
        : await recodificarJpeg(file);
      // Tamaño real de lo que se sube (wasender acepta hasta 5MB).
      const size = Math.ceil(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
      if (size > 5 * 1024 * 1024) {
        alert("La imagen supera 5MB. Usá una más liviana.");
        e.target.value = "";
        return;
      }
      setImagen({ dataUrl, nombre: file.name });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo procesar la imagen");
      e.target.value = "";
    }
  }

  // Total a procesar: en "base" son los pendientes (topados al lote del backend);
  // en "manual" los escritos.
  const totalDestino =
    tab === "manual" ? manuales.length : Math.min(contactos.length, MAX_LOTE_BASE);
  const enCurso = envioDesde != null;

  const logs = logsQuery.data ?? [];
  const enviados = logs.filter((l) => l.estado === "ENVIADO").length;
  const fallidos = logs.filter((l) => l.estado !== "ENVIADO").length;
  // Terminó cuando ya llegaron logs para todos los destinos del envío en curso.
  const totalEnvio = totalDestinoEnvio ?? totalDestino;
  const terminado = enCurso && totalEnvio > 0 && logs.length >= totalEnvio;

  // Toast al terminar (una sola vez por envío). Se cierra manualmente (duration Infinity).
  const notificadoRef = useRef(false);
  useEffect(() => {
    if (!enCurso) notificadoRef.current = false;
  }, [enCurso]);
  useEffect(() => {
    if (terminado && !notificadoRef.current) {
      notificadoRef.current = true;
      toast.success("Envío finalizado", {
        description: `${enviados} enviados${fallidos > 0 ? ` · ${fallidos} fallidos` : ""}`,
        duration: Infinity,
      });
    }
  }, [terminado, enviados, fallidos]);

  // El botón se rehabilita apenas termina el envío (no hace falta cerrar la vista).
  const puedeEnviar =
    totalDestino > 0 &&
    (mensaje.trim().length > 0 || imagen != null) &&
    !enviarMut.isPending &&
    (!enCurso || terminado);

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
      {/* ── Guía de uso ───────────────────────────────────────────────────── */}
      <div className="order-first flex justify-end lg:col-span-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setGuiaAbierta(true)}
          className="gap-2 text-muted-foreground"
        >
          <HelpCircle className="h-4 w-4" />
          Guía de uso
        </Button>
      </div>

      {/* ── Destinatarios ─────────────────────────────────────────────────── */}
      <div className="order-2 rounded-2xl border border-border bg-card shadow-elegant lg:order-1">
        <div className="flex items-center gap-3 border-b border-border p-4 sm:p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Phone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold">Destinatarios</h2>
            <p className="text-sm text-muted-foreground">
              {totalDestino} número{totalDestino === 1 ? "" : "s"} a procesar
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="p-4 sm:p-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="base">De la base</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          {/* Pendientes en numeros_whatsapp */}
          <TabsContent value="base" className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar número..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="h-10 pl-10"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => numerosQuery.refetch()}
                disabled={numerosQuery.isFetching}
                aria-label="Recargar"
              >
                <RefreshCw className={cn("h-4 w-4", numerosQuery.isFetching && "animate-spin")} />
              </Button>
            </div>

            {/* Importar CSV / Borrar todos */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => csvRef.current?.click()}
                disabled={cargarMut.isPending}
                className="flex-1 gap-2"
              >
                {cargarMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Importar CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmBorrar(true)}
                disabled={numerosQuery.data?.length === 0 || borrarMut.isPending}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Borrar todos</span>
              </Button>
              <input
                ref={csvRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onCSV}
                className="hidden"
              />
            </div>

            {avisoCarga && (
              <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                {avisoCarga}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Se envía en lotes de <span className="font-medium">{MAX_LOTE_BASE}</span> por corrida.
              {contactos.length > MAX_LOTE_BASE ? (
                <>
                  {" "}
                  Ahora se enviará a los primeros{" "}
                  <span className="font-medium">{MAX_LOTE_BASE}</span> de{" "}
                  <span className="font-medium">{contactos.length}</span> pendientes; repetí el
                  envío para los siguientes.
                </>
              ) : (
                <> Se enviará a los {contactos.length} pendientes.</>
              )}{" "}
              Los ya enviados se omiten. El CSV es el export de Google Contactos.
            </p>

            {numerosQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : numerosQuery.isError ? (
              <p className="py-8 text-center text-sm text-destructive">
                {numerosQuery.error instanceof Error
                  ? numerosQuery.error.message
                  : "No se pudieron cargar los números"}
              </p>
            ) : contactos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {filtro ? "Sin resultados." : "No hay números pendientes."}
              </p>
            ) : (
              <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1 sm:max-h-[420px]">
                {contactos.map((c) => (
                  <NumeroRow key={c.id} numero={c} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Manuales */}
          <TabsContent value="manual" className="mt-4 space-y-2">
            <Label htmlFor="numeros">Números (uno por línea o separados por coma)</Label>
            <Textarea
              id="numeros"
              value={numerosManual}
              onChange={(e) => setNumerosManual(e.target.value)}
              placeholder={"+595981123456\n595982654321\n..."}
              rows={8}
              className="min-h-[160px] font-mono text-sm sm:min-h-[240px]"
            />
            <p className="text-xs text-muted-foreground">
              Detectados: {manuales.length}. Se agregarán a la base y se enviarán.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Mensaje + envío + progreso ────────────────────────────────────── */}
      <div className="order-1 space-y-4 sm:space-y-6 lg:order-2">
        <div className="rounded-2xl border border-border bg-card shadow-elegant">
          <div className="flex items-center gap-3 border-b border-border p-4 sm:p-5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-xl font-bold">Mensaje</h2>
              <p className="text-sm text-muted-foreground">Se guarda para reenviar en tandas</p>
            </div>
            {(mensaje || imagen) && !enCurso && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMensaje("");
                  setImagen(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-muted-foreground"
              >
                Limpiar
              </Button>
            )}
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="space-y-2">
              <Label htmlFor="mensaje">Texto</Label>
              <Textarea
                id="mensaje"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Escribe el mensaje o el pie de la imagen..."
                rows={5}
                disabled={enCurso && !terminado}
              />
            </div>

            <div className="space-y-2">
              <Label>Imagen promocional (opcional)</Label>
              {imagen ? (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  <img
                    src={imagen.dataUrl}
                    alt="Vista previa"
                    className="max-h-56 w-full bg-muted object-contain"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      setImagen(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    disabled={enCurso && !terminado}
                    className="absolute right-2 top-2 h-8 w-8"
                    aria-label="Quitar imagen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <p className="truncate border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
                    {imagen.nombre}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={enCurso && !terminado}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background py-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <ImageIcon className="h-7 w-7" />
                  <span className="text-sm font-medium">Subir imagen</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onImagen}
                className="hidden"
              />
            </div>

            <Button
              type="button"
              onClick={() => enviarMut.mutate()}
              disabled={!puedeEnviar}
              className="w-full bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
            >
              {enviarMut.isPending || (enCurso && !terminado) ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {enCurso && !terminado
                ? "Enviando..."
                : `Enviar a ${totalDestino} número${totalDestino === 1 ? "" : "s"}`}
            </Button>

            {enviarMut.isError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {enviarMut.error instanceof Error ? enviarMut.error.message : "No se pudo enviar"}
              </p>
            )}
          </div>
        </div>

        {/* Progreso del envío */}
        {enCurso && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold">
                {terminado ? "Envío finalizado" : "Progreso"}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEnvioDesde(null);
                  setTotalDestinoEnvio(null);
                  numerosQuery.refetch();
                }}
              >
                Cerrar
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {enviados} enviados
              </Badge>
              {fallidos > 0 && (
                <Badge variant="outline" className="text-destructive">
                  <XCircle className="mr-1 h-3.5 w-3.5" /> {fallidos} fallidos
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {logs.length}/{totalDestino}
              </span>
              {!terminado && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              El envío corre en segundo plano (~20s entre números). Puedes cerrar esta vista; el
              proceso continúa en el servidor.
            </p>

            {logs.length > 0 && (
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                {logs.map((l, i) => (
                  <div
                    key={`${l.numero}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1"
                  >
                    <span className="font-mono text-xs">{l.numero}</span>
                    <span
                      className={cn(
                        "text-xs",
                        l.estado === "ENVIADO" ? "text-primary" : "text-destructive",
                      )}
                    >
                      {l.detalle ?? l.estado}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Guía de uso de la página */}
      <Dialog open={guiaAbierta} onOpenChange={setGuiaAbierta}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Cómo enviar mensajes a WhatsApp
            </DialogTitle>
            <DialogDescription>
              Envío masivo de texto y/o imagen a una lista de números.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <section>
              <h4 className="mb-1 font-semibold">1. Elegí los destinatarios</h4>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  <b className="text-foreground">De la base:</b> se envía a todos los números{" "}
                  <b className="text-foreground">pendientes</b> (los que ya recibieron el mensaje se
                  omiten solos). Podés importarlos con{" "}
                  <b className="text-foreground">Importar CSV</b> usando el export de Google
                  Contactos: toma los celulares paraguayos (+595) y descarta duplicados y códigos
                  cortos.
                </li>
                <li>
                  <b className="text-foreground">Manual:</b> pegá los números (uno por línea o
                  separados por coma). Se agregan a la base y se envía solo a esos.
                </li>
              </ul>
            </section>

            <section>
              <h4 className="mb-1 font-semibold">2. Escribí el mensaje</h4>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Texto, imagen (máx. 5MB) o ambos: la imagen va con el texto como pie.</li>
                <li>
                  El borrador se <b className="text-foreground">guarda solo</b>: podés salir de la
                  página y seguir después, o reusar el mismo mensaje para otra tanda.
                </li>
              </ul>
            </section>

            <section>
              <h4 className="mb-1 font-semibold">3. Enviá y seguí el progreso</h4>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  El envío corre <b className="text-foreground">en el servidor</b> (~20 segundos
                  entre números para evitar bloqueos). Podés cerrar la página; el proceso continúa.
                </li>
                <li>
                  El panel de progreso muestra enviados y fallidos en vivo, y avisa al terminar.
                </li>
                <li>
                  Los fallidos quedan marcados <b className="text-foreground">Reintentar</b> en la
                  lista: el próximo envío "De la base" los incluye de nuevo automáticamente.
                </li>
              </ul>
            </section>

            <section className="rounded-lg bg-primary/10 p-3 text-xs text-muted-foreground">
              <b className="text-foreground">Consejo:</b> para listas grandes conviene enviar en
              tandas. Como los enviados se omiten y el borrador se conserva, basta volver a tocar
              "Enviar" para continuar donde quedó.
            </section>
          </div>

          <Button onClick={() => setGuiaAbierta(false)} className="w-full">
            Entendido
          </Button>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado de todos los números */}
      <AlertDialog open={confirmBorrar} onOpenChange={setConfirmBorrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar todos los números?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán <span className="font-semibold">todos</span> los números de la base.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                borrarMut.mutate();
              }}
              disabled={borrarMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {borrarMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Borrar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NumeroRow({ numero }: { numero: NumeroWhatsapp }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Phone className="h-4 w-4" />
      </div>
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{numero.numero}</span>
      {numero.mensajeado === "E" && (
        <Badge variant="outline" className="text-destructive">
          Reintentar
        </Badge>
      )}
    </div>
  );
}
