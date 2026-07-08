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

// Detecta el rechazo de token del backend aun cuando el status HTTP no llegó como
// 401 (algunos handlers ORDS ya abrieron la respuesta y el STATUS_LINE queda en 200).
function esTokenInvalido(res: Response, data: { success?: boolean; message?: string }) {
  return (
    res.status === 401 ||
    (data?.success === false &&
      typeof data?.message === "string" &&
      /token\s+invalido|token\s+inválido/i.test(data.message))
  );
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

  const data = await res.json().catch(() => ({}));
  if (esTokenInvalido(res, data)) {
    handleUnauthorized();
    throw new Error("Sesión expirada");
  }
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
  const data = await res.json().catch(() => ({}));
  if (esTokenInvalido(res, data)) {
    handleUnauthorized();
    throw new Error("Sesión expirada");
  }
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

// ─── Condiciones de Facturas (página 42) ─────────────────────────────────────
// CRUD de CONDICIONES_FACTURAS. id_condicion por IDENTITY. dias = plazo en días.

export type CondicionFactura = {
  id_condicion: number;
  descripcion: string | null;
  dias: number;
};

export type CondicionFacturaInput = {
  descripcion: string | null;
  dias: number;
};

export async function listarCondicionesFacturas(): Promise<CondicionFactura[]> {
  const data = await authFetch("condiciones-facturas");
  return (data.data ?? []) as CondicionFactura[];
}

export async function crearCondicionFactura(input: CondicionFacturaInput): Promise<number> {
  const data = await authFetch("condiciones-facturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_condicion as number;
}

export async function actualizarCondicionFactura(
  idCondicion: number,
  input: CondicionFacturaInput,
): Promise<void> {
  await authFetch(`condiciones-facturas/${idCondicion}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarCondicionFactura(idCondicion: number): Promise<void> {
  await authFetch(`condiciones-facturas/${idCondicion}`, { method: "DELETE" });
}

// ─── Talonarios (página 44) ──────────────────────────────────────────────────
// CRUD de TALONARIOS (timbrados). id_talonario por IDENTITY. Multiempresa.
// fecha_vigencia / fecha_vencimiento como texto 'YYYY-MM-DD'. ind_ncr/activo = 'S'/'N'.

export type Talonario = {
  id_talonario: number;
  ser_timbrado: string;
  nro_timbrado: number;
  fecha_vigencia: string | null;
  fecha_vencimiento: string | null;
  nro_inicial: number;
  nro_final: number;
  ind_ncr: string;
  cod_empresa: number;
  activo: string;
};

export type TalonarioInput = Omit<Talonario, "id_talonario">;

export async function listarTalonarios(codEmpresa: number): Promise<Talonario[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`talonarios?${q}`);
  return (data.data ?? []) as Talonario[];
}

export async function crearTalonario(input: TalonarioInput): Promise<number> {
  const data = await authFetch("talonarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_talonario as number;
}

export async function actualizarTalonario(
  idTalonario: number,
  input: TalonarioInput,
): Promise<void> {
  await authFetch(`talonarios/${idTalonario}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarTalonario(idTalonario: number): Promise<void> {
  await authFetch(`talonarios/${idTalonario}`, { method: "DELETE" });
}

// ─── Formas de Cobro/Pago (página 48) ────────────────────────────────────────
// CRUD de FORMA_COBRO_PAGO. id_forma por IDENTITY. estado = 'S'/'N'.

export type FormaCobroPago = {
  id_forma: number;
  descripcion: string | null;
  estado: string;
};

export type FormaCobroPagoInput = Omit<FormaCobroPago, "id_forma">;

export async function listarFormasCobroPago(): Promise<FormaCobroPago[]> {
  const data = await authFetch("formas-cobro-pago");
  return (data.data ?? []) as FormaCobroPago[];
}

export async function crearFormaCobroPago(input: FormaCobroPagoInput): Promise<number> {
  const data = await authFetch("formas-cobro-pago", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_forma as number;
}

export async function actualizarFormaCobroPago(
  idForma: number,
  input: FormaCobroPagoInput,
): Promise<void> {
  await authFetch(`formas-cobro-pago/${idForma}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarFormaCobroPago(idForma: number): Promise<void> {
  await authFetch(`formas-cobro-pago/${idForma}`, { method: "DELETE" });
}

// ─── Bancos (página 60) ──────────────────────────────────────────────────────
// CRUD de BANCOS. id_banco por IDENTITY. activo = 'S'/'N'.

export type Banco = {
  id_banco: number;
  nombre: string | null;
  activo: string;
};

export type BancoInput = Omit<Banco, "id_banco">;

export async function listarBancos(): Promise<Banco[]> {
  const data = await authFetch("bancos");
  return (data.data ?? []) as Banco[];
}

export async function crearBanco(input: BancoInput): Promise<number> {
  const data = await authFetch("bancos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_banco as number;
}

export async function actualizarBanco(idBanco: number, input: BancoInput): Promise<void> {
  await authFetch(`bancos/${idBanco}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarBanco(idBanco: number): Promise<void> {
  await authFetch(`bancos/${idBanco}`, { method: "DELETE" });
}

// ─── Viscosidad de Lubricantes (página 52) ───────────────────────────────────
// CRUD de VISCOSIDAD_LUBRICANTES. id_viscosidad por IDENTITY. motor_caja = 'M'/'C'.

export type Viscosidad = {
  id_viscosidad: number;
  descripcion: string | null;
  motor_caja: string;
};

export type ViscosidadInput = Omit<Viscosidad, "id_viscosidad">;

export async function listarViscosidades(): Promise<Viscosidad[]> {
  const data = await authFetch("viscosidad-lubricantes");
  return (data.data ?? []) as Viscosidad[];
}

export async function crearViscosidad(input: ViscosidadInput): Promise<number> {
  const data = await authFetch("viscosidad-lubricantes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_viscosidad as number;
}

export async function actualizarViscosidad(
  idViscosidad: number,
  input: ViscosidadInput,
): Promise<void> {
  await authFetch(`viscosidad-lubricantes/${idViscosidad}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarViscosidad(idViscosidad: number): Promise<void> {
  await authFetch(`viscosidad-lubricantes/${idViscosidad}`, { method: "DELETE" });
}

// ─── Rubros (página 20) ──────────────────────────────────────────────────────

export type Rubro = {
  id_rubro: number;
  descripcion: string | null;
  cod_empresa: number;
  porc_recargo: number | null;
};

export type RubroInput = {
  descripcion: string | null;
  cod_empresa: number;
  porc_recargo: number | null;
};

export async function listarRubros(codEmpresa: number): Promise<Rubro[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`rubros?${q}`);
  return (data.data ?? []) as Rubro[];
}

export async function crearRubro(input: RubroInput): Promise<number> {
  const data = await authFetch("rubros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_rubro as number;
}

export async function actualizarRubro(idRubro: number, input: RubroInput): Promise<void> {
  await authFetch(`rubros/${idRubro}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarRubro(idRubro: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`rubros/${idRubro}?${q}`, { method: "DELETE" });
}

// ─── Monedas (página 18) — maestro-detalle ───────────────────────────────────
// Cabecera MONEDAS + detalle MONEDAS_DETALLE (denominaciones con imagen). La
// imagen viaja como base64 en el JSON. El detalle usa upsert por (cod_moneda, valor).

export type Moneda = {
  cod_moneda: number;
  descripcion: string | null;
  siglas: string | null;
  decimales: number | null;
  cant_detalle: number;
};

export type MonedaInput = {
  descripcion: string | null;
  siglas: string | null;
  decimales: number | null;
};

export type MonedaDetalle = {
  valor: number;
  cod_moneda: number;
  nombre_imagen: string | null;
  mime_type: string | null;
  last_update: string | null;
  imagen_base64: string | null; // base64 puro (sin prefijo data:)
};

export async function listarMonedas(): Promise<Moneda[]> {
  const data = await authFetch("monedas");
  return (data.data ?? []) as Moneda[];
}

export async function crearMoneda(input: MonedaInput): Promise<number> {
  const data = await authFetch("monedas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.cod_moneda as number;
}

export async function actualizarMoneda(codMoneda: number, input: MonedaInput): Promise<void> {
  await authFetch(`monedas/${codMoneda}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarMoneda(codMoneda: number): Promise<void> {
  await authFetch(`monedas/${codMoneda}`, { method: "DELETE" });
}

export async function listarMonedaDetalle(codMoneda: number): Promise<MonedaDetalle[]> {
  const data = await authFetch(`monedas/${codMoneda}/detalle`);
  return (data.data ?? []) as MonedaDetalle[];
}

// Upsert de una denominación. imagen_base64/nombre/mime null = no cambia la imagen.
export async function guardarMonedaDetalle(
  codMoneda: number,
  input: {
    valor: number;
    imagen_base64: string | null;
    nombre_imagen: string | null;
    mime_type: string | null;
  },
): Promise<void> {
  await authFetch(`monedas/${codMoneda}/detalle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarMonedaDetalle(codMoneda: number, valor: number): Promise<void> {
  await authFetch(`monedas/${codMoneda}/detalle/${valor}`, { method: "DELETE" });
}

// ─── IVA (página 10) ─────────────────────────────────────────────────────────
// CRUD de IVA. La PK cod_iva la ingresa el usuario. Al editar no cambia.

export type Iva = {
  cod_iva: number;
  divisor_iva: number | null;
  descripcion: string | null;
  divisor_gravada: number | null;
};

export async function listarIva(): Promise<Iva[]> {
  const data = await authFetch("iva");
  return (data.data ?? []) as Iva[];
}

export async function crearIva(input: Iva): Promise<number> {
  const data = await authFetch("iva", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.cod_iva as number;
}

export async function actualizarIva(codIva: number, input: Omit<Iva, "cod_iva">): Promise<void> {
  await authFetch(`iva/${codIva}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarIva(codIva: number): Promise<void> {
  await authFetch(`iva/${codIva}`, { method: "DELETE" });
}

// ─── Unidades de Medidas (página 21) ─────────────────────────────────────────
// CRUD de UNIDADES_MEDIDAS. La PK cod_unidad_medida la ingresa el usuario (max 5
// chars, se guarda en mayúsculas). Al editar, el código no cambia.

export type UnidadMedida = {
  cod_unidad_medida: string;
  descripcion: string | null;
};

export async function listarUnidadesMedidas(): Promise<UnidadMedida[]> {
  const data = await authFetch("unidades-medidas");
  return (data.data ?? []) as UnidadMedida[];
}

export async function crearUnidadMedida(input: UnidadMedida): Promise<string> {
  const data = await authFetch("unidades-medidas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.cod_unidad_medida as string;
}

export async function actualizarUnidadMedida(
  cod: string,
  descripcion: string | null,
): Promise<void> {
  await authFetch(`unidades-medidas/${encodeURIComponent(cod)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descripcion }),
  });
}

export async function eliminarUnidadMedida(cod: string): Promise<void> {
  await authFetch(`unidades-medidas/${encodeURIComponent(cod)}`, { method: "DELETE" });
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
  id_articulo: string | null;
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
  id_articulo: string | null;
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

// ─── Códigos de Barras (página 24) ───────────────────────────────────────────
// CRUD de CODIGOS_BARRAS. PK id_barra. descripcion_articulo/codigo_oem vienen del
// JOIN a articulos (solo lectura). El artículo se elige con buscarArticulos.

export type CodigoBarra = {
  id_barra: number;
  id_articulo: number;
  cod_barra: string;
  cod_empresa: number;
  descripcion_articulo: string | null;
  codigo_oem: string | null;
};

export type CodigoBarraInput = {
  id_articulo: number;
  cod_barra: string;
  cod_empresa: number;
};

export type ArticuloBusqueda = {
  id_articulo: number;
  descripcion: string | null;
  codigo_oem: string | null;
  precio_venta: number | null;
  costo_ultima_compra: number | null;
};

export async function listarCodigosBarras(codEmpresa: number): Promise<CodigoBarra[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`codigos-barras?${q}`);
  return (data.data ?? []) as CodigoBarra[];
}

export async function crearCodigoBarra(input: CodigoBarraInput): Promise<number> {
  const data = await authFetch("codigos-barras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_barra as number;
}

export async function actualizarCodigoBarra(idBarra: number, input: CodigoBarraInput): Promise<void> {
  await authFetch(`codigos-barras/${idBarra}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarCodigoBarra(idBarra: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`codigos-barras/${idBarra}?${q}`, { method: "DELETE" });
}

export async function buscarArticulos(codEmpresa: number, q: string): Promise<ArticuloBusqueda[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa), q });
  const data = await authFetch(`articulos/buscar?${params}`);
  return (data.data ?? []) as ArticuloBusqueda[];
}

// ─── Artículos-Proveedores (página 27) ───────────────────────────────────────
// CRUD de ARTICULOS_PROVEEDORES. PK id_articulo_proveedor. descripcion_articulo/
// codigo_oem/nombre_proveedor vienen del JOIN (solo lectura). El artículo se elige
// con buscarArticulos y el proveedor con buscarProveedores.

export type ArticuloProveedor = {
  id_articulo_proveedor: number;
  id_articulo: number;
  cod_persona: number;
  id_cod_proveedor: string;
  cod_empresa: number;
  descripcion_articulo: string | null;
  codigo_oem: string | null;
  nombre_proveedor: string | null;
};

export type ArticuloProveedorInput = {
  id_articulo: number;
  cod_persona: number;
  id_cod_proveedor: string;
  cod_empresa: number;
};

export type ProveedorBusqueda = {
  cod_persona: number;
  nombre: string | null;
  nro_ruc: string | null;
  nro_ci: string | null;
};

export async function listarArticulosProveedores(codEmpresa: number): Promise<ArticuloProveedor[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`articulos-proveedores?${q}`);
  return (data.data ?? []) as ArticuloProveedor[];
}

export async function crearArticuloProveedor(input: ArticuloProveedorInput): Promise<number> {
  const data = await authFetch("articulos-proveedores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_articulo_proveedor as number;
}

export async function actualizarArticuloProveedor(
  id: number,
  input: ArticuloProveedorInput,
): Promise<void> {
  await authFetch(`articulos-proveedores/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarArticuloProveedor(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`articulos-proveedores/${id}?${q}`, { method: "DELETE" });
}

export async function buscarProveedores(codEmpresa: number, q: string): Promise<ProveedorBusqueda[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa), q });
  const data = await authFetch(`proveedores/buscar?${params}`);
  return (data.data ?? []) as ProveedorBusqueda[];
}

// ─── Vehículos-Repuestos (página 94) ─────────────────────────────────────────
// CRUD de VEHICULOS_REPUESTOS. PK id_vehiculo (IDENTITY). UK (cod_empresa, modelo,
// codigo_oem). Relaciona un modelo de vehículo con el código OEM de un repuesto.

export type VehiculoRepuesto = {
  id_vehiculo: number;
  cod_empresa: number;
  modelo: string;
  codigo_oem: string;
};

export type VehiculoRepuestoInput = {
  modelo: string;
  codigo_oem: string;
  cod_empresa: number;
};

export async function listarVehiculosRepuestos(codEmpresa: number): Promise<VehiculoRepuesto[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`vehiculos-repuestos?${q}`);
  return (data.data ?? []) as VehiculoRepuesto[];
}

export async function crearVehiculoRepuesto(input: VehiculoRepuestoInput): Promise<number> {
  const data = await authFetch("vehiculos-repuestos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_vehiculo as number;
}

export async function actualizarVehiculoRepuesto(
  id: number,
  input: VehiculoRepuestoInput,
): Promise<void> {
  await authFetch(`vehiculos-repuestos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarVehiculoRepuesto(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`vehiculos-repuestos/${id}?${q}`, { method: "DELETE" });
}

// ─── Artículos (página 4) ────────────────────────────────────────────────────
// CRUD de ARTICULOS. PK id_articulo por trigger. FKs: iva, unidad, rubro, marca,
// viscosidad. Imagen en BLOB (base64 en JSON). LISTAR NO trae el blob: solo
// tiene_imagen + descripciones del JOIN. OBTENER trae imagen_base64. Campos
// calculados por otros procesos (existencia, cantidad_vendida, costo_ultima_compra,
// fecha_ultimo_inventario) son de solo lectura: se muestran pero no se envían.

export type Articulo = {
  id_articulo: number;
  descripcion: string | null;
  cod_iva: number | null;
  cod_unidad_medida: string | null;
  estado: string | null; // 'A' activo / 'I' inactivo
  es_activo: string | null; // 'S' / 'N'
  id_rubro: number | null;
  id_marca: number | null;
  id_viscosidad: number | null;
  codigo_oem: string | null;
  precio_venta: number | null;
  valoracion: number | null;
  existencia: number | null;
  cantidad_vendida: number | null;
  costo_ultima_compra: number | null;
  fecha_ultimo_inventario: string | null;
  tiene_imagen: number; // 1/0
  descripcion_rubro: string | null;
  descripcion_marca: string | null;
  descripcion_viscosidad: string | null;
};

// Detalle de OBTENER: agrega la imagen y quita los campos derivados del JOIN.
export type ArticuloDetalle = {
  id_articulo: number;
  descripcion: string | null;
  cod_iva: number | null;
  cod_unidad_medida: string | null;
  estado: string | null;
  es_activo: string | null;
  id_rubro: number | null;
  id_marca: number | null;
  id_viscosidad: number | null;
  codigo_oem: string | null;
  precio_venta: number | null;
  valoracion: number | null;
  existencia: number | null;
  cantidad_vendida: number | null;
  costo_ultima_compra: number | null;
  fecha_ultimo_inventario: string | null;
  nombre_imagen: string | null;
  mime_type: string | null;
  imagen_base64: string | null;
  cod_empresa: number;
};

// Lo que el usuario escribe. imagen_base64/nombre/mime null = no cambiar la imagen.
export type ArticuloInput = {
  descripcion: string | null;
  cod_iva: number | null;
  cod_unidad_medida: string | null;
  id_rubro: number | null;
  id_marca: number | null;
  id_viscosidad: number | null;
  codigo_oem: string | null;
  valoracion: number | null;
  estado: string | null;
  es_activo: string | null;
  imagen_base64: string | null;
  nombre_imagen: string | null;
  mime_type: string | null;
  cod_empresa: number;
};

export async function listarArticulos(codEmpresa: number): Promise<Articulo[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`articulos?${q}`);
  return (data.data ?? []) as Articulo[];
}

export async function obtenerArticulo(id: number, codEmpresa: number): Promise<ArticuloDetalle> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`articulos/${id}?${q}`);
  return data.data as ArticuloDetalle;
}

export async function crearArticulo(input: ArticuloInput): Promise<number> {
  const data = await authFetch("articulos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_articulo as number;
}

export async function actualizarArticulo(id: number, input: ArticuloInput): Promise<void> {
  await authFetch(`articulos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarArticulo(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`articulos/${id}?${q}`, { method: "DELETE" });
}

// URL directa del BLOB de la imagen (endpoint público, para <img src>). No usa
// authFetch: el navegador no manda Authorization en un <img>.
export function urlImagenArticulo(id: number, codEmpresa: number): string {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  return url(`articulos/${id}/imagen?${q}`);
}

// ─── Logs de WhatsApp (página 120) ───────────────────────────────────────────
// Auditoría de envíos (LOG_WHATSAPP), solo lectura. Sin cod_empresa (es global).
// Distinto de whatsapp/logs (ese es el polling del envío en curso).

// Fila de LOG_WHATSAPP para la auditoría (pág 120). Nombre distinto de LogWhatsapp
// (ese es el del polling del envío en curso, pág 117, con otra forma).
export type LogWhatsappRegistro = {
  id: number;
  fecha: string; // DD/MM/YYYY HH24:MI:SS
  numero_original: string | null;
  numero_limpio: string | null;
  mensaje: string | null;
  estado: string | null; // ENVIADO / ERROR / INVALIDO / EXCEPCION
  http_status: number | null;
  detalle_error: string | null;
};

export type LogWhatsappFiltros = {
  numero?: string;
  estado?: string;
  fecha_desde?: string; // YYYY-MM-DD
  fecha_hasta?: string; // YYYY-MM-DD
};

export async function listarLogsWhatsapp(
  filtros: LogWhatsappFiltros = {},
): Promise<LogWhatsappRegistro[]> {
  const q = new URLSearchParams();
  if (filtros.numero) q.set("numero", filtros.numero);
  if (filtros.estado) q.set("estado", filtros.estado);
  if (filtros.fecha_desde) q.set("fecha_desde", filtros.fecha_desde);
  if (filtros.fecha_hasta) q.set("fecha_hasta", filtros.fecha_hasta);
  const qs = q.toString();
  const data = await authFetch(`logs-whatsapp${qs ? `?${qs}` : ""}`);
  return (data.data ?? []) as LogWhatsappRegistro[];
}

// ─── Compras-Pagos (página 77) ───────────────────────────────────────────────
// CRUD de COMPRAS_PAGOS. PK id_pago (IDENTITY). nro_recibo lo ingresa el usuario.
// La factura (id_factura) se elige con buscarCompras; la forma de pago (id_forma)
// con listarFormasCobroPago (select). descripcion_forma / nro_comprobante /
// ser_timbrado / tip_comprobante / nombre_proveedor vienen del JOIN (solo lectura).

export type CompraPago = {
  id_pago: number;
  fecha: string; // YYYY-MM-DD
  id_factura: number;
  id_forma: number;
  monto: number;
  observacion: string | null;
  cod_empresa: number;
  nro_recibo: number;
  descripcion_forma: string | null;
  nro_comprobante: number | null;
  ser_timbrado: string | null;
  tip_comprobante: string | null;
  nombre_proveedor: string | null;
};

export type CompraPagoInput = {
  fecha: string;
  id_factura: number;
  id_forma: number;
  monto: number;
  observacion: string | null;
  nro_recibo: number;
  cod_empresa: number;
};

export type CompraBusqueda = {
  id_factura: number;
  nro_comprobante: number | null;
  ser_timbrado: string | null;
  tip_comprobante: string | null;
  fec_comprobante: string | null;
  nombre_proveedor: string | null;
};

export async function listarComprasPagos(codEmpresa: number): Promise<CompraPago[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`compras-pagos?${q}`);
  return (data.data ?? []) as CompraPago[];
}

export async function crearCompraPago(input: CompraPagoInput): Promise<number> {
  const data = await authFetch("compras-pagos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_pago as number;
}

export async function actualizarCompraPago(id: number, input: CompraPagoInput): Promise<void> {
  await authFetch(`compras-pagos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarCompraPago(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`compras-pagos/${id}?${q}`, { method: "DELETE" });
}

export async function buscarCompras(codEmpresa: number, q: string): Promise<CompraBusqueda[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa), q });
  const data = await authFetch(`compras/buscar?${params}`);
  return (data.data ?? []) as CompraBusqueda[];
}

// ─── Vendedores (página 30) ──────────────────────────────────────────────────
// CRUD de VENDEDORES. PK cod_vendedor (secuencia vía trigger). Multiempresa.
// estado 'S'/'N'. porc_comision numérico. cod_usuario texto libre.

export type Vendedor = {
  cod_vendedor: number;
  nombre: string | null;
  porc_comision: number | null;
  estado: string;
  cod_usuario: string | null;
  cod_empresa: number;
};

export type VendedorInput = {
  nombre: string;
  porc_comision: number | null;
  estado: string;
  cod_usuario: string | null;
  cod_empresa: number;
};

export async function listarVendedores(codEmpresa: number): Promise<Vendedor[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`vendedores?${q}`);
  return (data.data ?? []) as Vendedor[];
}

export async function crearVendedor(input: VendedorInput): Promise<number> {
  const data = await authFetch("vendedores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.cod_vendedor as number;
}

export async function actualizarVendedor(id: number, input: VendedorInput): Promise<void> {
  await authFetch(`vendedores/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarVendedor(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`vendedores/${id}?${q}`, { method: "DELETE" });
}

// ─── Descuentos Escalonados (página 106) ─────────────────────────────────────
// CRUD de TABLA_DESCUENTOS. PK id_tabla (IDENTITY). SIN cod_empresa (global).
// venta_x = 1 - porcentaje/100 (autocalculado). rentabilidad_70 = 70 - porcentaje
// (solo lectura, lo calcula el backend).

export type DescuentoEscalonado = {
  id_tabla: number;
  monto_desde: number;
  monto_hasta: number;
  porcentaje: number;
  venta_x: number;
  fecha_desde: string; // YYYY-MM-DD
  rentabilidad_70: number;
};

export type DescuentoEscalonadoInput = {
  monto_desde: number;
  monto_hasta: number;
  porcentaje: number;
  venta_x: number;
  fecha_desde: string;
};

export async function listarDescuentosEscalonados(): Promise<DescuentoEscalonado[]> {
  const data = await authFetch("descuentos-escalonados");
  return (data.data ?? []) as DescuentoEscalonado[];
}

export async function crearDescuentoEscalonado(input: DescuentoEscalonadoInput): Promise<number> {
  const data = await authFetch("descuentos-escalonados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_tabla as number;
}

export async function actualizarDescuentoEscalonado(
  id: number,
  input: DescuentoEscalonadoInput,
): Promise<void> {
  await authFetch(`descuentos-escalonados/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarDescuentoEscalonado(id: number): Promise<void> {
  await authFetch(`descuentos-escalonados/${id}`, { method: "DELETE" });
}

// ─── Post Venta (página 105) ─────────────────────────────────────────────────
// Solo lectura: teléfonos únicos de ventas_cabecera (normalizados a +5959########)
// con la fecha del último comprobante. Filtro opcional por texto (q).

export type PostVenta = {
  nro_telefono: string;
  fecha: string; // YYYY-MM-DD
};

export async function listarPostVenta(codEmpresa: number, q = ""): Promise<PostVenta[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (q) params.set("q", q);
  const data = await authFetch(`post-venta?${params}`);
  return (data.data ?? []) as PostVenta[];
}

// ─── Suba de Precios (página 100) ────────────────────────────────────────────
// Solo lectura: último precio (MAX id_precio) de cada artículo activo, con margen,
// precio anterior y stock. Facetas en el front por marca y rubro.

export type SubaPrecio = {
  id_precio: number;
  id_articulo: number;
  articulo: string | null;
  codigo_oem: string | null;
  marca: string | null;
  rubro: string | null;
  fecha: string; // YYYY-MM-DD
  precio_compra: number | null;
  precio_venta: number | null;
  precio_venta_anterior: number | null;
  porc_recargo: number | null;
  margen: number | null;
  stock: number | null;
};

export type SubaPrecioInput = {
  id_articulo: number;
  precio_compra: number | null;
  porc_recargo: number | null;
  precio_venta: number;
  cod_empresa: number;
};

export async function listarSubaPrecios(codEmpresa: number): Promise<SubaPrecio[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`suba-precios?${q}`);
  return (data.data ?? []) as SubaPrecio[];
}

// Inserta un precio nuevo (queda como el último precio del artículo). El histórico
// se mantiene; los triggers actualizan articulos.precio_venta/costo_ultima_compra.
export async function crearSubaPrecio(input: SubaPrecioInput): Promise<number> {
  const data = await authFetch("suba-precios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_precio as number;
}

// ─── Descuentos (página 67) ──────────────────────────────────────────────────
// CRUD de DESCUENTOS. PK id_descuento (IDENTITY). Multiempresa. Vigencia por rango
// de fechas (fecha_desde/fecha_hasta) + porc_descuento. (Distinta de TABLA_DESCUENTOS
// / Descuentos Escalonados de la pág 106.)

export type Descuento = {
  id_descuento: number;
  fecha_desde: string | null; // YYYY-MM-DD
  fecha_hasta: string | null;
  porc_descuento: number | null;
  cod_empresa: number;
};

export type DescuentoInput = {
  fecha_desde: string | null;
  fecha_hasta: string | null;
  porc_descuento: number | null;
  cod_empresa: number;
};

export async function listarDescuentos(codEmpresa: number): Promise<Descuento[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`descuentos?${q}`);
  return (data.data ?? []) as Descuento[];
}

export async function crearDescuento(input: DescuentoInput): Promise<number> {
  const data = await authFetch("descuentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_descuento as number;
}

export async function actualizarDescuento(id: number, input: DescuentoInput): Promise<void> {
  await authFetch(`descuentos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarDescuento(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`descuentos/${id}?${q}`, { method: "DELETE" });
}

// ─── Cierre del Día (página 62) ──────────────────────────────────────────────
// Solo lectura sobre V_COBROS_CLIENTES. Reporte agrupado por fecha/forma/banco/
// transacción/vendedor. La dona del dashboard usa hoy-por-forma.

export type CierreDiaFila = {
  fecha: string; // dd/mm/yyyy (viene formateada de la vista)
  id_forma: number | null;
  desc_forma: string | null;
  id_banco: number | null;
  nombre_banco: string | null;
  nro_transaccion: string | null;
  nombre_vendedor: string | null;
  total: number;
};

export type CobroPorForma = { desc_forma: string | null; total: number };
export type CobrosHoy = { fecha: string | null; filas: CobroPorForma[] };

export async function listarCierreDia(codEmpresa: number): Promise<CierreDiaFila[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`cierre-dia?${q}`);
  return (data.data ?? []) as CierreDiaFila[];
}

export async function cobrosHoyPorForma(codEmpresa: number): Promise<CobrosHoy> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`cierre-dia/hoy-por-forma?${q}`);
  return {
    fecha: (data.fecha ?? null) as string | null,
    filas: (data.data ?? []) as CobroPorForma[],
  };
}

// ─── Números de Vouchers (página 71) ─────────────────────────────────────────
// CRUD de NUMEROS_VOUCHERS. PK id_voucher (IDENTITY). FK id_persona -> personas
// (selector con buscarPersonas). Sin cod_empresa propio: se pasa para el JOIN al
// nombre de la persona. Rango numero_desde/hasta, fecha_vencimiento, % descuento.

export type NumeroVoucher = {
  id_voucher: number;
  id_persona: number;
  numero_desde: number;
  numero_hasta: number;
  fecha_vencimiento: string; // YYYY-MM-DD
  porcentaje_descuento: number | null;
  nombre_persona: string | null;
};

export type NumeroVoucherInput = {
  id_persona: number;
  numero_desde: number;
  numero_hasta: number;
  fecha_vencimiento: string;
  porcentaje_descuento: number | null;
};

export async function listarNumerosVouchers(codEmpresa: number): Promise<NumeroVoucher[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`numeros-vouchers?${q}`);
  return (data.data ?? []) as NumeroVoucher[];
}

export async function crearNumeroVoucher(input: NumeroVoucherInput): Promise<number> {
  const data = await authFetch("numeros-vouchers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_voucher as number;
}

export async function actualizarNumeroVoucher(
  id: number,
  input: NumeroVoucherInput,
): Promise<void> {
  await authFetch(`numeros-vouchers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarNumeroVoucher(id: number): Promise<void> {
  await authFetch(`numeros-vouchers/${id}`, { method: "DELETE" });
}

// Buscador de personas (todas las de la empresa) para el selector del voucher.
export async function buscarPersonas(codEmpresa: number, q: string): Promise<ProveedorBusqueda[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (q.trim()) params.set("q", q.trim());
  const data = await authFetch(`personas/buscar?${params}`);
  return (data.data ?? []) as ProveedorBusqueda[];
}

// ─── Conteo de Efectivo (página 85, modal 86) ────────────────────────────────
// CRUD de CONTEO_EFECTIVO. PK id_conteo (IDENTITY). total = valor·cantidad.
// Permisos: JOSEG ve todo/filtra por fecha; resto solo hoy (lo resuelve el backend
// con app_user). El select de moneda usa listarMonedas; el de valores (con imagen
// del billete) usa listarMonedasDetalle.

export type ConteoEfectivo = {
  id_conteo: number;
  fecha: string; // YYYY-MM-DD
  valor: number;
  cantidad: number;
  cod_moneda: number;
  moneda: string | null;
  total: number;
  cod_empresa: number;
};

export type ConteoEfectivoInput = {
  fecha: string;
  valor: number;
  cantidad: number;
  cod_moneda: number;
  cod_empresa: number;
};

// Valores del billete de una moneda (con imagen), para el select del modal.
export async function listarMonedasDetalle(codMoneda: number): Promise<MonedaDetalle[]> {
  const data = await authFetch(`monedas/${codMoneda}/detalle`);
  return (data.data ?? []) as MonedaDetalle[];
}

// dias = ventana hacia atrás (default 3 en el backend). 0 = todos. Se ignora si hay fecha.
export async function listarConteoEfectivo(
  codEmpresa: number,
  appUser: string,
  fecha?: string,
  dias?: number,
): Promise<ConteoEfectivo[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa), app_user: appUser });
  if (fecha) q.set("fecha", fecha);
  if (dias != null) q.set("dias", String(dias));
  const data = await authFetch(`conteo-efectivo?${q}`);
  return (data.data ?? []) as ConteoEfectivo[];
}

export async function crearConteoEfectivo(input: ConteoEfectivoInput): Promise<number> {
  const data = await authFetch("conteo-efectivo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_conteo as number;
}

export async function actualizarConteoEfectivo(
  id: number,
  input: ConteoEfectivoInput,
): Promise<void> {
  await authFetch(`conteo-efectivo/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarConteoEfectivo(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`conteo-efectivo/${id}?${q}`, { method: "DELETE" });
}

// Panel de 7 totales de control de la fecha (solo JOSEG; visible=false si no).
export type ConteoResumen = {
  visible: boolean;
  total_efectivo?: number;
  no_efectivo?: number;
  conteo_anterior?: number;
  total_conteo?: number;
  pagos?: number;
  retiro_efectivo?: number;
  total_caja?: number;
  diferencia?: number;
};

export async function obtenerResumenConteo(
  codEmpresa: number,
  appUser: string,
  fecha: string,
): Promise<ConteoResumen> {
  const q = new URLSearchParams({
    cod_empresa: String(codEmpresa),
    app_user: appUser,
    fecha,
  });
  const data = await authFetch(`conteo-efectivo/resumen?${q}`);
  return (data.data ?? { visible: false }) as ConteoResumen;
}

// ─── Rendiciones de Caja (pág 73/74) ─────────────────────────────────────────

export type RendicionCaja = {
  id_cierre: number;
  cod_empresa: number;
  fecha: string; // YYYY-MM-DD
  total_caja_anterior: number;
  total_venta: number;
  total_retiro: number;
  total_caja: number;
  total_pago: number | null;
  observacion: string | null;
};

export type RendicionCajaInput = {
  cod_empresa: number;
  fecha: string;
  total_caja_anterior: number;
  total_venta: number;
  total_retiro: number;
  total_caja: number;
  total_pago: number | null;
  observacion: string | null;
};

export type RendicionSugeridos = {
  total_caja_anterior: number;
  total_venta: number;
  total_pago: number;
};

export async function listarRendiciones(codEmpresa: number): Promise<RendicionCaja[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`rendiciones?${q}`);
  return (data.data ?? []) as RendicionCaja[];
}

export async function obtenerSugeridosRendicion(
  codEmpresa: number,
  fecha: string,
): Promise<RendicionSugeridos> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa), fecha });
  const data = await authFetch(`rendiciones/sugeridos?${q}`);
  return (data.data ?? {
    total_caja_anterior: 0,
    total_venta: 0,
    total_pago: 0,
  }) as RendicionSugeridos;
}

export async function crearRendicion(input: RendicionCajaInput): Promise<number> {
  const data = await authFetch("rendiciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_cierre as number;
}

export async function actualizarRendicion(id: number, input: RendicionCajaInput): Promise<void> {
  await authFetch(`rendiciones/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarRendicion(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`rendiciones/${id}?${q}`, { method: "DELETE" });
}

// ─── Cobros de Ventas (pág 65) ───────────────────────────────────────────────
// CRUD de VENTAS_COBROS. PK id_cobro (IDENTITY). La factura (id_factura) se elige
// con buscarVentas; forma/banco/moneda con listarFormasCobroPago/listarBancos/
// listarMonedas. Los campos *_forma / nombre_banco / descripcion_moneda /
// nombre_cliente / tip_comprobante / ser_timbrado / nro_comprobante vienen del
// JOIN (solo lectura). VENTAS_COBROS no tiene cod_empresa: se filtra por la factura.

export type VentaCobro = {
  id_cobro: number;
  fecha: string; // YYYY-MM-DD
  id_factura: number;
  id_forma: number;
  id_banco: number | null;
  nro_transaccion: string | null;
  observacion: string | null;
  total: number;
  cod_moneda: number;
  efectivo_recibido: number | null;
  efectivo_vuelto: number | null;
  tip_comprobante: string | null;
  ser_timbrado: string | null;
  nro_comprobante: number | null;
  nombre_cliente: string | null;
  descripcion_forma: string | null;
  nombre_banco: string | null;
  descripcion_moneda: string | null;
};

export type VentaCobroInput = {
  fecha: string;
  id_factura: number;
  id_forma: number;
  id_banco: number | null;
  nro_transaccion: string | null;
  observacion: string | null;
  total: number;
  cod_moneda: number;
  efectivo_recibido: number | null;
  efectivo_vuelto: number | null;
};

export type VentaBusqueda = {
  id_factura: number;
  nro_comprobante: number | null;
  ser_timbrado: string | null;
  tip_comprobante: string | null;
  fec_comprobante: string | null;
  nombre_cliente: string | null;
};

export async function listarVentasCobros(
  codEmpresa: number,
  idFactura?: number,
): Promise<VentaCobro[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (idFactura != null) q.set("id_factura", String(idFactura));
  const data = await authFetch(`ventas-cobros?${q}`);
  return (data.data ?? []) as VentaCobro[];
}

export async function crearVentaCobro(input: VentaCobroInput): Promise<number> {
  const data = await authFetch("ventas-cobros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_cobro as number;
}

export async function actualizarVentaCobro(id: number, input: VentaCobroInput): Promise<void> {
  await authFetch(`ventas-cobros/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarVentaCobro(id: number): Promise<void> {
  await authFetch(`ventas-cobros/${id}`, { method: "DELETE" });
}

export async function buscarVentas(codEmpresa: number, q: string): Promise<VentaBusqueda[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa), q });
  const data = await authFetch(`ventas/buscar?${params}`);
  return (data.data ?? []) as VentaBusqueda[];
}

// ─── Ventas (pág 60 grilla + 109 detalle) ────────────────────────────────────
// VENTAS_CABECERA: solo update/delete (las ventas se crean desde otro sistema).
// Sin filtros de fecha el back carga el último día con ventas (fecha_default).
// El detalle (VENTAS_DETALLE) es de solo lectura. Cobros de la factura:
// listarVentasCobros(codEmpresa, idFactura).

export type VentaCabecera = {
  id_factura: number;
  tip_comprobante: string;
  ser_timbrado: string | null;
  nro_timbrado: number | null;
  nro_comprobante: number;
  fec_comprobante: string; // YYYY-MM-DD
  cod_persona: number;
  nombre_cliente: string | null;
  cod_moneda: number | null;
  tip_cambio: number | null;
  estado: string | null;
  id_talonario: number | null;
  cod_vendedor: number;
  nombre_vendedor: string | null;
  nro_telefono: string | null;
};

export type VentaCabeceraInput = {
  cod_empresa: number;
  tip_comprobante: string;
  nro_comprobante: number;
  fec_comprobante: string;
  cod_persona: number;
  cod_vendedor: number;
  nro_telefono: string | null;
};

export type VentaDetalleLinea = {
  nro_linea: number;
  id_articulo: number;
  descripcion_articulo: string | null;
  cantidad: number | null;
  precio: number | null;
  cod_iva: number | null;
  descuento: number | null;
  total: number;
};

export type VentasListado = {
  fecha_default?: string;
  data: VentaCabecera[];
};

export async function listarVentas(
  codEmpresa: number,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<VentasListado> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (fechaDesde) q.set("fecha_desde", fechaDesde);
  if (fechaHasta) q.set("fecha_hasta", fechaHasta);
  const json = await authFetch(`ventas-cabecera?${q}`);
  return {
    fecha_default: json.fecha_default as string | undefined,
    data: (json.data ?? []) as VentaCabecera[],
  };
}

export async function actualizarVenta(id: number, input: VentaCabeceraInput): Promise<void> {
  await authFetch(`ventas-cabecera/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarVenta(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`ventas-cabecera/${id}?${q}`, { method: "DELETE" });
}

export async function listarVentaDetalle(idFactura: number): Promise<VentaDetalleLinea[]> {
  const data = await authFetch(`ventas-cabecera/${idFactura}/detalle`);
  return (data.data ?? []) as VentaDetalleLinea[];
}

// Upsert de línea del detalle: nro_linea null = insertar (el back numera max+1
// por factura y copia cod_iva del artículo); con nro_linea = actualizar.
export type VentaDetalleInput = {
  nro_linea: number | null;
  id_articulo: number;
  cantidad: number;
  precio: number;
  descuento: number | null;
};

export async function guardarVentaDetalle(
  idFactura: number,
  input: VentaDetalleInput,
): Promise<number> {
  const data = await authFetch(`ventas-cabecera/${idFactura}/detalle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.nro_linea as number;
}

export async function eliminarVentaDetalle(idFactura: number, nroLinea: number): Promise<void> {
  await authFetch(`ventas-cabecera/${idFactura}/detalle/${nroLinea}`, { method: "DELETE" });
}

// ─── Precios de Ventas (pág 34) ──────────────────────────────────────────────
// CRUD de PRECIOS_VENTAS (historial de precios por artículo). PK id_precio
// (IDENTITY). fecha la asigna un trigger de BD (BEFORE INSERT); no se envía.
// El artículo se elige con buscarArticulos; la factura de compra que originó
// el precio (opcional) con buscarCompras. nro_linea es un número libre.
// Un trigger de BD (AFTER INSERT) sincroniza articulos.precio_venta con el
// último precio insertado; el backend resincroniza también en update/delete.

export type PrecioVenta = {
  id_precio: number;
  id_articulo: number;
  descripcion_articulo: string | null;
  porc_recargo: number | null;
  fecha: string; // ISO con hora
  precio_compra: number | null;
  precio_venta: number;
  cod_empresa: number;
  nro_linea: number | null;
  id_factura: number | null;
  margen: number | null;
  rubro: string | null;
  marca: string | null;
  codigo_oem: string | null;
};

// Sugeridos al elegir artículo (replica los Dynamic Actions de la pág APEX 35).
export type PrecioSugerido = {
  precio_compra: number | null;
  nro_linea: number | null;
  porc_recargo: number | null;
  precio_venta: number | null;
  precio_venta_anterior: number | null;
};

// Artículo de la LOV cascada de precios (con o sin factura de compra).
export type ArticuloPrecioLov = {
  id_articulo: number;
  descripcion: string | null;
  codigo_oem: string | null;
};

export type PrecioVentaInput = {
  id_articulo: number;
  porc_recargo: number | null;
  precio_compra: number | null;
  precio_venta: number;
  cod_empresa: number;
  nro_linea: number | null;
  id_factura: number | null;
};

export async function listarPreciosVentas(
  codEmpresa: number,
  idArticulo?: number,
): Promise<PrecioVenta[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (idArticulo != null) q.set("id_articulo", String(idArticulo));
  const data = await authFetch(`precios-ventas?${q}`);
  return (data.data ?? []) as PrecioVenta[];
}

export async function crearPrecioVenta(input: PrecioVentaInput): Promise<number> {
  const data = await authFetch("precios-ventas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_precio as number;
}

export async function actualizarPrecioVenta(id: number, input: PrecioVentaInput): Promise<void> {
  await authFetch(`precios-ventas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function eliminarPrecioVenta(id: number, codEmpresa: number): Promise<void> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  await authFetch(`precios-ventas/${id}?${q}`, { method: "DELETE" });
}

// Al elegir artículo: precio de compra, nro línea, % recargo (del rubro),
// precio de venta sugerido y precio de venta anterior. id_factura opcional.
export async function sugerirPrecio(
  codEmpresa: number,
  idArticulo: number,
  idFactura?: number | null,
): Promise<PrecioSugerido> {
  const q = new URLSearchParams({
    cod_empresa: String(codEmpresa),
    id_articulo: String(idArticulo),
  });
  if (idFactura != null) q.set("id_factura", String(idFactura));
  const data = await authFetch(`precios-ventas/sugerir?${q}`);
  return (data.data ?? {
    precio_compra: null,
    nro_linea: null,
    porc_recargo: null,
    precio_venta: null,
    precio_venta_anterior: null,
  }) as PrecioSugerido;
}

// LOV cascada de artículos: si hay factura, los de esa compra sin precio aún;
// si no, los artículos activos. Alimenta el BuscadorSelect del formulario.
export async function articulosParaPrecio(
  codEmpresa: number,
  q: string,
  idFactura?: number | null,
): Promise<ArticuloPrecioLov[]> {
  const params = new URLSearchParams({ cod_empresa: String(codEmpresa), q });
  if (idFactura != null) params.set("id_factura", String(idFactura));
  const data = await authFetch(`precios-ventas/articulos?${params}`);
  return (data.data ?? []) as ArticuloPrecioLov[];
}

// ─── Acreditación de cobros (pág 111) ────────────────────────────────────────
// Cobros bancarios (cheques/transferencias) aún sin acreditar. Al acreditar se
// setea ind_acreditado='S' y monto_acreditado en VENTAS_COBROS. fecha_cobro es
// texto (viene de V_COBROS_CLIENTES).

export type CobroPorAcreditar = {
  id_cobro: number;
  fecha_cobro: string | null;
  desc_forma: string | null;
  total: number;
};

export async function listarCobrosPorAcreditar(
  codEmpresa: number,
): Promise<CobroPorAcreditar[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`cobros-acreditar?${q}`);
  return (data.data ?? []) as CobroPorAcreditar[];
}

export async function acreditarCobro(idCobro: number, montoAcreditado: number): Promise<void> {
  await authFetch(`cobros-acreditar/${idCobro}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monto_acreditado: montoAcreditado }),
  });
}

// ─── Compras por Artículos (pág 55) ──────────────────────────────────────────
// Reporte de solo lectura de COMPRAS_ARTICULOS. El backend devuelve todo el
// dataset (WHERE cod_empresa, tip_comprobante != 'AJS') y el filtrado (búsqueda
// + facetas) es 100% en el front, como articulos-mas-vendidos.

export type CompraArticulo = {
  id_articulo: number;
  descripcion: string | null;
  codigo_oem: string | null;
  id_cod_proveedor: string | null;
  proveedor: string | null;
  referencia: string | null;
  fec_comprobante: string | null; // YYYY-MM-DD
  cantidad: number | null;
  precio: number | null;
  total: number | null;
  id_factura: number;
  nro_linea: number | null;
};

export async function listarComprasArticulos(codEmpresa: number): Promise<CompraArticulo[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`compras/articulos?${q}`);
  return (data.data ?? []) as CompraArticulo[];
}

// ─── Ficha de Artículos (pág 56) ─────────────────────────────────────────────
// Reporte de solo lectura de V_FICHA_EXISTENCIA (movimientos por artículo). El
// backend devuelve todo el dataset (WHERE cod_empresa) y el filtrado (búsqueda
// + facetas) es 100% en el front, como compras-articulos.

export type FichaExistencia = {
  cod_empresa: number;
  fec_comprobante: string | null; // YYYY-MM-DD
  id_articulo: number;
  desc_articulo: string | null;
  cantidad: number | null;
  tipo: string | null;
  fecha: string | null;
  nro_comprobante: number | null;
  desc_rubro: string | null;
  codigo_oem: string | null;
  es_activo: string | null;
};

export async function listarFichaExistencia(codEmpresa: number): Promise<FichaExistencia[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`ficha/existencia?${q}`);
  return (data.data ?? []) as FichaExistencia[];
}

// ─── Artículos sin Código de Barra (pág 57) ──────────────────────────────────
// Reporte de solo lectura: artículos activos con existencia y sin código de
// barra. Filtrado (búsqueda + faceta Rubro) 100% en el front.

export type ArticuloSinBarra = {
  id_articulo: number;
  descripcion: string | null;
  id_rubro: number | null;
  desc_rubro: string | null;
};

export async function listarArticulosSinBarra(codEmpresa: number): Promise<ArticuloSinBarra[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`articulos/sin-barra?${q}`);
  return (data.data ?? []) as ArticuloSinBarra[];
}

// ─── Consulta de Precios (pág 61) ────────────────────────────────────────────
// Busca un artículo por su código de barra (pistola lectora en mostrador) y
// devuelve su ficha: precio de venta, existencia, marca, rubro, viscosidad.
// data = null si el código no existe o el artículo no está activo.

export type FichaPrecio = {
  id_articulo: number;
  descripcion: string | null;
  marca: string | null;
  rubro: string | null;
  viscosidad: string | null;
  precio_venta: number | null;
  existencia: number | null;
  tiene_imagen: number;
};

export async function consultarPrecio(
  codEmpresa: number,
  codBarra: string,
): Promise<FichaPrecio | null> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa), cod_barra: codBarra });
  const data = await authFetch(`consulta-precios?${q}`);
  return (data.data ?? null) as FichaPrecio | null;
}

