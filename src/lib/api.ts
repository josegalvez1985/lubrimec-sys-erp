const BASE = import.meta.env.VITE_API_URL ?? "";
const DEFAULT_APP_ID = import.meta.env.VITE_APP_ID ?? "86972";

function url(path: string) {
  return `${BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

// Query string con espacios como %20. NO usar URLSearchParams para valores con
// texto libre: codifica el espacio como '+' (form-encoding) y UTL_URL.UNESCAPE
// del backend no lo decodifica → los filtros con espacios no matchean.
function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export type Sesion = {
  token: string;
  usuario: string;
  app_user: string;
  app_id: string;
};

export function getSesion(): Sesion | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("sesion") ?? sessionStorage.getItem("sesion");
  return raw ? (JSON.parse(raw) as Sesion) : null;
}

function guardarSesion(s: Sesion, recordar: boolean) {
  const store = recordar ? localStorage : sessionStorage;
  const otro = recordar ? sessionStorage : localStorage;
  otro.removeItem("sesion");
  store.setItem("sesion", JSON.stringify(s));
}

export function cerrarSesion() {
  localStorage.removeItem("sesion");
  sessionStorage.removeItem("sesion");
}

function handleUnauthorized() {
  cerrarSesion();
  if (typeof window !== "undefined") {
    window.location.href = import.meta.env.BASE_URL || "/";
  }
}

export async function login(usuario: string, password: string, recordar = false): Promise<Sesion> {
  const res = await fetch(url("auth/login"), {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, password }),
  });
  const json = await res.json().catch(() => ({}));
  const data = json?.data ?? json;
  if (!res.ok || json?.success === false || !data?.token) {
    throw new Error(json?.message ?? "Usuario o contraseña incorrectos");
  }
  const sesion: Sesion = {
    token: data.token,
    usuario: data.usuario ?? usuario,
    app_user: String(data.app_user ?? usuario).toUpperCase(),
    app_id: String(data.app_id ?? DEFAULT_APP_ID),
  };
  guardarSesion(sesion, recordar);
  return sesion;
}

export type PaginaMenu = {
  page_title: string;
  application_id: number;
  page_id: number;
  estadistica_user: number;
  // Jerarquía del menú (APEX_APPLICATION_LIST_ENTRIES):
  entry_text: string | null; // label visible de la página
  parent_entry_text: string | null; // nombre de la categoría padre (nivel 2)
  list_entry_id: number | null;
  list_entry_parent_id: number | null;
  seq_categoria: number; // orden de la categoría padre
  seq_pagina: number; // orden de la página dentro de su categoría
};

export async function getMenuPaginas(): Promise<PaginaMenu[]> {
  const s = getSesion();
  if (!s) throw new Error("No hay sesión activa");
  // app_user_id en roles_paginas está en MAYÚSCULAS; el login puede guardarlo en
  // minúsculas (según lo tipeado), por eso se normaliza aquí.
  const q = new URLSearchParams({ app_id: DEFAULT_APP_ID, app_user: s.app_user.toUpperCase() });
  const url_final = `${url("menu/paginas")}?${q}`;
  console.log(
    "[api] menu/paginas request:",
    url_final,
    "token:",
    s.token.slice(0, 16),
    "app_id:",
    s.app_id,
    "app_user:",
    s.app_user,
  );
  const res = await fetch(url_final, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${s.token}` },
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Sesión expirada");
  }

  const data = await res.json().catch(() => ({}));
  console.log(
    "[api] menu/paginas response: status",
    res.status,
    "success:",
    data?.success,
    "message:",
    data?.message,
    "data count:",
    data?.data?.length,
  );
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message ?? "No se pudieron cargar las páginas");
  }
  return (data.data ?? []) as PaginaMenu[];
}

// ─── Marcas ──────────────────────────────────────────────────────────────────

export type Marca = {
  id_marca: number;
  descripcion: string | null;
  cod_empresa: number;
  valoracion: number | null;
};

export type MarcaInput = {
  descripcion: string | null;
  cod_empresa: number;
  valoracion: number | null;
};

