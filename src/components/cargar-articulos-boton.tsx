import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseZap, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cargarArticulos, getSesion, type ResultadoJobCarga } from "@/lib/api";

/**
 * Botón del dashboard que dispara los jobs de carga de artículos
 * (JOB_CARGA_REPUESTOS, JOB_INSERT_LUBRICANTES, JOB_ARTICULOS_MAS_VENDIDOS).
 *
 * Los jobs corren en la sesión del request (`use_current_session => TRUE`), así
 * que la llamada es síncrona y puede tardar varios minutos: el botón queda en
 * estado "Cargando..." y se avisa en la confirmación. Solo se muestra al usuario
 * administrador (JOSEG), igual que el backend, que devuelve 403 al resto.
 */
export function CargarArticulosBoton() {
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<ResultadoJobCarga[] | null>(null);
  const esAdmin = (getSesion()?.app_user ?? "").toUpperCase() === "JOSEG";

  const cargarMut = useMutation({
    mutationFn: cargarArticulos,
    onSuccess: (r) => {
      setConfirmar(false);
      setResultado(r.jobs);
      toast.success(r.message);
    },
    onError: (e) => {
      setConfirmar(false);
      toast.error(e instanceof Error ? e.message : "No se pudo ejecutar la carga");
    },
  });

  if (!esAdmin) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setConfirmar(true)}
        disabled={cargarMut.isPending}
        className="shrink-0"
      >
        {cargarMut.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <DatabaseZap className="mr-2 h-4 w-4" />
        )}
        {cargarMut.isPending ? (
          "Cargando..."
        ) : (
          <>
            <span className="hidden sm:inline">Cargar artículos</span>
            <span className="sm:hidden">Cargar</span>
          </>
        )}
      </Button>

      <AlertDialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ejecutar la carga de artículos?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Se van a ejecutar los siguientes procesos, uno tras otro:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>Carga de repuestos</li>
                  <li>Inserción de lubricantes</li>
                  <li>Artículos más vendidos</li>
                </ul>
                <p>
                  El proceso puede tardar varios minutos. No cierres ni recargues la pantalla
                  hasta que termine.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cargarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // el diálogo se cierra al terminar, no al click
                cargarMut.mutate();
              }}
              disabled={cargarMut.isPending}
            >
              {cargarMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ejecutar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detalle por proceso (cuál corrió, cuánto tardó, qué falló) */}
      <AlertDialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resultado de la carga</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {(resultado ?? []).map((j) => (
                  <div key={j.job} className="flex items-start gap-2 text-sm">
                    {j.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <span className="font-medium">{j.job}</span>
                      <span className="text-muted-foreground"> — {j.segundos}s</span>
                      {j.error && <p className="break-words text-destructive">{j.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResultado(null)}>Cerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