// ─── Existencia de Artículos (pág 70) ────────────────────────────────────────
// Existencia agrupada por artículo (SUM de cantidad) + costo. costo_ultimo y
// total_costo solo vienen si el usuario ve costos (JOSEG); ve_costo lo indica.
// Filtrado (búsqueda + facetas) 100% en el front.

export type ExistenciaArticulo = {
  id_articulo: number;
  desc_articulo: string | null;
  cantidad: number | null;
  codigo_oem: string | null;
  es_activo: string | null;
  costo_ultimo?: number | null;
  total_costo?: number | null;
};

export type ExistenciaListado = {
  ve_costo: boolean;
  filas: ExistenciaArticulo[];
};

export async function listarExistencia(
  codEmpresa: number,
  appUser: string,
): Promise<ExistenciaListado> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa), app_user: appUser });
  const json = await authFetch(`existencia?${q}`);
  return {
    ve_costo: json.ve_costo === "S",
    filas: (json.data ?? []) as ExistenciaArticulo[],
  };
}

// ─── Compras Vs Ventas (pág 75) ──────────────────────────────────────────────
// Dos datasets (compras/ventas) del año; el front filtra por mes/activo (facetas)
// y calcula la ganancia = SUM(rentabilidad ventas) − SUM(total compras).

export type CompraVsFila = {
  id_articulo: number | null;
  referencia: string | null;
  proveedor: string | null;
  fec_comprobante: string | null; // YYYY-MM-DD
  descripcion: string | null;
  cantidad: number | null;
  precio: number | null;
  total: number | null;
  es_activo: string | null;
};

