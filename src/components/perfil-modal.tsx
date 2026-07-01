import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Moon, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSesion } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import {
  esNativo,
  biometriaDisponible,
  biometriaActivada,
  desactivarBiometria,
} from "@/lib/biometric";

export function PerfilModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const sesion = getSesion();

  const usuario = sesion?.usuario || "Usuario";
  const iniciales = usuario.slice(0, 2).toUpperCase();

  const [bioSoportada, setBioSoportada] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioMsg, setBioMsg] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBioOn(biometriaActivada());
    setBioMsg(null);
    biometriaDisponible().then(setBioSoportada);
  }, [open]);

  async function onToggleBio(next: boolean) {
    setBioMsg(null);
    if (next) {
      // Activar requiere la contraseña; se hace desde el login (donde se conoce).
      setBioMsg(
        "Para activar el acceso biométrico, marca la opción al iniciar sesión con tu usuario y contraseña.",
      );
      return;
    }
    setBioBusy(true);
    try {
      await desactivarBiometria();
      setBioOn(false);
      setBioMsg("Acceso biométrico desactivado.");
    } catch {
      setBioMsg("No se pudo desactivar.");
    } finally {
      setBioBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Perfil</DialogTitle>
          <DialogDescription className="sr-only">
            Ajustes de cuenta, apariencia y seguridad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identidad */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-primary font-display text-base font-bold text-primary-foreground">
              {iniciales}
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-base font-semibold">{usuario}</div>
              <div className="text-sm text-muted-foreground">{sesion?.app_user}</div>
            </div>
          </div>

          {/* Apariencia */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Apariencia</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="h-5 w-5 text-primary" />
                ) : (
                  <Sun className="h-5 w-5 text-primary" />
                )}
                <div>
                  <Label className="text-sm font-medium">Modo oscuro</Label>
                  <p className="text-xs text-muted-foreground">
                    {theme === "dark" ? "Tema oscuro activo" : "Tema claro activo"}
                  </p>
                </div>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                aria-label="Alternar modo oscuro"
              />
            </div>
          </div>

          {/* Seguridad */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Seguridad</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Fingerprint className="h-5 w-5 text-primary" />
                <div>
                  <Label className="text-sm font-medium">Acceso biométrico</Label>
                  <p className="text-xs text-muted-foreground">
                    {!esNativo()
                      ? "Disponible solo en la app instalada (APK)."
                      : !bioSoportada
                        ? "Tu dispositivo no tiene biometría configurada."
                        : "Ingresa con huella o reconocimiento facial."}
                  </p>
                </div>
              </div>
              <Switch
                checked={bioOn}
                disabled={!esNativo() || !bioSoportada || bioBusy}
                onCheckedChange={onToggleBio}
                aria-label="Alternar acceso biométrico"
              />
            </div>
            {bioBusy && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Procesando...
              </p>
            )}
            {bioMsg && <p className="mt-3 text-xs text-muted-foreground">{bioMsg}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