async function authFetch(path: string, init: RequestInit = {}) {
  const s = getSesion();
  if (!s) throw new Error("No hay sesión activa");
  const res = await fetch(url(path), {
    ...init,
    // Datos multi-sistema: nunca servir desde caché del navegador/HTTP.
    cache: "no-store",
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${s.token}`,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Sesión expirada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message ?? "Operación fallida");
  }
  return data;
}

export async function listarMarcas(codEmpresa: number): Promise<Marca[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`marcas?${q}`);
  return (data.data ?? []) as Marca[];
}

export async function crearMarca(input: MarcaInput): Promise<number> {
  const data = await authFetch("marcas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_marca as number;
}

export async function actualizarMarca(idMarca: number, input: MarcaInput): Promise<void> {
  await authFetch(`marcas/${idMarca}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarMarca(idMarca: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`marcas/${idMarca}?${q}`, { method: "DELETE" });
}

// ─── Empresas (página 12) ────────────────────────────────────────────────────
// CRUD de EMPRESAS. activo: 'S'/'N'. nro_documento es único (backend 409 si dup).

export type Empresa = {
  cod_empresa: number;
  nombre: string | null;
  nro_documento: string | null;
  activo: string | null; // 'S' | 'N'
};

export type EmpresaInput = Omit<Empresa, "cod_empresa">;

export async function listarEmpresas(): Promise<Empresa[]> {
  const data = await authFetch("empresas");
  return (data.data ?? []) as Empresa[];
}

export async function crearEmpresa(input: EmpresaInput): Promise<number> {
  const data = await authFetch("empresas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.cod_empresa as number;
}

export async function actualizarEmpresa(codEmpresa: number, input: EmpresaInput): Promise<void> {
  await authFetch(`empresas/${codEmpresa}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarEmpresa(codEmpresa: number): Promise<void> {
  await authFetch(`empresas/${codEmpresa}`, { method: "DELETE" });
}

// ─── Personas (página 2) ─────────────────────────────────────────────────────
// CRUD de PERSONAS. tipo_persona: F=Física, J=Jurídica. ind_cliente_proveedor:
// C=Cliente, P=Proveedor, A=Ambos. fec_nacimiento: 'YYYY-MM-DD' o null.

export type Persona = {
  cod_persona: number;
  tipo_persona: string | null;
  nombre: string | null;
  nombre_fantasia: string | null;
  sexo: string | null;
  fec_nacimiento: string | null; // "YYYY-MM-DD"
  nro_telefono: string | null;
  direccion: string | null;
  nro_ci: string | null;
  nro_ruc: string | null;
  ind_cliente_proveedor: string | null;
  cod_empresa: number;
};

export type PersonaInput = Omit<Persona, "cod_persona">;

export async function listarPersonas(codEmpresa: number): Promise<Persona[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`personas?${q}`);
  return (data.data ?? []) as Persona[];
}

export async function crearPersona(input: PersonaInput): Promise<number> {
  const data = await authFetch("personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.cod_persona as number;
}

export async function actualizarPersona(codPersona: number, input: PersonaInput): Promise<void> {
  await authFetch(`personas/${codPersona}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarPersona(codPersona: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`personas/${codPersona}?${q}`, { method: "DELETE" });
}

// ─── Mensajes a WhatsApp (página 117) ──────────────────────────────────────────

// Número de la tabla numeros_whatsapp (pendientes de enviar).
export type NumeroWhatsapp = {
  id: number;
  numero: string;
  mensajeado: string; // 'N' pendiente | 'S' enviado | 'E' error
};

// El envío corre en background (job en Oracle). El endpoint responde de inmediato.
export type RespuestaEnvio = {
  envio_id: number;
  job: string;
};

export type EnvioWhatsappInput = {
  mensaje: string | null; // texto / caption de la imagen
  imagen_url: string | null; // URL pública de la imagen (wasender no acepta base64)
  numeros_manual: string[] | null; // números escritos a mano (se agregan a la tabla)
};

// Línea de LOG_WHATSAPP para seguir el progreso del envío.
export type LogWhatsapp = {
  numero: string;
  estado: string; // ENVIADO | ERROR | INVALIDO | EXCEPCION
  http: number | null;
  detalle: string | null;
  fecha: string; // ISO
};

// Números pendientes desde la BD (numeros_whatsapp con mensajeado != 'S').
export async function listarNumerosWhatsapp(): Promise<NumeroWhatsapp[]> {
  const data = await authFetch("whatsapp/numeros");
  return (data.data ?? []) as NumeroWhatsapp[];
}

// Carga masiva de números a numeros_whatsapp. Devuelve cuántos se insertaron/omitieron.
export async function cargarNumerosWhatsapp(
  numeros: string[],
): Promise<{ insertados: number; omitidos: number }> {
  const data = await authFetch("whatsapp/numeros/cargar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeros: JSON.stringify(numeros) }),
  });
  return { insertados: data.insertados ?? 0, omitidos: data.omitidos ?? 0 };
}

// Borra TODOS los números de la tabla.
export async function borrarNumerosWhatsapp(): Promise<number> {
  const data = await authFetch("whatsapp/numeros", { method: "DELETE" });
  return data.borrados ?? 0;
}

// Sube la imagen a ORDS (BLOB) y devuelve su URL pública, que wasender usará como
// imageUrl. Va por el proxy ORDS; la sirve el endpoint público whatsapp/imagen/:id.
// dataUrl: "data:image/png;base64,....". Se extrae el mime y se manda base64 puro.
export async function subirImagenWhatsapp(dataUrl: string, nombre?: string): Promise<string> {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  const mime = m?.[1] ?? "image/jpeg";
  const base64 = m?.[2] ?? dataUrl;
  const data = await authFetch("whatsapp/imagen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mime, nombre: nombre ?? null }),
  });
  if (!data?.url) throw new Error(data?.message ?? "No se pudo subir la imagen");
  return data.url as string;
}

// Lanza el envío (texto y/o imagen). Devuelve el id del envío para seguir el progreso.
export async function enviarWhatsapp(input: EnvioWhatsappInput): Promise<RespuestaEnvio> {
  const data = await authFetch("whatsapp/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mensaje: input.mensaje,
      imagen_url: input.imagen_url,
      // el back espera un JSON array serializado en el bind :numeros_manual
      numeros_manual: input.numeros_manual ? JSON.stringify(input.numeros_manual) : null,
    }),
  });
  return { envio_id: data.envio_id as number, job: data.job as string };
}

