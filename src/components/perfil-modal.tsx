import { useEffect, useState, type FormEvent } from "react";
import { Fingerprint, Loader2, Lock, Moon, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSesion, login } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import {
  esNativo,
  biometriaDisponible,
  biometriaActivada,
  activarBiometria,
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
  const [pidiendoPwd, setPidiendoPwd] = useState(false);
  const [bioPwd, setBioPwd] = useState("");

  useEffect(() => {
    if (!open) return;
    setBioOn(biometriaActivada());
    setBioMsg(null);
    setPidiendoPwd(false);
    setBioPwd("");
    biometriaDisponible().then(setBioSoportada);
  }, [open]);

  async function onToggleBio(next: boolean) {
    setBioMsg(null);
    if (next) {
      // Activar requiere la contraseña para guardarla en el almacén seguro.
      setPidiendoPwd(true);
      return;
    }
    setPidiendoPwd(false);
    setBioPwd("");
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

  async function onActivarBio(e: FormEvent) {
    e.preventDefault();
    if (!sesion || !bioPwd) return;
    setBioMsg(null);
    setBioBusy(true);
    try {
      // Valida la contraseña contra el servidor antes de guardarla.
      // Mantiene la sesión donde ya estaba (localStorage = "recordar").
      const recordar = localStorage.getItem("sesion") !== null;
      await login(sesion.usuario, bioPwd, recordar);
      try {
        await activarBiometria(sesion.usuario, bioPwd);
      } catch {
        setBioMsg("Verificación biométrica cancelada. Intenta de nuevo.");
        return;
      }
      setBioOn(true);
      setPidiendoPwd(false);
      setBioPwd("");
      setBioMsg("Acceso biométrico activado.");
    } catch (err) {
      setBioMsg(err instanceof Error ? err.message : "No se pudo activar.");
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
                checked={bioOn || pidiendoPwd}
                disabled={!esNativo() || !bioSoportada || bioBusy}
                onCheckedChange={onToggleBio}
                aria-label="Alternar acceso biométrico"
              />
            </div>
            {pidiendoPwd && !bioOn && (
              <form onSubmit={onActivarBio} className="mt-3 space-y-2">
                <Label htmlFor="bio-pwd" className="text-xs text-muted-foreground">
                  Confirma tu contraseña para activar
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="bio-pwd"
                      type="password"
                      required
                      autoFocus
                      placeholder="••••••••"
                      value={bioPwd}
                      onChange={(e) => setBioPwd(e.target.value)}
                      className="h-9 pl-10"
                      disabled={bioBusy}
                    />
                  </div>
                  <Button type="submit" size="sm" className="h-9" disabled={bioBusy || !bioPwd}>
                    Activar
                  </Button>
                </div>
              </form>
            )}
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
