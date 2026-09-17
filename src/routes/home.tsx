import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  LayoutDashboard,
  Home,
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
import {
  getSesion,
  cerrarSesion,
  escucharSesion,
  getMenuPaginas,
  type PaginaMenu,
} from "@/lib/api";
import {
  leerUsoAccesos,
  registrarUsoAcceso,
  claveAcceso,
  type UsoAccesos,
} from "@/lib/uso-accesos";
import { CargarArticulosBoton } from "@/components/cargar-articulos-boton";
import { CobrosTarjetaView } from "@/components/cobros-tarjeta-view";
import { CobrosAcreditarCard } from "@/components/cobros-acreditar-card";
import { PerfilModal } from "@/components/perfil-modal";
import { BusquedaGlobal } from "@/components/busqueda-global";
import { VISTAS } from "@/lib/vistas";

// Gráficos del dashboard: se cargan aparte porque son los únicos que usan recharts.
const VentasDashboardChart = lazy(() =>
  import("@/components/ventas-dashboard-chart").then((m) => ({ default: m.VentasDashboardChart })),
);
const CobrosHoyChart = lazy(() =>
  import("@/components/cobros-hoy-chart").then((m) => ({ default: m.CobrosHoyChart })),
);

// Categorías del menú APEX que no se usan por ahora: se ocultan del sidebar,
// accesos rápidos y dashboard. Comparación sin tildes ni mayúsculas.
const CATEGORIAS_OCULTAS = ["retencion", "retenciones", "importaciones", "importacion"];
const normalizarCategoria = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

// La navegación se identifica por page_id (APEX) o "dashboard" (vista local fija).
type NavKey = "dashboard" | number;

// La página activa viaja en la URL (?p=<page_id>), NO en estado de React: así cada
// pantalla tiene un enlace propio que se puede copiar, recargar o abrir en otra
// pestaña (Ctrl+click en el menú). Sin ?p= se muestra el dashboard. En GitHub Pages
// el deep link funciona porque el workflow publica 404.html = shell de la SPA.
type HomeSearch = { p?: number };

// Search de una entrada del menú: el dashboard es la URL limpia, sin ?p=.
function searchDe(key: NavKey): HomeSearch {
  return key === "dashboard" ? {} : { p: key };
}

export const Route = createFileRoute("/home")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const p = Number(search.p);
    return Number.isInteger(p) && p > 0 ? { p } : {};
  },
  head: () => ({
    meta: [
      { title: "Panel — Lubrimesys" },
      { name: "description", content: "Panel administrativo de Lubrimesys." },
    ],
  }),
  component: HomePage,
});


// page_id que ya tienen algo implementado (vista propia o acción especial como el
// cotizador 98). Se usa en el menú para diferenciar páginas listas vs. pendientes.
const PAGINAS_IMPLEMENTADAS = new Set<number>([...Object.keys(VISTAS).map(Number), 98]);