// ─── Dashboard de ventas (VENTAS_ARTICULOS) ─────────────────────────────────
// Endpoints de solo lectura para los gráficos del dashboard (db/ORDS_VENTAS_DASHBOARD.sql).
// cod_empresa por defecto: 24.

export type AnioVentas = { anio: string };
export type MesVentas = { mes: string; mes_num: string }; // "Julio" / "07"
export type VentaDia = { fecha: string; monto: number }; // "01/07" / total del día

export async function listarAniosVentas(codEmpresa = 24): Promise<AnioVentas[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`ventas/anios?${q}`);
  return (data.data ?? []) as AnioVentas[];
}

export async function listarMesesVentas(anio: string, codEmpresa = 24): Promise<MesVentas[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa), anio });
  const data = await authFetch(`ventas/meses?${q}`);
  return (data.data ?? []) as MesVentas[];
}

export async function ventasPorDia(
  anio: string,
  mes: string,
  codEmpresa = 24,
): Promise<VentaDia[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa), anio, mes });
  const data = await authFetch(`ventas/por-dia?${q}`);
  return (data.data ?? []) as VentaDia[];
}

// ─── Ventas Por Artículos (página 54) ────────────────────────────────────────
// GET ventas/articulos (db/ORDS_VENTAS_ARTICULOS.sql). Sin filtros de fecha el
// backend carga por defecto el último día con ventas (fecha_default en la respuesta).

export type VentaArticulo = {
  descripcion: string | null;
  total: number;
  fec_comprobante: string; // "DD/MM/YYYY HH24:MI"
  fec_comprobante_filtro: string; // "DD/MM/YYYY"
  cod_empresa: number;
  costo_ultimo: number | null;
  rentabilidad: number | null;
  rentabilidad_porc: number | null;
  mes_anio: string | null;
  cantidad: number;
  precio: number;
  total_costo: number | null;
  anio: string;
  mes: string;
  semana: string;
  vendedor: string | null;
  precio_lista: number | null;
  diferencia: number | null;
  codigo_oem: string | null;
  existencia: number | null;
  por_descuento: number | null;
  id_factura: number;
  nro_telefono: string | null;
  porc_comis_bancario: number | null;
  modelo_vehiculo: string | null;
};

