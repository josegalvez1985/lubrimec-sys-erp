import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarPlus,
  Car,
  ChevronLeft,
  ChevronRight,
  Eye,
  IdCard,
  List,
  Loader2,
  Package,
  Pencil,
  Phone,
  Plus,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { BuscadorSelect } from "@/components/ui/buscador-select";
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
import {
  actualizarAgendaCita,
  buscarClientesPOS,
  crearAgendaCita,
  eliminarAgendaCita,
  listarAgendaCitas,
  type AgendaCita,
  type AgendaCitaInput,
  type ProveedorBusqueda,
} from "@/lib/api";

// Agenda de Citas (pág 121): citas y visitas a clientes (AGENDA_CITAS).
//
// Dos pestañas sobre el mismo CRUD:
//   - Agenda: semana de lunes a domingo con una tira de días (cantidad de citas
//     por día) y, debajo, la línea de tiempo del día elegido ordenada por hora.
//     Consulta solo la semana visible (desde/hasta).
//   - Listado: todas las citas en un DataTable (buscar, ordenar, Excel), con un
//     selector Próximas / Pasadas / Todas. Se consulta recién al abrirla.
//
// Las fechas viajan como 'YYYY-MM-DD' y se manejan como fecha LOCAL (sin pasar
// por toISOString, que en Paraguay corre el día después de las 21:00).

// TODO: cod_empresa fijo; reemplazar cuando venga de la sesión.
const COD_EMPRESA = 24;

// ─── Fechas ──────────────────────────────────────────────────────────────────

function aIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function deIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sumarDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Lunes de la semana de `d` (la semana va de lunes a domingo).
function lunesDe(d: Date): Date {
  return sumarDias(d, -((d.getDay() + 6) % 7));
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const fmtDiaSemana = new Intl.DateTimeFormat("es-PY", { weekday: "short" });
const fmtDiaLargo = new Intl.DateTimeFormat("es-PY", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const fmtFechaLarga = new Intl.DateTimeFormat("es-PY", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtMes = new Intl.DateTimeFormat("es-PY", { month: "long" });

function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "17 al 23 de noviembre de 2026", "29 de diciembre de 2025 al 4 de enero de 2026"…
function tituloSemana(lunes: Date): string {
  const dom = sumarDias(lunes, 6);
  const m1 = fmtMes.format(lunes);
  const m2 = fmtMes.format(dom);
  if (lunes.getFullYear() !== dom.getFullYear()) {
    return `${lunes.getDate()} de ${m1} de ${lunes.getFullYear()} al ${dom.getDate()} de ${m2} de ${dom.getFullYear()}`;
  }
  if (m1 !== m2) {
    return `${lunes.getDate()} de ${m1} al ${dom.getDate()} de ${m2} de ${dom.getFullYear()}`;
  }
  return `${lunes.getDate()} al ${dom.getDate()} de ${m1} de ${dom.getFullYear()}`;
}

function horaActual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Orden del día: por hora, las citas sin hora al final, y por cliente.
function ordenCitas(a: AgendaCita, b: AgendaCita): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  const ha = a.hora ?? "99:99";
  const hb = b.hora ?? "99:99";
  if (ha !== hb) return ha < hb ? -1 : 1;
  return (a.cliente ?? "").localeCompare(b.cliente ?? "");
}

function citasPlural(n: number): string {
  return `${n} ${n === 1 ? "cita" : "citas"}`;
}

// La LOV de clientes del POS arma el nombre como "NOMBRE-RUC" (o CI); acá el
// documento ya va en la segunda línea, así que se le saca ese sufijo.
function nombreCliente(p: ProveedorBusqueda): string {
  const nombre = p.nombre ?? `Cliente ${p.cod_persona}`;
  const doc = p.nro_ruc ?? p.nro_ci;
  return doc && nombre.endsWith(`-${doc}`) ? nombre.slice(0, -(doc.length + 1)) : nombre;
}

function documento(c: AgendaCita): string | null {
  const partes = [c.nro_ruc ? `RUC ${c.nro_ruc}` : null, c.nro_ci ? `CI ${c.nro_ci}` : null];
  return partes.filter(Boolean).join(", ") || null;
}

// ─── Vista ───────────────────────────────────────────────────────────────────

type FormState =
  | { mode: "closed" }
  | { mode: "create"; fecha: string }
  | { mode: "edit"; cita: AgendaCita };

export function AgendaCitasView() {
  const qc = useQueryClient();
  const [pestana, setPestana] = useState<"agenda" | "listado">("agenda");
  const [listadoAbierto, setListadoAbierto] = useState(false);
  const [dia, setDia] = useState(() => aIso(new Date()));
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [detalle, setDetalle] = useState<AgendaCita | null>(null);
  const [aEliminar, setAEliminar] = useState<AgendaCita | null>(null);

  const lunes = lunesDe(deIso(dia));
  const desde = aIso(lunes);
  const hasta = aIso(sumarDias(lunes, 6));

  const semanaQ = useQuery({
    queryKey: ["agenda-citas", COD_EMPRESA, desde, hasta],
    queryFn: () => listarAgendaCitas(COD_EMPRESA, { desde, hasta }),
    retry: false,
  });

  const todasQ = useQuery({
    queryKey: ["agenda-citas", COD_EMPRESA, "todas"],
    queryFn: () => listarAgendaCitas(COD_EMPRESA),
    enabled: listadoAbierto,
    retry: false,
  });

  // Citas ya cargadas (semana + listado) para avisar si un horario está ocupado.
  const conocidas = useMemo(
    () => [...(semanaQ.data ?? []), ...(todasQ.data ?? [])],
    [semanaQ.data, todasQ.data],
  );

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarAgendaCita(id, COD_EMPRESA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenda-citas"] });
      setAEliminar(null);
      setDetalle(null);
      toast.success("Cita eliminada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo eliminar la cita"),
  });

  const nueva = (fecha: string) => setForm({ mode: "create", fecha });

  return (
    <div className="space-y-3">
      <Tabs
        value={pestana}
        onValueChange={(v) => {
          setPestana(v as typeof pestana);
          if (v === "listado") setListadoAbierto(true);
        }}
      >
        <TabsList>
          <TabsTrigger value="agenda" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Agenda
          </TabsTrigger>
          <TabsTrigger value="listado" className="gap-1.5">
            <List className="h-4 w-4" />
            Listado
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div hidden={pestana !== "agenda"}>
        <AgendaSemana
          dia={dia}
          onDia={setDia}
          lunes={lunes}
          citas={semanaQ.data ?? []}
          cargando={semanaQ.isLoading}
          error={semanaQ.isError ? semanaQ.error : null}
          onNueva={nueva}
          onVer={setDetalle}
        />
      </div>

      {listadoAbierto && (
        <div hidden={pestana !== "listado"}>
          <ListadoCitas
            citas={todasQ.data ?? []}
            cargando={todasQ.isLoading}
            error={todasQ.isError ? todasQ.error : null}
            onNueva={() => nueva(aIso(new Date()))}
            onVer={setDetalle}
            onEditar={(c) => setForm({ mode: "edit", cita: c })}
            onEliminar={setAEliminar}
          />
        </div>
      )}

      <CitaDialog
        state={form}
        conocidas={conocidas}
        onClose={() => setForm({ mode: "closed" })}
        onSaved={(fecha, creada) => {
          qc.invalidateQueries({ queryKey: ["agenda-citas"] });
          setForm({ mode: "closed" });
          setDetalle(null);
          setDia(fecha); // la agenda salta al día de la cita guardada
          toast.success(creada ? "Cita agendada" : "Cita actualizada");
        }}
      />

      <CitaDetalle
        cita={detalle}
        onClose={() => setDetalle(null)}
        onEditar={(c) => {
          setDetalle(null);
          setForm({ mode: "edit", cita: c });
        }}
        onEliminar={setAEliminar}
      />

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la cita?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cita de{" "}
              <span className="font-semibold text-foreground">
                {aEliminar?.cliente ?? "este cliente"}
              </span>{" "}
              del {fmtFecha(aEliminar?.fecha)}
              {aEliminar?.hora ? ` a las ${aEliminar.hora}` : ""}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aEliminar) eliminarMut.mutate(aEliminar.id_agenda);
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

// ─── Pestaña Agenda ──────────────────────────────────────────────────────────

function AgendaSemana({
  dia,
  onDia,
  lunes,
  citas,
  cargando,
  error,
  onNueva,
  onVer,
}: {
  dia: string;
  onDia: (iso: string) => void;
  lunes: Date;
  citas: AgendaCita[];
  cargando: boolean;
  error: unknown;
  onNueva: (fecha: string) => void;
  onVer: (c: AgendaCita) => void;
}) {
  const hoy = aIso(new Date());
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

  const porDia = useMemo(() => {
    const m = new Map<string, AgendaCita[]>();
    for (const c of [...citas].sort(ordenCitas)) {
      const l = m.get(c.fecha);
      if (l) l.push(c);
      else m.set(c.fecha, [c]);
    }
    return m;
  }, [citas]);

  const delDia = porDia.get(dia) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      {/* Encabezado: semana + navegación */}
      <div className="flex flex-col gap-3 border-b border-border p-[var(--panel-p)] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">{mayuscula(tituloSemana(lunes))}</h2>
          <p className="text-sm text-muted-foreground">
            {cargando ? "Cargando citas…" : `${citasPlural(citas.length)} esta semana`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Semana anterior"
              onClick={() => onDia(aIso(sumarDias(deIso(dia), -7)))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="px-3"
              disabled={dia === hoy}
              onClick={() => onDia(hoy)}
            >
              Hoy
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Semana siguiente"
              onClick={() => onDia(aIso(sumarDias(deIso(dia), 7)))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && onDia(e.target.value)}
            aria-label="Ir a una fecha"
            className="w-auto min-w-0 flex-1 sm:flex-none"
          />
          {/* En el celular solo el ícono, para que entre en la misma fila. */}
          <Button
            onClick={() => onNueva(dia)}
            aria-label="Nueva cita"
            className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva cita</span>
          </Button>
        </div>
      </div>

      {/* Tira de días */}
      <div className="grid grid-cols-7 gap-1.5 border-b border-border p-[var(--panel-p)] sm:gap-2">
        {dias.map((d) => {
          const iso = aIso(d);
          const n = porDia.get(iso)?.length ?? 0;
          const sel = iso === dia;
          const esHoy = iso === hoy;
          const pasado = iso < hoy;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDia(iso)}
              aria-pressed={sel}
              aria-label={`${fmtDiaLargo.format(d)}${esHoy ? ", hoy" : ""}: ${n === 0 ? "sin citas" : citasPlural(n)}`}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                sel
                  ? "border-transparent bg-gradient-primary text-primary-foreground shadow-glow"
                  : "border-border hover:border-primary/40 hover:bg-accent",
                !sel && esHoy && "border-primary/60",
                !sel && pasado && "text-muted-foreground",
              )}
            >
              <span className="text-xs capitalize">{fmtDiaSemana.format(d).replace(".", "")}</span>
              <span
                className={cn(
                  "font-display text-xl font-bold leading-none tabular-nums sm:text-2xl",
                  !sel && esHoy && "text-primary",
                )}
              >
                {d.getDate()}
              </span>
              <span className="flex h-2 items-center gap-0.5" aria-hidden>
                {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      sel ? "bg-primary-foreground" : "bg-primary",
                    )}
                  />
                ))}
                {n > 3 && <span className="text-[10px] font-semibold leading-none">+</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Día elegido */}
      <div className="p-[var(--panel-p)]">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">
            {mayuscula(fmtDiaLargo.format(deIso(dia)))}
            {dia === hoy && <span className="ml-2 text-sm font-medium text-primary">Hoy</span>}
          </h3>
          {!cargando && delDia.length > 0 && (
            <span className="shrink-0 text-sm text-muted-foreground">
              {citasPlural(delDia.length)}
            </span>
          )}
        </div>

        {cargando ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar las citas"}
          </p>
        ) : delDia.length === 0 ? (
          <div className="grid place-items-center py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarPlus className="h-6 w-6" />
            </div>
            <p className="mt-4 font-medium">No hay citas para este día</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Elegí otro día de la semana o agendá una cita nueva.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => onNueva(dia)}>
              <Plus className="h-4 w-4" />
              Agendar cita
            </Button>
          </div>
        ) : (
          <LineaDelDia citas={delDia} esHoy={dia === hoy} onVer={onVer} />
        )}
      </div>
    </div>
  );
}