function HomePage() {
  // La vista activa sale de la URL (?p=), no de un estado local: recargar, compartir
  // el enlace o abrirlo en otra pestaña caen en la misma pantalla.
  const { p: pageId } = Route.useSearch();
  const active: NavKey = pageId ?? "dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [cotizadorOpen, setCotizadorOpen] = useState(false);
  // Sidebar colapsable en escritorio: SIEMPRE arranca oculto (no se recuerda la
  // preferencia). El botón de la topbar lo muestra mientras dure la sesión de pantalla.
  const [menuColapsado, setMenuColapsado] = useState(true);
  function toggleMenu() {
    setMenuColapsado((c) => !c);
  }
  const navigate = useNavigate();

  // Páginas del usuario (define el menú lateral y los accesos rápidos).
  const paginasQuery = useQuery({
    queryKey: ["menu-paginas"],
    queryFn: getMenuPaginas,
    retry: false,
  });
  // Categorías del menú APEX que no se usan por ahora (afecta sidebar, accesos
  // rápidos y dashboard). Se comparan sin tildes ni mayúsculas.
  const paginas = (paginasQuery.data ?? []).filter(
    (p) => !CATEGORIAS_OCULTAS.includes(normalizarCategoria(p.parent_entry_text ?? "")),
  );

  // Sin sesión se vuelve al login. La redirección va en un efecto y el return null
  // baja DESPUÉS de todos los hooks: cortar el render acá dejaba los hooks de abajo
  // (botón atrás, listener de sesión) colgando de una condición, que es justo lo que
  // React no permite.
  const sesion = getSesion();
  const haySesion = sesion !== null;
  const usuario = sesion?.usuario || "Usuario";
  const iniciales = usuario.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!haySesion) navigate({ to: "/" });
  }, [haySesion, navigate]);

  function logout() {
    cerrarSesion();
    navigate({ to: "/" });
  }

  // Navegación desde controles que NO son enlaces (buscador global, botones del
  // dashboard, botón Home). Las entradas del menú y los accesos rápidos usan <Link>,
  // que navega solo: ver EnlacePagina.
  function handleNav(key: NavKey) {
    // Cotización (page_id 98): abre el cotizador externo en un modal (iframe).
    if (key === 98) {
      setCotizadorOpen(true);
      setMobileOpen(false);
      return;
    }
    setMobileOpen(false);
    if (key === active) return;
    navigate({ to: "/home", search: searchDe(key) });
  }

  // Efectos del click en un <Link> del menú: cerrar el panel móvil. No navega (de
  // eso se encarga el enlace), así Ctrl+click abre la pestaña nueva sin mover esta.
  function alAbrirEnlace() {
    setMobileOpen(false);
  }

  // Cerrar sesión en CUALQUIER pestaña echa también a esta (evento storage).
  useEffect(() => escucharSesion(), []);

  // Botón atrás. En la web ya no hay nada que hacer: como cada página es una URL,
  // el historial del navegador ES el historial de la app. Antes se interceptaba con
  // pushState + una pila propia; con URLs reales eso impediría volver atrás.
  // En el APK no hay barra de direcciones ni gesto de atrás del navegador, así que el
  // botón físico de Android se mapea a mano: primero cierra modales, después retrocede
  // en el historial, y ya en el dashboard sale de la app (como antes).
  const router = useRouter();
  const estadoRef = useRef({ active, cotizadorOpen, perfilOpen, mobileOpen });
  estadoRef.current = { active, cotizadorOpen, perfilOpen, mobileOpen };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let quitarNativo: (() => void) | undefined;
    App.addListener("backButton", () => {
      const e = estadoRef.current;
      if (e.cotizadorOpen) {
        setCotizadorOpen(false);
      } else if (e.perfilOpen) {
        setPerfilOpen(false);
      } else if (e.mobileOpen) {
        setMobileOpen(false);
      } else if (e.active !== "dashboard") {
        router.history.back();
      } else {
        App.exitApp(); // ya en el dashboard base
      }
    }).then((h) => {
      quitarNativo = () => h.remove();
    });
    return () => quitarNativo?.();
  }, [router]);

  if (!sesion) return null; // el efecto de arriba ya está redirigiendo al login

  const paginaActiva =
    typeof active === "number" ? paginas.find((p) => p.page_id === active) : null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden w-[var(--sidebar-w)] shrink-0 flex-col bg-sidebar text-sidebar-foreground",
          !menuColapsado && "lg:flex",
        )}
      >
        <SidebarContent
          active={active}
          onNav={handleNav}
          onAbrir={alAbrirEnlace}
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
            onAbrir={alAbrirEnlace}
            paginas={paginas}
            loading={paginasQuery.isLoading}
          />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] items-center gap-3 border-b border-border bg-background/80 px-[var(--panel-p)] backdrop-blur">
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

          <BusquedaGlobal onNavigate={handleNav} />

          <div className="flex-1 sm:hidden" />

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </Button>
            <ThemeToggle />
            {/* Volver al inicio: solo cuando se está en otra página. */}
            {active !== "dashboard" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleNav("dashboard")}
                aria-label="Ir al inicio"
                title="Ir al inicio"
              >
                <Home className="h-5 w-5" />
              </Button>
            )}
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
        {/* min-w-0: sin esto una tabla ancha empuja la página entera fuera del
            viewport en vez de scrollear dentro de su contenedor. */}
        <main className="min-w-0 flex-1 p-[var(--panel-p)]">
          {active === "dashboard" ? (
            <DashboardView usuario={usuario} paginas={paginas} onNavigate={handleNav} />
          ) : VISTAS[active as number] ? (
            // Suspense: mientras baja el chunk de la vista se muestra el spinner.
            // key por page_id para que al cambiar de página reaparezca el fallback
            // en lugar de dejar la vista anterior congelada en pantalla.
            <Suspense key={active} fallback={<CargandoVista />}>
              {(() => {
                const Vista = VISTAS[active as number];
                return <Vista />;
              })()}
            </Suspense>
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
  onAbrir,
  paginas,
  loading,
}: {
  active: NavKey;
  onNav: (k: NavKey) => void;
  onAbrir: () => void;
  paginas: PaginaMenu[];
  loading: boolean;
}) {
  // Agrupa por categoría padre (nivel 2). El back ya viene ordenado por seq_categoria +
  // seq_pagina, así que conservar el orden de llegada respeta la jerarquía de APEX.
  // (Las categorías ocultas ya vienen filtradas desde HomePage.)
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
      <div className="flex h-[var(--topbar-h)] items-center gap-3 border-b border-sidebar-border px-[var(--panel-p)]">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Lubrimec"
          className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1 shadow-glow xl:h-12 xl:w-12"
        />
        <div className="min-w-0">
          <div className="font-display text-[length:var(--ui-font-lg)] font-bold leading-none">
            Lubrimesys
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
            Admin Panel
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {/* Dashboard fijo */}
        <Link
          to="/home"
          search={{}}
          onClick={onAbrir}
          className={cn(
            "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            active === "dashboard"
              ? "bg-gradient-primary text-primary-foreground shadow-glow"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
          <span className="truncate">Dashboard</span>
        </Link>

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
            onAbrir={onAbrir}
          />
        ))}
      </nav>
    </div>
  );
}

