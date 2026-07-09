// Puente entre el buscador global del header y las vistas destino: el header
// deja aquí el texto a pre-buscar antes de navegar (setBusquedaInicial) y la
// vista lo consume UNA vez al montar (consumirBusquedaInicial) para
// inicializar el search de su DataTable. En memoria (no persiste).

const pendientes = new Map<number, string>();

export function setBusquedaInicial(pageId: number, texto: string) {
  pendientes.set(pageId, texto);
}

export function consumirBusquedaInicial(pageId: number): string | null {
  const t = pendientes.get(pageId) ?? null;
  // Borra en el próximo tick: el doble montaje de StrictMode (dev) lee dos
  // veces en el mismo tick y ambas deben ver el valor.
  if (t !== null) setTimeout(() => pendientes.delete(pageId), 0);
  return t;
}
