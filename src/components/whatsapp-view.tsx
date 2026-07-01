import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

// Persistencia del borrador (texto + imagen) para reenviar en tandas sin recargar.
const LS_MENSAJE = "wsp_draft_mensaje";
const LS_IMAGEN = "wsp_draft_imagen";

function leerBorradorMensaje(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_MENSAJE) ?? "";
}
function leerBorradorImagen(): { dataUrl: string; nombre: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LS_IMAGEN);
  return raw ? (JSON.parse(raw) as { dataUrl: string; nombre: string }) : null;
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
      setTotalDestinoEnvio(tab === "manual" ? manuales.length : contactos.length);
    },
    onSuccess: () => {
      // Empieza a leer logs desde ~5s antes para no perder la primera fila.
      setEnvioDesde(new Date(Date.now() - 5000).toISOString());
    },
  });

  function onImagen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Se sube la imagen original sin recomprimir. wasender /api/upload acepta hasta
    // 5MB (JPEG/PNG); solo validamos ese límite.
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen supera 5MB. Usá una más liviana.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagen({ dataUrl: String(reader.result), nombre: file.name });
    reader.readAsDataURL(file);
  }

  // Total a procesar: en "base" son los pendientes de la tabla; en "manual" los escritos.
  const totalDestino = tab === "manual" ? manuales.length : contactos.length;
  const enCurso = envioDesde != null;

  const logs = logsQuery.data ?? [];
  const enviados = logs.filter((l) => l.estado === "ENVIADO").length;
  const fallidos = logs.filter((l) => l.estado !== "ENVIADO").length;
  // Terminó cuando ya llegaron logs para todos los destinos del envío en curso.
  const totalEnvio = totalDestinoEnvio ?? totalDestino;
  const terminado = enCurso && totalEnvio > 0 && logs.length >= totalEnvio;

  // El botón se rehabilita apenas termina el envío (no hace falta cerrar la vista).
  const puedeEnviar =
    totalDestino > 0 &&
    (mensaje.trim().length > 0 || imagen != null) &&
    !enviarMut.isPending &&
    (!enCurso || terminado);

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
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
              <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">{avisoCarga}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Se enviará a todos los números <span className="font-medium">pendientes</span> de la
              base (los ya enviados se omiten). El CSV es el export de Google Contactos.
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
              <input ref={fileRef} type="file" accept="image/*" onChange={onImagen} className="hidden" />
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