export type VentaVsFila = {
  id_articulo: number | null;
  descripcion: string | null;
  fec_comprobante: string | null; // YYYY-MM-DD
  costo_ultimo: number | null;
  rentabilidad: number | null;
  cantidad: number | null;
  precio: number | null;
  total: number | null;
  total_costo: number | null;
};

export type ComprasVsVentas = {
  anio: string;
  anios: string[];
  compras: CompraVsFila[];
  ventas: VentaVsFila[];
};

export async function comprasVsVentas(
  codEmpresa: number,
  anio?: string,
): Promise<ComprasVsVentas> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (anio) q.set("anio", anio);
  const json = await authFetch(`compras-vs-ventas?${q}`);
  return {
    anio: (json.anio ?? "") as string,
    anios: (json.anios ?? []) as string[],
    compras: (json.compras ?? []) as CompraVsFila[],
    ventas: (json.ventas ?? []) as VentaVsFila[],
  };
}

// ─── Saldos de Proveedores (pág 79) ──────────────────────────────────────────
// Reporte de solo lectura: facturas de compra (FCR) + pagos, con saldo por
// factura (S/N) y próxima fecha de pago. Filtrado (búsqueda + facetas) en el
// front. Saldo total pendiente = SUM(total_factura) − SUM(total_pago).