// Entrada navegable del menú y de los accesos rápidos. Es un <a> de verdad (el <Link>
// de TanStack), no un <button>: eso es lo que le da al navegador "Abrir en pestaña
// nueva", Ctrl+click y click del medio, o sea poder tener varias páginas del ERP
// abiertas a la vez. El click normal navega en esta pestaña como siempre.
// Excepción: el cotizador (page_id 98) no es una página del ERP sino un modal con un
// iframe, así que no tiene URL propia y sigue siendo un botón.
function EnlacePagina({
  pageId,
  className,
  title,
  onNav,
  onAbrir,
  children,
}: {
  pageId: number;
  className: string;
  title?: string;
  onNav: (k: NavKey) => void;
  // Efectos del click (cerrar el menú móvil, contar el uso). NO navega: de eso se
  // encarga el <Link>, para que Ctrl+click abra la pestaña nueva sin mover esta.
  onAbrir?: () => void;
  children: ReactNode;
}) {
  if (pageId === 98) {
    return (
      <button
        type="button"
        onClick={() => {
          onAbrir?.();
          onNav(98);
        }}
        title={title}
        className={className}
      >
        {children}
      </button>
    );
  }
  return (
    <Link to="/home" search={{ p: pageId }} title={title} className={className} onClick={onAbrir}>
      {children}
    </Link>
  );
}

function NavGrupo({
  titulo,
  paginas,
  active,
  onNav,
  onAbrir,
}: {
  titulo: string;
  paginas: PaginaMenu[];
  active: NavKey;
  onNav: (k: NavKey) => void;
  onAbrir: () => void;
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
              <EnlacePagina
                key={`${p.application_id}-${p.page_id}`}
                pageId={p.page_id}
                onNav={onNav}
                onAbrir={onAbrir}
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
              </EnlacePagina>
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
        <div className="flex shrink-0 items-center gap-2">
          {/* Solo visible para el usuario admin (el propio componente lo decide) */}
          <CargarArticulosBoton />
          <Button
            onClick={() => onNavigate(39)}
            className="shrink-0 bg-gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Nueva venta</span>
            <span className="sm:hidden">Venta</span>
          </Button>
        </div>
      </div>

      {/* Cobros pendientes de acreditar (link al modal de la página 111) */}
      <CobrosAcreditarCard />

      {/* Cobranza de hoy por forma de cobro, con los cobros con tarjeta al lado */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Suspense fallback={<CargandoGrafico />}>
          <CobrosHoyChart />
        </Suspense>
        <CobrosTarjetaView />
      </div>

      {/* Gráfico de ventas por día */}
      <Suspense fallback={<CargandoGrafico />}>
        <VentasDashboardChart />
      </Suspense>

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
  // Conteo LOCAL de uso por página (localStorage). Se lee una vez al montar; el
  // clic lo incrementa y persiste. Ordena los accesos por más usados en ESTE
  // dispositivo, con la estadística del backend como desempate.
  const [uso, setUso] = useState<UsoAccesos>(() => leerUsoAccesos());

  // Solo cuenta el uso: la navegación la hace el <Link> de EnlacePagina (así el
  // Ctrl+click cuenta el acceso igual, pero abre pestaña nueva en vez de mover esta).
  function contarUso(p: PaginaMenu) {
    setUso(registrarUsoAcceso(p.application_id, p.page_id));
  }

  if (paginas.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No hay páginas disponibles.</p>;
  }

  // Accesos rápidos: más usados localmente primero; ante empate, la estadística
  // del backend; y como último desempate el título (orden estable).
  const usos = (p: PaginaMenu) => uso[claveAcceso(p.application_id, p.page_id)] ?? 0;
  const ordenadas = [...paginas].sort(
    (a, b) =>
      usos(b) - usos(a) ||
      b.estadistica_user - a.estadistica_user ||
      a.page_title.localeCompare(b.page_title),
  );
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
              <EnlacePagina
                key={`${p.application_id}-${p.page_id}`}
                pageId={p.page_id}
                onNav={onNavigate}
                onAbrir={() => contarUso(p)}
                className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-glow"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <I className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold">{p.page_title}</span>
              </EnlacePagina>
            );
          })}
        </div>
      )}
    </>
  );
}

// Fallback de los gráficos del dashboard mientras baja recharts.
function CargandoGrafico() {
  return (
    <div className="grid min-h-[18rem] place-items-center rounded-2xl border border-border bg-card shadow-elegant">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// Fallback mientras se descarga el chunk de una vista (React.lazy).
// Ocupa el mismo alto que el Placeholder para que el layout no salte.
function CargandoVista() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