export type FiltrosVentasArticulos = {
  search?: string;
  fecha?: string; // DD/MM/YYYY
  semana?: string; // WW
  mes?: string; // MM
  anio?: string; // YYYY
  vendedor?: string;
};

export async function listarVentasArticulos(
  filtros: FiltrosVentasArticulos = {},
  codEmpresa = 24,
): Promise<{ ventas: VentaArticulo[]; fechaDefault: string | null }> {
  const params: Record<string, string> = { cod_empresa: String(codEmpresa) };
  for (const [k, v] of Object.entries(filtros)) {
    if (v != null && v !== "") params[k] = v;
  }
  const data = await authFetch(`ventas/articulos?${qs(params)}`);
  return {
    ventas: (data.data ?? []) as VentaArticulo[],
    fechaDefault: (data.fecha_default as string | undefined) ?? null,
  };
}

// ─── Artículos Más Vendidos (página 102) ─────────────────────────────────────
// GET articulos/mas-vendidos (db/ORDS_ARTICULOS_MAS_VENDIDOS.sql). Orden fijo:
// cantidad_ventas desc. Filtros = facetas de la página 102.

export type ArticuloMasVendido = {
  cantidad_ventas: number;
  stock: number | null;
  descripcion: string | null;
  codigo_oem: string | null;
  costo_ultimo: number | null;
  fecha_ultimo_inventario: string | null; // "DD/MM/YYYY"
  proveedor: string | null;
  rubro: string | null;
  id_articulo: string;
  id_viscosidad: number | null;
  cod_unidad_medida: string | null;
  marca: string | null;
  viscosidad: string | null;
};

// Facetas: arrays (multi-selección, se envían como CSV). search/descripcion: texto.
export type FiltrosMasVendidos = {
  search?: string;
  descripcion?: string;
  proveedor?: string[];
  rubro?: string[];
  viscosidad?: string[];
  marca?: string[];
  unidad?: string[];
};

export async function listarArticulosMasVendidos(
  filtros: FiltrosMasVendidos = {},
  codEmpresa = 24,
): Promise<ArticuloMasVendido[]> {
  const params: Record<string, string> = { cod_empresa: String(codEmpresa) };
  for (const [k, v] of Object.entries(filtros)) {
    if (Array.isArray(v)) {
      if (v.length > 0) params[k] = v.join(",");
    } else if (v != null && v !== "") {
      params[k] = v;
    }
  }
  const data = await authFetch(`articulos/mas-vendidos?${qs(params)}`);
  return (data.data ?? []) as ArticuloMasVendido[];
}

// ─── Pedidos de Artículos (página 63) ────────────────────────────────────────
// GET pedidos/articulos (db/ORDS_PEDIDOS_ARTICULOS.sql). Devuelve TODO el dataset;
// búsqueda, facetas y orden se hacen en el front.

export type PedidoArticulo = {
  codigo_oem: string | null;
  articulo: string | null;
  existencia: number | null;
  costo_ultimo: number | null;
  proveedor: string | null;
  rubro: string | null;
  ventas: number;
  compras: number;
  rotacion: number | null;
  faltantes: string; // 'En Falta' | 'Stock'
};

export async function listarPedidosArticulos(codEmpresa = 24): Promise<PedidoArticulo[]> {
  const data = await authFetch(`pedidos/articulos?cod_empresa=${codEmpresa}`);
  return (data.data ?? []) as PedidoArticulo[];
}

// Progreso del envío: filas de LOG_WHATSAPP desde una marca de tiempo (ISO).
// Se usa en polling: un fallo puntual (incl. 401) NO debe cerrar sesión ni
// redirigir al login (sacaría al usuario de la pantalla en pleno envío). Por eso
// no usa authFetch; ante error devuelve [] y el poll reintenta en el próximo tick.
export async function logsWhatsapp(desde?: string): Promise<LogWhatsapp[]> {
  const s = getSesion();
  if (!s) return [];
  const q = desde ? `?${new URLSearchParams({ desde })}` : "";
  try {
    const res = await fetch(url(`whatsapp/logs${q}`), {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.data ?? []) as LogWhatsapp[];
  } catch {
    return [];
  }
}
