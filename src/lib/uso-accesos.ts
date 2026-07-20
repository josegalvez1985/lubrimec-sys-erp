// Registro LOCAL (por dispositivo) de cuántas veces el usuario abre cada acceso
// rápido. Se usa para ordenar "Accesos rápidos" por los más utilizados, por encima
// de la estadística del backend (estadistica_user). No sale del navegador.
//
// Clave por página: `${application_id}-${page_id}` (igual que el key del render).

const LS_KEY = "quick_actions_uso";

export type UsoAccesos = Record<string, number>;

export function claveAcceso(applicationId: number, pageId: number): string {
  return `${applicationId}-${pageId}`;
}

// Lee el mapa de conteos. Tolera JSON corrupto o storage no disponible (SSR/APK).
export function leerUsoAccesos(): UsoAccesos {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      // Nos quedamos solo con los valores numéricos (defensa ante datos viejos).
      const limpio: UsoAccesos = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) limpio[k] = v;
      }
      return limpio;
    }
    return {};
  } catch {
    return {};
  }
}

// Suma 1 al contador de una página y persiste. Devuelve el mapa actualizado para
// que el llamador refresque su estado sin volver a leer el storage.
export function registrarUsoAcceso(applicationId: number, pageId: number): UsoAccesos {
  const actual = leerUsoAccesos();
  const clave = claveAcceso(applicationId, pageId);
  const siguiente: UsoAccesos = { ...actual, [clave]: (actual[clave] ?? 0) + 1 };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(siguiente));
  } catch {
    // storage lleno o bloqueado: el orden simplemente no persiste, no es crítico.
  }
  return siguiente;
}
