import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Download, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import { login } from "@/lib/api";
import { usePWAInstall } from "@/hooks/use-pwa-install";

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
  const { canInstall, install } = usePWAInstall();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usuario, password, recordar);
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

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {canInstall && (
          <Button
            variant="outline"
            size="sm"
            onClick={install}
            className="gap-2 border-primary/30 bg-background/80 text-primary backdrop-blur hover:bg-primary hover:text-primary-foreground"
          >
            <Download className="h-4 w-4" />
            Instalar app
          </Button>
        )}
        <ThemeToggle />
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