// Línea de tiempo del día: la hora a la izquierda y la cita a la derecha. Si el
// día es hoy, una marca "Ahora" separa lo que ya pasó de lo que viene (se
// refresca cada minuto).
function LineaDelDia({
  citas,
  esHoy,
  onVer,
}: {
  citas: AgendaCita[];
  esHoy: boolean;
  onVer: (c: AgendaCita) => void;
}) {
  const [ahora, setAhora] = useState(horaActual);
  useEffect(() => {
    if (!esHoy) return;
    const id = setInterval(() => setAhora(horaActual()), 60_000);
    return () => clearInterval(id);
  }, [esHoy]);

  // Horas con más de una cita: se marcan para que no pasen desapercibidas.
  const repetidas = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of citas) if (c.hora) n.set(c.hora, (n.get(c.hora) ?? 0) + 1);
    return new Set([...n].filter(([, k]) => k > 1).map(([h]) => h));
  }, [citas]);

  // Posición de la marca "Ahora": antes de la primera cita con hora futura;
  // las citas sin hora quedan siempre después.
  const idxAhora = esHoy
    ? (() => {
        const i = citas.findIndex((c) => !c.hora || c.hora > ahora);
        return i === -1 ? citas.length : i;
      })()
    : -1;

  const marcaAhora = (
    <li
      key="ahora"
      aria-label={`Ahora, ${ahora}`}
      className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
    >
      <span className="text-right text-xs font-semibold tabular-nums text-primary">{ahora}</span>
      <span className="relative flex items-center" aria-hidden>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/15" />
        <span className="h-px flex-1 bg-primary/60" />
      </span>
    </li>
  );

  return (
    <ol className="space-y-3">
      {citas.map((c, i) => {
        const pasada = esHoy && i < idxAhora;
        return [
          i === idxAhora ? marcaAhora : null,
          <li
            key={c.id_agenda}
            className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
          >
            <div className="pt-3 text-right">
              {c.hora ? (
                <span
                  className={cn(
                    "font-display text-lg font-bold leading-none tabular-nums",
                    pasada && "text-muted-foreground",
                  )}
                >
                  {c.hora}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Sin hora</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onVer(c)}
              className={cn(
                "min-w-0 rounded-xl border border-border border-l-4 bg-background p-3 text-left outline-none transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
                pasada ? "border-l-muted-foreground/30" : "border-l-primary",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={cn("truncate font-semibold", pasada && "text-muted-foreground")}>
                  {c.cliente ?? `Cliente ${c.cod_persona}`}
                </p>
                {c.hora && repetidas.has(c.hora) && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="h-3 w-3" />
                    Mismo horario
                  </span>
                )}
              </div>
              {c.vehiculo && (
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <Car className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.vehiculo}</span>
                </p>
              )}
              {c.trabajos && (
                <p className="mt-2 flex gap-1.5 text-sm">
                  <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2 whitespace-pre-line">{c.trabajos}</span>
                </p>
              )}
              {c.repuestos && (
                <p className="mt-1 flex gap-1.5 text-sm text-muted-foreground">
                  <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-1">{c.repuestos}</span>
                </p>
              )}
            </button>
          </li>,
        ];
      })}
      {idxAhora === citas.length && marcaAhora}
    </ol>
  );
}

