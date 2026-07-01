import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { Download, Eye, EyeOff, Fingerprint, Loader2, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import { login } from "@/lib/api";
import {
  esNativo,
  biometriaDisponible,
  biometriaActivada,
  activarBiometria,
  obtenerCredencialesBiometricas,
} from "@/lib/biometric";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Lubrimesys" },
      { name: "description", content: "Accede al panel administrativo de Lubrimesys." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState("");
  const [apkInstalada, setApkInstalada] = useState(false);
  const [bioSoportada, setBioSoportada] = useState(false);
  const [bioActiva, setBioActiva] = useState(false);
  const [activarBio, setActivarBio] = useState(false);

  // Mostrar "Descargar APK" solo en Android y fuera de la app ya instalada (WebView Capacitor).
  const enAndroid =
    typeof navigator !== "undefined" &&
    /android/i.test(navigator.userAgent) &&
    !/lubrimesys|capacitor/i.test(navigator.userAgent);
  // El APK se sirve desde GitHub Pages (public/lubrimesys.apk), mismo origen que la web.
  // URL absoluta al origen actual para que el navegador la trate como descarga directa
  // (evita que el router del SPA o rutas relativas intercepten el click).
  const APK_URL =
    typeof window !== "undefined"
      ? new URL(`${import.meta.env.BASE_URL}lubrimesys.apk`, window.location.origin).href
      : `${import.meta.env.BASE_URL}lubrimesys.apk`;

  // Si la app nativa ya está instalada, ocultar el botón de descarga.
  useEffect(() => {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<{ id?: string }[]>;
    };
    if (!enAndroid || typeof nav.getInstalledRelatedApps !== "function") return;
    nav
      .getInstalledRelatedApps()
      .then((apps) => setApkInstalada(apps.length > 0))
      .catch(() => {});
  }, [enAndroid]);

  const mostrarApk = enAndroid && !apkInstalada;

  // Estado de biometría (solo dentro del APK).
  useEffect(() => {
    if (!esNativo()) return;
    biometriaDisponible().then((disp) => {
      setBioSoportada(disp);
      setBioActiva(disp && biometriaActivada());
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usuario, password, recordar);
      // Si el usuario pidió activar biometría, guardar credenciales tras login OK.
      if (activarBio && bioSoportada) {
        try {
          await activarBiometria(usuario, password);
        } catch {
          // canceló la verificación: continuar sin activar
        }
      }
      navigate({ to: "/home" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  // Ingreso con biometría: recupera credenciales guardadas y hace login.
  async function onBiometricLogin() {
    setError("");
    const cred = await obtenerCredencialesBiometricas();
    if (!cred) return; // canceló o falló
    setLoading(true);
    try {
      await login(cred.usuario, cred.password, true);
      navigate({ to: "/home" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {mostrarApk && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = APK_URL;
              }}
              className="gap-2 border-primary/30 bg-background/80 text-primary backdrop-blur hover:bg-primary hover:text-primary-foreground"
            >
              <Download className="h-4 w-4" />
              Descargar app
            </Button>
          )}
          <ThemeToggle />
        </div>
        {mostrarApk && (
          <p className="max-w-[200px] text-right text-[10px] leading-tight text-muted-foreground">
            Android 6.0+. Activa "Instalar apps de fuentes desconocidas".
          </p>
        )}
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between bg-gradient-hero p-12 text-white">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Lubrimec" className="h-16 w-16 rounded-2xl bg-white object-contain p-1.5 shadow-glow" />
            <span className="font-display text-2xl font-bold tracking-tight">Lubrimesys</span>
          </div>

          <div className="space-y-6">
            <h1 className="font-display text-5xl font-bold leading-tight">
              Gestiona tu <span className="text-primary">negocio</span><br />sin fricción.
            </h1>
            <p className="max-w-md text-lg text-white/70">
              Control de inventario, ventas, clientes y reportes en un solo panel moderno y rápido.
            </p>
            <div className="flex gap-6 pt-4">
              {[
                { k: "+99%", v: "Uptime" },
                { k: "24/7", v: "Acceso" },
                { k: "100%", v: "Tuyo" },
              ].map((s) => (
                <div key={s.v}>
                  <div className="font-display text-2xl font-bold text-primary">{s.k}</div>
                  <div className="text-xs uppercase tracking-wider text-white/50">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/40">© {new Date().getFullYear()} Lubrimesys. Todos los derechos reservados.</p>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Lubrimec" className="h-14 w-14 rounded-2xl bg-white object-contain p-1.5 shadow-glow" />
              <span className="font-display text-xl font-bold">Lubrimesys</span>
            </div>

            <div className="mb-8">
              <h2 className="font-display text-3xl font-bold tracking-tight">Bienvenido</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ingresa tus credenciales para acceder al panel.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="usuario">Usuario</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="usuario"
                    type="text"
                    required
                    placeholder="joseg"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  <Link to="/" className="text-xs text-primary hover:underline">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 px-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={recordar}
                  onCheckedChange={(v) => setRecordar(v === true)}
                />
                <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                  Mantener sesión iniciada
                </Label>
              </div>

              {bioSoportada && !bioActiva && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="activar-bio"
                    checked={activarBio}
                    onCheckedChange={(v) => setActivarBio(v === true)}
                  />
                  <Label htmlFor="activar-bio" className="text-sm font-normal text-muted-foreground">
                    Activar acceso biométrico en este dispositivo
                  </Label>
                </div>
              )}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full bg-gradient-primary font-semibold text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5 hover:opacity-95"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  "Iniciar sesión"
                )}
              </Button>

              {bioActiva && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBiometricLogin}
                  disabled={loading}
                  className="h-11 w-full gap-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <Fingerprint className="h-5 w-5" />
                  Ingresar con biometría
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">
                ¿Problemas para acceder? Contacta al administrador del sistema.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
