import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Search,
  Bell,
  Droplet,
  TrendingUp,
  DollarSign,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Panel — Lubrimesys" },
      { name: "description", content: "Panel administrativo de Lubrimesys." },
    ],
  }),
  component: HomePage,
});

type NavKey = "dashboard" | "inventario" | "ventas" | "clientes" | "reportes" | "ajustes";

const NAV: { key: NavKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "inventario", label: "Inventario", icon: Package },
  { key: "ventas", label: "Ventas", icon: ShoppingCart },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "reportes", label: "Reportes", icon: BarChart3 },
  { key: "ajustes", label: "Ajustes", icon: Settings },
];

function HomePage() {
  const [active, setActive] = useState<NavKey>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  function handleNav(key: NavKey) {
    setActive(key);
    setMobileOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <SidebarContent active={active} onNav={handleNav} onLogout={() => navigate({ to: "/" })} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent active={active} onNav={handleNav} onLogout={() => navigate({ to: "/" })} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>

          <div className="relative hidden flex-1 max-w-md sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar productos, clientes..." className="h-10 pl-10" />
          </div>

          <div className="flex-1 sm:hidden" />

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </Button>
            <ThemeToggle />
            <div className="ml-2 hidden h-9 w-9 place-items-center rounded-full bg-gradient-primary font-display text-sm font-bold text-primary-foreground sm:grid">
              AD
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {active === "dashboard" && <DashboardView />}
          {active !== "dashboard" && <PlaceholderView label={NAV.find((n) => n.key === active)!.label} />}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  active,
  onNav,
  onLogout,
}: {
  active: NavKey;
  onNav: (k: NavKey) => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-primary shadow-glow">
          <Droplet className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg font-bold leading-none">Lubrimesys</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
            Admin Panel
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary font-display text-sm font-bold text-primary-foreground">
            AD
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Admin</div>
            <div className="truncate text-xs text-sidebar-foreground/60">admin@lubrimesys.com</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function DashboardView() {
  const stats = [
    { label: "Ventas hoy", value: "$ 12.450", change: "+12,4%", icon: DollarSign },
    { label: "Pedidos", value: "324", change: "+8,1%", icon: ShoppingCart },
    { label: "Clientes", value: "1.284", change: "+3,2%", icon: Users },
    { label: "Crecimiento", value: "24,8%", change: "+5,6%", icon: TrendingUp },
  ];

  const activity = [
    { id: 1, title: "Nuevo pedido #4821", who: "María González", time: "Hace 5 min", amount: "$ 248,00" },
    { id: 2, title: "Producto agregado", who: "Aceite 20W-50 · 50 uds", time: "Hace 22 min", amount: "+50" },
    { id: 3, title: "Cliente registrado", who: "Carlos Pérez", time: "Hace 1 h", amount: "" },
    { id: 4, title: "Pedido completado #4818", who: "Taller Ruiz", time: "Hace 2 h", amount: "$ 1.520,00" },
    { id: 5, title: "Pago recibido", who: "Lubricentro Sur", time: "Hace 3 h", amount: "$ 980,00" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Buenos días, Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aquí tienes el resumen de tu negocio.
          </p>
        </div>
        <Button className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva venta</span>
          <span className="sm:hidden">Venta</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-elegant transition-all hover:-translate-y-0.5 hover:shadow-glow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className="mt-2 font-display text-2xl font-bold">{s.value}</p>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-primary">{s.change} vs. ayer</p>
            </div>
          );
        })}
      </div>

      {/* Body grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Actividad reciente</h2>
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
              Ver todo
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Droplet className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.who} · {a.time}
                  </p>
                </div>
                {a.amount && (
                  <span className="shrink-0 text-sm font-semibold text-primary">{a.amount}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
          <h2 className="font-display text-lg font-bold">Accesos rápidos</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { l: "Inventario", i: Package },
              { l: "Clientes", i: Users },
              { l: "Reportes", i: BarChart3 },
              { l: "Ajustes", i: Settings },
            ].map((q) => {
              const I = q.i;
              return (
                <button
                  key={q.l}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-glow"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <I className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold">{q.l}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderView({ label }: { label: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
          <Droplet className="h-8 w-8 text-primary-foreground" />
        </div>
        <h2 className="mt-6 font-display text-2xl font-bold">{label}</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Esta sección está lista para conectar con tu backend cuando lo decidas.
        </p>
      </div>
    </div>
  );
}
