import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
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
  FileText,
  ChevronDown,
  Loader2,
  Tag,
  FileSignature,
  ClipboardList,
  Boxes,
  Banknote,
  Coins,
  Wallet,
  Receipt,
  ScanBarcode,
  Truck,
  Store,
  ShoppingBag,
  CalendarCheck,
  ArrowDownUp,
  ListChecks,
  PackageSearch,
  PackageCheck,
  PackageX,
  CircleDollarSign,
  Percent,
  BadgePercent,
  HandCoins,
  Building2,
  UserCog,
  ShieldCheck,
  SlidersHorizontal,
  BookOpen,
  Ruler,
  Gift,
  Trophy,
  MessageSquare,
  ScrollText,
  Car,
  Gauge,
  TicketPercent,
  FileBarChart,
  ClipboardPen,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { getSesion, cerrarSesion, getMenuPaginas, ventasPorDia, type PaginaMenu } from "@/lib/api";
import { MarcasView } from "@/components/marcas-view";
import { VentasDashboardChart } from "@/components/ventas-dashboard-chart";
import { VentasArticulosView } from "@/components/ventas-articulos-view";
import { ArticulosMasVendidosView } from "@/components/articulos-mas-vendidos-view";
import { PedidosArticulosView } from "@/components/pedidos-articulos-view";
import { PersonasView } from "@/components/personas-view";
import { EmpresasView } from "@/components/empresas-view";
import { UnidadesMedidasView } from "@/components/unidades-medidas-view";
import { IvaView } from "@/components/iva-view";
import { MonedasView } from "@/components/monedas-view";
import { RubrosView } from "@/components/rubros-view";
import { CondicionesFacturasView } from "@/components/condiciones-facturas-view";
import { TalonariosView } from "@/components/talonarios-view";
import { FormasCobroPagoView } from "@/components/formas-cobro-pago-view";
import { BancosView } from "@/components/bancos-view";
import { ViscosidadView } from "@/components/viscosidad-view";
import { WhatsappView } from "@/components/whatsapp-view";
import { CodigosBarrasView } from "@/components/codigos-barras-view";
import { ArticulosProveedoresView } from "@/components/articulos-proveedores-view";
import { PerfilModal } from "@/components/perfil-modal";

// Icono por page_id (APEX). Tiene prioridad sobre el match por palabra clave.
const ICONO_PAGINA: Record<number, LucideIcon> = {
  54: ShoppingCart, // Ventas Por Artículos
  98: FileSignature, // Cotización
  28: ShoppingBag, // Consulta de Compras
  4: Package, // Artículos
  102: TrendingUp, // Articulos Mas Vendidos
  85: Banknote, // Conteo de Efectivo
  63: ClipboardList, // Pedidos de Artículos
  34: DollarSign, // Precios de Ventas
  39: Store, // Punto de venta
  62: CalendarCheck, // Cierre del Día
  87: ArrowDownUp, // Ajustar Inventarios
  73: Wallet, // Rendición de Caja
  94: Car, // Repuestos de Vehiculos
  112: ClipboardPen, // Planilla para inventarios
  58: Boxes, // Inventario
  55: ShoppingBag, // Compras por Artículos
  80: PackageSearch, // Consulta de Inventarios
  75: BarChart3, // Compras Vs Ventas
  79: HandCoins, // Saldos de Proveedores
  101: HandCoins, // Pago de Comisiones
  82: BadgePercent, // Precios Mayoristas
  56: FileBarChart, // Ficha de Artículos
  81: PackageX, // Articulos no Inventariados
  6: Tag, // Marcas
  37: ShieldCheck, // Roles de Paginas
  77: Receipt, // Pagos de Facturas
  20: BookOpen, // Rubros
  2: Users, // Personas
  24: ScanBarcode, // Códigos de Barras
  8: Truck, // Importaciones
  70: PackageCheck, // Existencia de Artículos
  27: Truck, // Artículos Proveedores
  100: TrendingUp, // Suba de Precios
  92: CircleDollarSign, // Costo de Inventarios
  30: UserCog, // Vendedores
  65: Wallet, // Formas de Cobros
  83: Coins, // Denominaciones de Monedas
  61: DollarSign, // Consulta de Precios
  106: TicketPercent, // Descuentos Escalonados
  57: PackageX, // Artículos sin Código de Barra
  33: FileBarChart, // Consulta de ventas
  52: Gauge, // Viscosidad de Lubricantes
  114: Banknote, // Comisiones al Banco
  105: MessageSquare, // Post Venta
  89: SlidersHorizontal, // Parametros
  93: ListChecks, // Marcas Vs Descripción de Articulos
  67: Percent, // Descuentos
  12: Building2, // Empresas
  103: HandCoins, // Pagos a proveedores por ventas
  44: FileText, // Talonarios
  104: Gift, // Aguinaldos
  42: FileSignature, // Condiciones de Facturas
  18: Coins, // Monedas
  76: PackageSearch, // Artículos para Inventario
  48: Wallet, // Formas de Cobras, pagos
  60: ShoppingCart, // Ventas
  21: Ruler, // Unidades de Medidas
  14: Percent, // Retenciones
  71: Receipt, // Números de Vouchers
  10: Percent, // IVA
  108: Trophy, // Sortear
  120: ScrollText, // Logs de Mensajes
  117: MessageSquare, // Mensajes a Whatsapp
  50: Building2, // Bancos
};