// ─── Pestaña Listado ─────────────────────────────────────────────────────────

type Periodo = "proximas" | "pasadas" | "todas";

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: "proximas", texto: "Próximas" },
  { valor: "pasadas", texto: "Pasadas" },
  { valor: "todas", texto: "Todas" },
];

function ListadoCitas({
  citas,
  cargando,
  error,
  onNueva,
  onVer,
  onEditar,
  onEliminar,
}: {
  citas: AgendaCita[];
  cargando: boolean;
  error: unknown;
  onNueva: () => void;
  onVer: (c: AgendaCita) => void;
  onEditar: (c: AgendaCita) => void;
  onEliminar: (c: AgendaCita) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("proximas");
  const hoy = aIso(new Date());

  const filas = useMemo(
    () =>
      citas.filter((c) =>
        periodo === "proximas" ? c.fecha >= hoy : periodo === "pasadas" ? c.fecha < hoy : true,
      ),
    [citas, periodo, hoy],
  );

  const COLUMNAS: Column<AgendaCita>[] = [
    {
      key: "fecha",
      header: "Fecha",
      accessor: (r) => r.fecha,
      render: (r) => <span className="tabular-nums">{fmtFecha(r.fecha)}</span>,
      className: "w-28",
    },
    {
      key: "hora",
      header: "Hora",
      accessor: (r) => r.hora ?? null,
      render: (r) => <span className="tabular-nums">{r.hora ?? "—"}</span>,
      className: "w-20",
    },
    {
      key: "cliente",
      header: "Cliente",
      hideable: false,
      accessor: (r) => r.cliente ?? null,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.cliente ?? `Cliente ${r.cod_persona}`}</p>
          {(r.nro_ruc || r.nro_ci) && (
            <p className="text-xs text-muted-foreground">
              {r.nro_ruc ? `RUC ${r.nro_ruc}` : `CI ${r.nro_ci}`}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "nro_telefono",
      header: "Teléfono",
      accessor: (r) => r.nro_telefono ?? null,
    },
    {
      key: "vehiculo",
      header: "Vehículo",
      accessor: (r) => r.vehiculo ?? null,
    },
    {
      key: "trabajos",
      header: "Trabajos",
      accessor: (r) => r.trabajos ?? null,
      render: (r) =>
        r.trabajos ? <span className="line-clamp-2 max-w-xs">{r.trabajos}</span> : "—",
    },
    {
      key: "repuestos",
      header: "Repuestos",
      accessor: (r) => r.repuestos ?? null,
      render: (r) =>
        r.repuestos ? <span className="line-clamp-2 max-w-xs">{r.repuestos}</span> : "—",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border p-[var(--panel-p)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Citas agendadas</h2>
          <p className="text-sm text-muted-foreground">
            {cargando ? "Cargando citas…" : citasPlural(filas.length)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Período"
            className="inline-flex rounded-lg border border-border p-0.5"
          >
            {PERIODOS.map((p) => (
              <Button
                key={p.valor}
                size="sm"
                variant={periodo === p.valor ? "default" : "ghost"}
                aria-pressed={periodo === p.valor}
                onClick={() => setPeriodo(p.valor)}
              >
                {p.texto}
              </Button>
            ))}
          </div>
          <Button
            onClick={onNueva}
            className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Nueva cita
          </Button>
        </div>
      </div>

      <div className="p-[var(--panel-p)]">
        {cargando ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "No se pudieron cargar las citas"}
          </p>
        ) : (
          <DataTable
            // Al cambiar de período se reinicia el orden: próximas de la más
            // cercana a la más lejana; pasadas y todas, de la más reciente.
            key={periodo}
            columns={COLUMNAS}
            rows={filas}
            getRowId={(r) => r.id_agenda}
            initialSort={{ key: "fecha", dir: periodo === "proximas" ? "asc" : "desc" }}
            searchPlaceholder="Buscar cliente, vehículo, trabajo…"
            emptyText={
              periodo === "proximas" ? "No hay citas próximas." : "No hay citas para mostrar."
            }
            exportName="agenda-citas"
            actions={(r) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => onVer(r)}
                  aria-label="Ver"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => onEditar(r)}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onEliminar(r)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}

// ─── Detalle de una cita ─────────────────────────────────────────────────────

function Dato({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Car;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{titulo}</dt>
        <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{children}</dd>
      </div>
    </div>
  );
}

function CitaDetalle({
  cita,
  onClose,
  onEditar,
  onEliminar,
}: {
  cita: AgendaCita | null;
  onClose: () => void;
  onEditar: (c: AgendaCita) => void;
  onEliminar: (c: AgendaCita) => void;
}) {
  return (
    <Dialog open={!!cita} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {cita && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">
                {cita.cliente ?? `Cliente ${cita.cod_persona}`}
              </DialogTitle>
              <DialogDescription>
                {mayuscula(fmtFechaLarga.format(deIso(cita.fecha)))}
                {cita.hora ? `, a las ${cita.hora}` : ", sin hora fija"}
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-4">
              {documento(cita) && (
                <Dato icono={IdCard} titulo="Documento">
                  {documento(cita)}
                </Dato>
              )}
              {cita.nro_telefono && (
                <Dato icono={Phone} titulo="Teléfono">
                  <a
                    href={`tel:${cita.nro_telefono.replace(/[^\d+]/g, "")}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {cita.nro_telefono}
                  </a>
                </Dato>
              )}
              <Dato icono={Car} titulo="Vehículo">
                {cita.vehiculo ?? <span className="text-muted-foreground">—</span>}
              </Dato>
              <Dato icono={Wrench} titulo="Trabajos a realizar">
                {cita.trabajos ?? <span className="text-muted-foreground">—</span>}
              </Dato>
              <Dato icono={Package} titulo="Repuestos">
                {cita.repuestos ?? <span className="text-muted-foreground">—</span>}
              </Dato>
            </dl>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onEliminar(cita)}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
              <Button
                type="button"
                onClick={() => onEditar(cita)}
                className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Formulario crear / editar ───────────────────────────────────────────────

const MAX_VEHICULO = 200;
// Las columnas cuentan bytes (4000) y una letra con tilde ocupa dos: con 2000
// caracteres entra siempre.
const MAX_TEXTO = 2000;

function CitaDialog({
  state,
  conocidas,
  onClose,
  onSaved,
}: {
  state: FormState;
  conocidas: AgendaCita[];
  onClose: () => void;
  onSaved: (fecha: string, creada: boolean) => void;
}) {
  const open = state.mode !== "closed";
  const cita = state.mode === "edit" ? state.cita : null;

  const [codPersona, setCodPersona] = useState<number | null>(null);
  const [clienteLabel, setClienteLabel] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [vehiculo, setVehiculo] = useState("");
  const [trabajos, setTrabajos] = useState("");
  const [repuestos, setRepuestos] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza el form al abrir según la cita (o el día) elegido.
  const [lastKey, setLastKey] = useState("");
  const key =
    state.mode === "edit"
      ? `edit:${state.cita.id_agenda}`
      : state.mode === "create"
        ? `create:${state.fecha}`
        : "closed";
  if (open && key !== lastKey) {
    setLastKey(key);
    setCodPersona(cita?.cod_persona ?? null);
    setClienteLabel(cita?.cliente ?? (cita ? `Cliente ${cita.cod_persona}` : ""));
    setFecha(cita?.fecha ?? (state.mode === "create" ? state.fecha : ""));
    setHora(cita?.hora ?? "");
    setVehiculo(cita?.vehiculo ?? "");
    setTrabajos(cita?.trabajos ?? "");
    setRepuestos(cita?.repuestos ?? "");
    setError("");
  }
  if (!open && lastKey !== "") setLastKey("");

  // Aviso (no bloquea): otra cita ya cargada en el mismo día y hora.
  const ocupado =
    hora && fecha
      ? conocidas.find(
          (c) => c.fecha === fecha && c.hora === hora && c.id_agenda !== cita?.id_agenda,
        )
      : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (codPersona == null) {
      setError("Elegí el cliente de la cita.");
      return;
    }
    if (!fecha) {
      setError("Indicá la fecha de la cita.");
      return;
    }
    setSaving(true);
    try {
      const input: AgendaCitaInput = {
        cod_empresa: COD_EMPRESA,
        cod_persona: codPersona,
        fecha,
        hora: hora || null,
        vehiculo: vehiculo.trim() || null,
        trabajos: trabajos.trim() || null,
        repuestos: repuestos.trim() || null,
      };
      if (state.mode === "edit") {
        await actualizarAgendaCita(state.cita.id_agenda, input);
      } else {
        await crearAgendaCita(input);
      }
      onSaved(fecha, state.mode !== "edit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la cita");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      {/* Sin foco automático: el primer campo es el buscador de clientes, que
          abría su lista (y el teclado en el celular) tapando el formulario. */}
      <DialogContent className="sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{state.mode === "edit" ? "Editar cita" : "Nueva cita"}</DialogTitle>
          <DialogDescription>
            Elegí el cliente, el día y lo que hay que hacer. La hora es opcional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <BuscadorSelect
              placeholder="Buscar cliente por nombre, RUC o CI..."
              emptyLabel="Sin clientes"
              value={codPersona}
              label={clienteLabel}
              buscar={(q) => buscarClientesPOS(COD_EMPRESA, q)}
              itemKey={(p) => p.cod_persona}
              itemTitle={nombreCliente}
              itemSub={(p) => [p.nro_ruc, p.nro_ci].filter(Boolean).join(", ") || "—"}
              onSelect={(p) => {
                setCodPersona(p.cod_persona);
                setClienteLabel(nombreCliente(p));
              }}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex h-5 items-center">
                <Label htmlFor="cita-fecha">Fecha</Label>
              </div>
              <Input
                id="cita-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex h-5 items-center justify-between">
                <Label htmlFor="cita-hora">Hora</Label>
                {hora && (
                  <button
                    type="button"
                    onClick={() => setHora("")}
                    disabled={saving}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    Quitar hora
                  </button>
                )}
              </div>
              <Input
                id="cita-hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value.slice(0, 5))}
                disabled={saving}
              />
            </div>
          </div>

          {ocupado && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {ocupado.cliente ?? "Otro cliente"} ya tiene una cita a esa hora. Podés guardar
                igual.
              </span>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="cita-vehiculo">Vehículo</Label>
            <Input
              id="cita-vehiculo"
              value={vehiculo}
              onChange={(e) => setVehiculo(e.target.value)}
              placeholder="Modelo, año, chapa…"
              maxLength={MAX_VEHICULO}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cita-trabajos">Trabajos a realizar</Label>
            <Textarea
              id="cita-trabajos"
              value={trabajos}
              onChange={(e) => setTrabajos(e.target.value)}
              placeholder="Cambio de aceite, revisión de frenos…"
              rows={3}
              maxLength={MAX_TEXTO}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cita-repuestos">Repuestos</Label>
            <Textarea
              id="cita-repuestos"
              value={repuestos}
              onChange={(e) => setRepuestos(e.target.value)}
              placeholder="Filtro de aceite, 4 litros 10W-40…"
              rows={2}
              maxLength={MAX_TEXTO}
              disabled={saving}
            />
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
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {state.mode === "edit" ? "Guardar cambios" : "Agendar cita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
