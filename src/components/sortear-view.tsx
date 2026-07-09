import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { telefonosSorteo } from "@/lib/api";

// Muestra solo los últimos 4 dígitos (••••9999), como el JS de la pág 108.
const maskPhone = (num: string) => num.slice(-4).padStart(num.length, "•");

const DURACION_MS = 10000; // 10 s de animación
const INTERVALO_MS = 100;

// Vista de la página 108 (Sortear): elige un teléfono al azar entre las ventas
// del rango de fechas. La animación y el enmascarado son 100% front.
export function SortearView() {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [display, setDisplay] = useState(""); // lo que se ve en pantalla
  const [ganador, setGanador] = useState(""); // número completo del ganador
  const [sorteando, setSorteando] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Corta la animación si se desmonta la vista.
  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  async function sortear() {
    if (!fechaDesde || !fechaHasta) {
      toast.error("Indica fecha desde y fecha hasta");
      return;
    }
    setSorteando(true);
    setGanador("");
    setDisplay("");
    try {
      const lista = await telefonosSorteo(fechaDesde, fechaHasta);
      if (lista.length === 0) {
        toast.error("No hay participantes en ese rango de fechas.");
        setSorteando(false);
        return;
      }

      // Ganador elegido de antemano; la animación muestra números al azar.
      const ganadorCompleto = lista[Math.floor(Math.random() * lista.length)];

      intervalRef.current = setInterval(() => {
        const aleatorio = lista[Math.floor(Math.random() * lista.length)];
        setDisplay(maskPhone(aleatorio));
      }, INTERVALO_MS);

      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplay(maskPhone(ganadorCompleto));
        setGanador(ganadorCompleto);
        setSorteando(false);
      }, DURACION_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo sortear");
      setSorteando(false);
    }
  }

  function mostrarGanador() {
    if (!ganador) {
      toast.error("No hay ganador definido aún.");
      return;
    }
    setDisplay(ganador);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant sm:p-8">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6">
        <img
          src="/icon-512.png"
          alt="Logo de la aplicación"
          className="h-36 w-36 rounded-full border-4 border-background bg-muted object-cover shadow-lg"
        />

        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sorteo_desde">Fecha Desde</Label>
            <Input
              id="sorteo_desde"
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              disabled={sorteando}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sorteo_hasta">Fecha Hasta</Label>
            <Input
              id="sorteo_hasta"
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              disabled={sorteando}
            />
          </div>
        </div>

        {/* Número en pantalla (enmascarado durante el sorteo) */}
        <div className="grid min-h-28 w-full place-items-center rounded-2xl border-4 border-primary/40 bg-primary/5 px-4 py-6 shadow-inner">
          <span className="font-mono text-4xl font-bold tracking-widest sm:text-5xl">
            {display || "—"}
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            onClick={() => void sortear()}
            disabled={sorteando}
            size="lg"
            className="bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            {sorteando ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Gift className="mr-2 h-5 w-5" />
            )}
            Sortear
          </Button>
          <Button
            onClick={mostrarGanador}
            disabled={sorteando || !ganador}
            size="lg"
            variant="outline"
          >
            <PartyPopper className="mr-2 h-5 w-5" />
            Mostrar Ganador
          </Button>
        </div>
      </div>
    </div>
  );
}