export type SaldoProveedor = {
  nro_factura: string | null;
  fec_comprobante: string | null; // YYYY-MM-DD
  nombre: string | null;
  total_factura: number | null;
  fec_pago: string | null; // YYYY-MM-DD
  fec_proximo_pago: string | null; // YYYY-MM-DD
  forma_pago: string | null;
  total_pago: number | null;
  id_factura: number;
  saldo: string | null; // 'S' | 'N'
};

export async function listarSaldosProveedores(codEmpresa: number): Promise<SaldoProveedor[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`saldos-proveedores?${q}`);
  return (data.data ?? []) as SaldoProveedor[];
}

// ─── Consulta de Inventarios (pág 80) ────────────────────────────────────────
// Último inventario por artículo: cantidad física vs sistema + diferencia.
// Filtrado (búsqueda + facetas) en el front. Imagen por artículo.

export type Inventario = {
  id_inventario: number;
  id_articulo: number;
  descripcion: string | null;
  codigo_oem: string | null;
  fecha: string | null; // YYYY-MM-DD
  cantidad_fisica: number | null;
  cantidad_sistema: number | null;
  diferencia: number | null;
  con_diferencia: string | null; // 'Si' | 'No'
  cerrado: string | null; // 'S' | 'N'
  es_activo: string | null;
  rubro: string | null;
  marca: string | null;
};

