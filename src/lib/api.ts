const BASE = import.meta.env.VITE_API_URL ?? "";
const DEFAULT_APP_ID = import.meta.env.VITE_APP_ID ?? "86972";

function url(path: string) {
  return `${BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
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

export async function login(
  usuario: string,
  password: string,
  recordar = false,
): Promise<Sesion> {
  const res = await fetch(url("auth/login"), {
    method: "POST",
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
    app_user: String(data.app_user ?? usuario),
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
};

export async function getMenuPaginas(): Promise<PaginaMenu[]> {
  const s = getSesion();
  if (!s) throw new Error("No hay sesión activa");
  const q = new URLSearchParams({ app_id: s.app_id, app_user: s.app_user });
  const url_final = `${url("menu/paginas")}?${q}`;
  console.log("[api] menu/paginas request:", url_final, "token:", s.token.slice(0, 16), "app_id:", s.app_id, "app_user:", s.app_user);
  const res = await fetch(url_final, {
    headers: { Authorization: `Bearer ${s.token}` },
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Sesión expirada");
  }

  const data = await res.json().catch(() => ({}));
  console.log("[api] menu/paginas response: status", res.status, "success:", data?.success, "message:", data?.message, "data count:", data?.data?.length);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message ?? "No se pudieron cargar las páginas");
  }
  return (data.data ?? []) as PaginaMenu[];
}