// Match por palabra clave del título (fallback cuando el page_id no está en el mapa).
function iconoPorTitulo(title: string): LucideIcon {
  const t = title.toLowerCase();
  if (/(inventario|producto|stock|almac|artícul|articul)/.test(t)) return Package;
  if (/(venta|factura|pedido|caja|cobro|pago)/.test(t)) return ShoppingCart;
  if (/(cliente|proveedor|contacto|usuario|persona|vendedor)/.test(t)) return Users;
  if (/(reporte|estad|grafic|dashboard|consulta)/.test(t)) return BarChart3;
  if (/(ajuste|config|parametr|setting|rol)/.test(t)) return Settings;
  if (/(precio|monto|costo|efectivo|banco|moneda)/.test(t)) return DollarSign;
  return FileText;
}

// Icono de una página: primero por page_id, luego por título.
function iconoParaPagina(p: PaginaMenu): LucideIcon {
  return ICONO_PAGINA[p.page_id] ?? iconoPorTitulo(p.page_title);
}

// Icono del menú principal (categoría nivel 2) según su nombre.
function iconoCategoria(titulo: string): LucideIcon {
  const t = titulo.toLowerCase();
  if (/(compra|importac)/.test(t)) return ShoppingBag;
  if (/venta/.test(t)) return ShoppingCart;
  if (/(retenci|impuesto|iva)/.test(t)) return Percent;
  if (/(definicion|maestr|catalog)/.test(t)) return BookOpen;
  if (/(informát|informat|sistema|admin)/.test(t)) return Settings;
  if (/consulta/.test(t)) return BarChart3;
  if (/(caja|cobro|pago|finanz|tesor)/.test(t)) return Wallet;
  if (/(inventario|stock|almac)/.test(t)) return Boxes;
  if (/inicio/.test(t)) return LayoutDashboard;
  return ListChecks;
}

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Panel — Lubrimesys" },
      { name: "description", content: "Panel administrativo de Lubrimesys." },
    ],
  }),
  component: HomePage,
});

// La navegación se identifica por page_id (APEX) o "dashboard" (vista local fija).
type NavKey = "dashboard" | number;

// Vistas del front ya implementadas, mapeadas por page_id de APEX.
// Al implementar una página nueva: anotar su page_id aquí con su componente.
// Las páginas del menú sin entrada aquí muestran un Placeholder con su título.
const VISTAS: Record<number, () => ReactElement> = {
  2: () => <PersonasView />, // Personas
  6: () => <MarcasView />, // Marcas
  10: () => <IvaView />, // IVA
  12: () => <EmpresasView />, // Empresas
  18: () => <MonedasView />, // Monedas
  20: () => <RubrosView />, // Rubros
  42: () => <CondicionesFacturasView />, // Condiciones de Facturas
  44: () => <TalonariosView />, // Talonarios
  48: () => <FormasCobroPagoView />, // Formas de Cobro/Pago
  50: () => <BancosView />, // Bancos
  52: () => <ViscosidadView />, // Viscosidad de Lubricantes
  21: () => <UnidadesMedidasView />, // Unidades de Medidas
  54: () => <VentasArticulosView />, // Ventas Por Artículos
  102: () => <ArticulosMasVendidosView />, // Artículos Más Vendidos
  63: () => <PedidosArticulosView />, // Pedidos de Artículos
  117: () => <WhatsappView />, // Mensajes a Whatsapp
  24: () => <CodigosBarrasView />, // Códigos de Barras
  27: () => <ArticulosProveedoresView />, // Artículos-Proveedores
};

// page_id que ya tienen algo implementado (vista propia o acción especial como el
// cotizador 98). Se usa en el menú para diferenciar páginas listas vs. pendientes.
const PAGINAS_IMPLEMENTADAS = new Set<number>([...Object.keys(VISTAS).map(Number), 98]);