export async function listarInventarios(codEmpresa: number): Promise<Inventario[]> {
  const q = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`inventarios?${q}`);
  return (data.data ?? []) as Inventario[];
}

// ─── Punto de Venta (pág 39/40/45/47) ────────────────────────────────────────
// Grilla de artículos con stock + carrito en React + registro atómico (los 3
// INSERT en una transacción). Reemplaza las apex_collections del APEX.

export type ArticuloPOS = {
  id_articulo: number;
  descripcion: string | null;
  id_rubro: number | null;
  id_marca: number | null;
  rubro: string | null;
  marca: string | null;
  codigo_oem: string | null;
  precio_venta: number | null;
  precio_con_descuento: number | null;
};

// Trae todos los artículos con stock; el filtrado por facetas (rubro/marca) y
// búsqueda es en el front. El descuento sí va al backend (afecta el precio).
export async function listarArticulosPOS(
  codEmpresa: number,
  opts: { descuento?: number } = {},
): Promise<ArticuloPOS[]> {
  const p = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  if (opts.descuento) p.set("descuento", String(opts.descuento));
  const data = await authFetch(`pos/articulos?${p}`);
  return (data.data ?? []) as ArticuloPOS[];
}

export async function buscarArticuloPorBarra(
  codEmpresa: number,
  codBarra: string,
): Promise<{ id_articulo: number; descripcion: string | null; precio_venta: number | null } | null> {
  const p = new URLSearchParams({ cod_empresa: String(codEmpresa), cod_barra: codBarra });
  const data = await authFetch(`pos/barra?${p}`);
  return (data.data ?? null) as {
    id_articulo: number;
    descripcion: string | null;
    precio_venta: number | null;
  } | null;
}

// Buscador de clientes (ind_cliente_proveedor='C') para el modal de facturación
// del POS (LOV PERSONAS.CLIENTES del APEX). Mismo shape que ProveedorBusqueda.
export async function buscarClientesPOS(
  codEmpresa: number,
  q: string,
): Promise<ProveedorBusqueda[]> {
  const p = new URLSearchParams({ cod_empresa: String(codEmpresa), q });
  const data = await authFetch(`pos/clientes?${p}`);
  return (data.data ?? []) as ProveedorBusqueda[];
}

export async function siguienteNroComprobante(
  codEmpresa: number,
  serTimbrado: string,
): Promise<number> {
  const p = new URLSearchParams({ cod_empresa: String(codEmpresa), ser_timbrado: serTimbrado });
  const data = await authFetch(`pos/siguiente-nro?${p}`);
  return (data.nro_comprobante ?? 1) as number;
}

export type VentaPOSInput = {
  cabecera: {
    tip_comprobante: string;
    ser_timbrado: string;
    nro_timbrado: number | null;
    nro_comprobante: number;
    cod_persona: number;
    cod_moneda: number;
    tip_cambio: number;
    id_talonario: number | null;
    cod_vendedor: number;
    nro_voucher: number | null;
    nro_telefono: string | null;
    modelo_vehiculo: string | null;
  };
  detalle: {
    id_articulo: number;
    cantidad: number;
    precio: number;
    descuento: number | null;
    precio_lista: number | null;
  }[];
  cobros: {
    id_forma: number;
    id_banco: number | null;
    nro_transaccion: string | null;
    observacion: string | null;
    total: number;
    cod_moneda: number;
    efectivo_recibido: number | null;
    efectivo_vuelto: number | null;
  }[];
};

export async function registrarVentaPOS(
  codEmpresa: number,
  input: VentaPOSInput,
): Promise<number> {
  const p = new URLSearchParams({ cod_empresa: String(codEmpresa) });
  const data = await authFetch(`pos/registrar?${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.id_factura as number;
}