function HomePage() {
  // Pila de vistas visitadas para el botón atrás (nunca vacía: la base es dashboard).
  const [historial, setHistorial] = useState<NavKey[]>(["dashboard"]);
  const active = historial[historial.length - 1];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [cotizadorOpen, setCotizadorOpen] = useState(false);
  // Sidebar colapsable en escritorio; la preferencia se recuerda.
  const [menuColapsado, setMenuColapsado] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("menu_colapsado") === "1",
  );
  function toggleMenu() {
    setMenuColapsado((c) => {
      localStorage.setItem("menu_colapsado", c ? "0" : "1");
      return !c;
    });
  }
  const navigate = useNavigate();

  // Páginas del usuario (define el menú lateral y los accesos rápidos).
  const paginasQuery = useQuery({
    queryKey: ["menu-paginas"],
    queryFn: getMenuPaginas,
    retry: false,
  });
  const paginas = paginasQuery.data ?? [];

  // Redirige al login si no hay sesión
  const sesion = getSesion();
  if (!sesion) {
    navigate({ to: "/" });
    return null;
  }

  const usuario = sesion.usuario || "Usuario";
  const iniciales = usuario.slice(0, 2).toUpperCase();

  function logout() {
    cerrarSesion();
    navigate({ to: "/" });
  }

  function handleNav(key: NavKey) {
    // Cotización (page_id 98): abre el cotizador externo en un modal (iframe).
    if (key === 98) {
      setCotizadorOpen(true);
      setMobileOpen(false);
      return;
    }
    setMobileOpen(false);
    setHistorial((h) => (h[h.length - 1] === key ? h : [...h, key]));
  }

  // Botón atrás (navegador web y APK): retrocede una vista en lugar de salir/cerrar
  // sesión. Se mantiene una ref con el historial vivo para leerlo en los listeners.
  const historialRef = useRef(historial);
  historialRef.current = historial;

  useEffect(() => {
    // Si hay algún modal abierto, el botón atrás lo cierra primero.
    function retroceder(): boolean {
      if (cotizadorOpen) {
        setCotizadorOpen(false);
        return true;
      }
      if (perfilOpen) {
        setPerfilOpen(false);
        return true;
      }
      if (mobileOpen) {
        setMobileOpen(false);
        return true;
      }
      if (historialRef.current.length > 1) {
        setHistorial((h) => h.slice(0, -1));
        return true;
      }
      return false; // ya en el dashboard base
    }

    // --- Web: interceptar el botón atrás del navegador via history/popstate ---
    window.history.pushState(null, "");
    function onPopState() {
      const consumido = retroceder();
      // Reponer siempre un entry para seguir capturando el próximo "atrás".
      if (consumido || historialRef.current.length >= 1) {
        window.history.pushState(null, "");
      }
    }
    window.addEventListener("popstate", onPopState);

    // --- APK: botón físico de Android via Capacitor ---
    let quitarNativo: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      App.addListener("backButton", () => {
        if (!retroceder()) App.exitApp(); // en dashboard sí cierra la app
      }).then((h) => {
        quitarNativo = () => h.remove();
      });
    }

    return () => {
      window.removeEventListener("popstate", onPopState);
      quitarNativo?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizadorOpen, perfilOpen, mobileOpen]);

  const paginaActiva =
    typeof active === "number" ? paginas.find((p) => p.page_id === active) : null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
          !menuColapsado && "lg:flex",
        )}
      >
        <SidebarContent
          active={active}
          onNav={handleNav}
          paginas={paginas}
          loading={paginasQuery.isLoading}
        />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent
            active={active}
            onNav={handleNav}
            paginas={paginas}
            loading={paginasQuery.isLoading}
          />
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

          {/* Colapsar/expandir el menú (solo escritorio) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMenu}
            className="hidden lg:inline-flex"
            aria-label={menuColapsado ? "Mostrar menú" : "Ocultar menú"}
          >
            {menuColapsado ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-2 flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-accent"
                  aria-label="Menú de usuario"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-primary font-display text-sm font-bold text-primary-foreground">
                    {iniciales}
                  </span>
                  <span className="hidden text-sm font-medium sm:inline">{usuario}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="truncate">{usuario}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPerfilOpen(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {active === "dashboard" ? (
            <DashboardView usuario={usuario} paginas={paginas} onNavigate={handleNav} />
          ) : VISTAS[active as number] ? (
            VISTAS[active as number]()
          ) : (
            <PlaceholderView label={paginaActiva?.page_title ?? "Página"} />
          )}
        </main>
      </div>

      <PerfilModal open={perfilOpen} onOpenChange={setPerfilOpen} />

      {/* Cotizador externo (page_id 98) embebido en un modal */}
      <Dialog open={cotizadorOpen} onOpenChange={setCotizadorOpen}>
        <DialogContent className="grid h-[90vh] max-w-5xl grid-rows-[auto_1fr] gap-0 p-0 sm:max-w-5xl">
          <DialogTitle className="border-b border-border px-4 py-3 text-base">
            Cotizador
          </DialogTitle>
          <iframe
            src="https://www.lubrimec.shop/cotizador"
            title="Cotizador"
            className="h-full min-h-0 w-full rounded-b-lg border-0"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarContent({
  active,
  onNav,
  paginas,
  loading,
}: {
  active: NavKey;
  onNav: (k: NavKey) => void;
  paginas: PaginaMenu[];
  loading: boolean;
}) {
  // Agrupa por categoría padre (nivel 2). El back ya viene ordenado por seq_categoria +
  // seq_pagina, así que conservar el orden de llegada respeta la jerarquía de APEX.
  const grupos: { titulo: string; paginas: PaginaMenu[] }[] = [];
  for (const p of paginas) {
    const titulo = p.parent_entry_text ?? "General";
    let g = grupos.find((x) => x.titulo === titulo);
    if (!g) {
      g = { titulo, paginas: [] };
      grupos.push(g);
    }
    g.paginas.push(p);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Lubrimec"
          className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1 shadow-glow"
        />
        <div className="min-w-0">
          <div className="font-display text-lg font-bold leading-none">Lubrimesys</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
            Admin Panel
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {/* Dashboard fijo */}
        <button
          onClick={() => onNav("dashboard")}
          className={cn(
            "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            active === "dashboard"
              ? "bg-gradient-primary text-primary-foreground shadow-glow"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
          <span className="truncate">Dashboard</span>
        </button>

        {loading && (
          <div className="grid place-items-center py-6 text-sidebar-foreground/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {/* Grupos del endpoint */}
        {grupos.map((g) => (
          <NavGrupo
            key={g.titulo}
            titulo={g.titulo}
            paginas={g.paginas}
            active={active}
            onNav={onNav}
          />
        ))}
      </nav>
    </div>
  );
}

function NavGrupo({
  titulo,
  paginas,
  active,
  onNav,
}: {
  titulo: string;
  paginas: PaginaMenu[];
  active: NavKey;
  onNav: (k: NavKey) => void;
}) {
  // Abierto por defecto si contiene la página activa.
  const [open, setOpen] = useState(() => paginas.some((p) => p.page_id === active));
  const CatIcon = iconoCategoria(titulo);

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
      >
        <CatIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{titulo}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open ? "" : "-rotate-90")}
        />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
          {paginas.map((p) => {
            const Icon = iconoParaPagina(p);
            const isActive = p.page_id === active;
            const lista = PAGINAS_IMPLEMENTADAS.has(p.page_id);
            return (
              <button
                key={`${p.application_id}-${p.page_id}`}
                onClick={() => onNav(p.page_id)}
                title={lista ? undefined : "Página aún no implementada"}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : lista
                      ? "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      : "text-sidebar-foreground/35 hover:bg-sidebar-accent hover:text-sidebar-foreground/60",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 truncate text-left">{p.entry_text ?? p.page_title}</span>
                {!isActive && !lista && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-foreground/30"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DashboardView({
  usuario,
  paginas,
  onNavigate,
}: {
  usuario: string;
  paginas: PaginaMenu[];
  onNavigate: (k: NavKey) => void;
}) {
  // Ventas de hoy (real, desde ventas/por-dia del mes actual). Comparte queryKey
  // con el gráfico del dashboard, así react-query hace una sola consulta.
  const hoy = new Date();
  const anioHoy = String(hoy.getFullYear());
  const mesHoy = String(hoy.getMonth() + 1).padStart(2, "0");
  const ddmmHoy = `${String(hoy.getDate()).padStart(2, "0")}/${mesHoy}`;
  const ventasMesQuery = useQuery({
    queryKey: ["ventas-por-dia", 24, anioHoy, mesHoy],
    queryFn: () => ventasPorDia(anioHoy, mesHoy, 24),
    retry: false,
  });
  const montoHoy = ventasMesQuery.data?.find((d) => d.fecha === ddmmHoy)?.monto ?? 0;
  // Variación vs. ayer. Si ayer cae en el mes anterior (día 1), se consulta ese mes.
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const anioAyer = String(ayer.getFullYear());
  const mesAyer = String(ayer.getMonth() + 1).padStart(2, "0");
  const ddmmAyer = `${String(ayer.getDate()).padStart(2, "0")}/${mesAyer}`;
  const ayerEnOtroMes = mesAyer !== mesHoy || anioAyer !== anioHoy;
  const ventasMesAyerQuery = useQuery({
    queryKey: ["ventas-por-dia", 24, anioAyer, mesAyer],
    queryFn: () => ventasPorDia(anioAyer, mesAyer, 24),
    enabled: ayerEnOtroMes,
    retry: false,
  });
  const datosAyer = ayerEnOtroMes ? ventasMesAyerQuery.data : ventasMesQuery.data;
  const montoAyer = datosAyer ? (datosAyer.find((d) => d.fecha === ddmmAyer)?.monto ?? 0) : null;
  const cambioHoy =
    montoAyer != null && montoAyer > 0
      ? `${montoHoy >= montoAyer ? "+" : ""}${(((montoHoy - montoAyer) / montoAyer) * 100).toLocaleString("es-PY", { maximumFractionDigits: 1 })}%`
      : null;

  // Crecimiento: acumulado del mes actual (hasta hoy) vs. mismo período del mes
  // anterior (día 1 al día de hoy). Reusa el query del mes actual y agrega el previo.
  const mesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const anioPrev = String(mesPrev.getFullYear());
  const mesPrevMM = String(mesPrev.getMonth() + 1).padStart(2, "0");
  const ventasMesPrevQuery = useQuery({
    queryKey: ["ventas-por-dia", 24, anioPrev, mesPrevMM],
    queryFn: () => ventasPorDia(anioPrev, mesPrevMM, 24),
    retry: false,
  });
  const diaHoy = hoy.getDate();
  const acumHasta = (datos: { fecha: string; monto: number }[] | undefined) =>
    (datos ?? []).reduce(
      (t, d) => (Number(d.fecha.slice(0, 2)) <= diaHoy ? t + d.monto : t),
      0,
    );
  const acumMes = acumHasta(ventasMesQuery.data);
  const acumMesPrev = acumHasta(ventasMesPrevQuery.data);
  const crecimiento =
    acumMesPrev > 0 ? ((acumMes - acumMesPrev) / acumMesPrev) * 100 : null;

  const stats = [
    {
      label: "Ventas hoy",
      value: ventasMesQuery.isLoading
        ? "..."
        : `₲ ${Math.round(montoHoy).toLocaleString("es-PY", { maximumFractionDigits: 0 })}`,
      change: cambioHoy,
      icon: DollarSign,
    },
    {
      label: "Crecimiento",
      value:
        ventasMesQuery.isLoading || ventasMesPrevQuery.isLoading
          ? "..."
          : crecimiento != null
            ? `${crecimiento >= 0 ? "+" : ""}${crecimiento.toLocaleString("es-PY", { maximumFractionDigits: 1 })}%`
            : "—",
      change: null,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Buenos días, {usuario}
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

      {/* Gráfico de ventas por día */}
      <VentasDashboardChart />

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
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="mt-2 font-display text-2xl font-bold">{s.value}</p>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              {s.change && (
                <p className="mt-3 text-xs font-medium text-primary">{s.change} vs. ayer</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
        <h2 className="font-display text-lg font-bold">Accesos rápidos</h2>
        <QuickActions paginas={paginas} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function QuickActions({
  paginas,
  onNavigate,
}: {
  paginas: PaginaMenu[];
  onNavigate: (k: NavKey) => void;
}) {
  const [filtro, setFiltro] = useState("");

  if (paginas.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No hay páginas disponibles.</p>;
  }

  // Accesos rápidos: más usados primero (el menú lateral va por jerarquía).
  const ordenadas = [...paginas].sort((a, b) => b.estadistica_user - a.estadistica_user);
  const q = filtro.trim().toLowerCase();
  const filtradas = q ? ordenadas.filter((p) => p.page_title.toLowerCase().includes(q)) : ordenadas;

  return (
    <>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar acceso..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-10 pl-10"
        />
      </div>

      {filtradas.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Sin resultados para “{filtro}”.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {filtradas.map((p) => {
            const I = iconoParaPagina(p);
            return (
              <button
                key={`${p.application_id}-${p.page_id}`}
                onClick={() => onNavigate(p.page_id)}
                className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-glow"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <I className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold">{p.page_title}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
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
