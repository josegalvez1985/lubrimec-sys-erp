/**
 * El asistente con IA: un chat en un botón flotante, en todas las pantallas con
 * sesión. Contrato del backend: `db/ia_asistente_sql.sql` (`ia/preguntar`).
 *
 * La IA corre en Oracle (`PKG_IA_LUBRIMEC`, que llama a la API de Claude): acá
 * solo se manda la pregunta con lo que el backend no sabe —la conversación, la
 * pantalla abierta y el manual— y se muestra la respuesta.
 *
 * - **Quién lo ve:** todos los que entran. No depende de Roles de Páginas ni es
 *   una pantalla del menú; el gasto lo frena el límite de preguntas por día del
 *   backend.
 * - **La conversación vive solo en memoria y dura lo que la sesión**: va atada
 *   al token, así que recargar, salir o entrar con otro usuario la borra. Puede
 *   traer datos de cualquier tabla; no se escribe en el disco.
 * - **El manual es el README** (la sección "Páginas implementadas", sin nombres
 *   técnicos): así la IA sabe de cada pantalla nueva con el deploy, sin volver a
 *   correr el `.sql`. Se descarga recién al abrir el chat.
 * - **Solo lee y nunca expone la base** (nombres de tablas, columnas, SQL): lo
 *   garantiza el backend; este lado tampoco recibe el SQL que corrió la IA.
 */

import { useSyncExternalStore } from "react";

import { getSesion, preguntarAsistente } from "@/lib/api";

export type MensajeIA = {
  id: string;
  rol: "usuario" | "asistente";
  texto: string;
  /** Un fallo (sin respuesta): no se le manda a la IA como historial. */
  error?: boolean;
};

type Estado = {
  /**
   * De qué sesión es: el token, que cambia en cada login. Con otro, la
   * conversación arranca de cero.
   */
  sesion: string;
  mensajes: MensajeIA[];
  /** Esperando la respuesta (puede tardar: la IA corre consultas). */
  pendiente: boolean;
  usadasHoy: number | null;
  limite: number | null;
  /**
   * El panel abierto. Acá y no en el componente: en la computadora el panel
   * sigue abierto al cambiar de página (para preguntar por la pantalla nueva).
   */
  abierto: boolean;
};

const VACIO: Omit<Estado, "sesion"> = {
  mensajes: [],
  pendiente: false,
  usadasHoy: null,
  limite: null,
  abierto: false,
};

/* -------------------------------------------------------------------------- */
/* La conversación: un store de módulo                                         */
/* -------------------------------------------------------------------------- */

/*
 * De módulo y no en un componente: el chat sobrevive a la navegación y una
 * respuesta que llega con el panel cerrado no se pierde.
 */
let estado: Estado = { sesion: "", ...VACIO };
const oyentes = new Set<() => void>();

function fijar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  oyentes.forEach((f) => f());
}

const tokenActual = () => getSesion()?.token ?? "";

/** La conversación de esta sesión (la de una anterior, si quedó, se descarta). */
function actual(): Estado {
  const sesion = tokenActual();
  if (estado.sesion !== sesion) estado = { sesion, ...VACIO };
  return estado;
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function useAsistente() {
  return useSyncExternalStore(suscribir, actual, actual);
}

export function abrirAsistente(abierto: boolean) {
  actual();
  fijar({ abierto });
}

export function nuevaConversacion() {
  if (actual().pendiente) return;
  fijar({ mensajes: [] });
}

let secuencia = 0;
const nuevoId = () => `m${Date.now()}-${++secuencia}`;

/** Cuántos mensajes previos viajan como contexto (el backend corta en 12). */
const HISTORIAL = 12;

/**
 * Manda una pregunta y agrega la respuesta (o el error) a la conversación.
 * `pantalla`: la que está abierta, para "¿cómo uso esta pantalla?".
 */
export async function preguntar(texto: string, pantalla: string | null) {
  const pregunta = texto.trim();
  const previo = actual();
  if (!pregunta || previo.pendiente) return;

  const historial = previo.mensajes
    .filter((m) => !m.error)
    .slice(-HISTORIAL)
    .map((m) => ({ rol: m.rol, texto: m.texto }));

  fijar({
    mensajes: [...previo.mensajes, { id: nuevoId(), rol: "usuario", texto: pregunta }],
    pendiente: true,
  });

  try {
    const r = await preguntarAsistente({
      pregunta,
      historial,
      manual: await cargarManual(),
      pantalla,
      nombre: getSesion()?.usuario ?? "",
    });
    agregar({ id: nuevoId(), rol: "asistente", texto: r.respuesta });
    fijar({ usadasHoy: r.usadas_hoy, limite: r.limite });
  } catch (e) {
    agregar({
      id: nuevoId(),
      rol: "asistente",
      texto: e instanceof Error ? e.message : "No se pudo obtener la respuesta.",
      error: true,
    });
  } finally {
    fijar({ pendiente: false });
  }
}

/** Agrega al final, salvo que la sesión haya cambiado mientras se esperaba. */
function agregar(m: MensajeIA) {
  if (estado.sesion !== tokenActual()) return;
  fijar({ mensajes: [...estado.mensajes, m] });
}

/** Vuelve a mandar la última pregunta que falló. */
export function reintentar(pantalla: string | null) {
  const { mensajes, pendiente } = actual();
  const ultimo = mensajes[mensajes.length - 1];
  const pregunta = mensajes[mensajes.length - 2];
  if (pendiente || !ultimo?.error || pregunta?.rol !== "usuario") return;
  fijar({ mensajes: mensajes.slice(0, -2) });
  void preguntar(pregunta.texto, pantalla);
}

/* -------------------------------------------------------------------------- */
/* El manual                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lo básico de usar el sistema que el README no dice (o dice para el
 * programador). Va antes de las secciones del README.
 */
const GUIA_BASICA = `## Lo básico

- Se entra con el usuario y la contraseña del sistema. El check "Mantener sesión iniciada" deja la sesión abierta aunque se cierre el navegador; sin él, se cierra al cerrar el navegador.
- La sesión dura 6 horas; después hay que volver a entrar. Si a un usuario lo bloquean, se le corta la sesión en el momento.
- En la computadora el menú lateral arranca oculto: se muestra con el botón de arriba a la izquierda. Está agrupado por categoría; las páginas que aparecen más apagadas todavía no están disponibles en este sistema.
- En el celular (y en la app de Android, que es el mismo sitio) el menú se abre con el botón ☰ de arriba a la izquierda. En la app, el botón atrás del teléfono cierra lo que esté abierto y vuelve a la pantalla anterior.
- Arriba está el buscador de artículos y clientes. La casita vuelve al Inicio (el panel con cobros y ventas del día). El menú del usuario, arriba a la derecha, tiene Perfil (tema claro u oscuro y, en la app, el ingreso con huella) y Cerrar sesión.
- Cada usuario ve solo las páginas que tiene habilitadas. Si falta una, hay que pedírsela a quien administra los permisos (Roles de Páginas).
- Este asistente se abre con el botón redondo de abajo a la derecha; recuerda la conversación hasta que se recarga la página.`;

let manual: Promise<string> | null = null;

/**
 * El manual, una vez por carga del sitio. `README.md?raw` NO es el README
 * entero: el plugin de `vite.config.ts` lo recorta a las pantallas y le saca los
 * nombres de la base y del código en el build (`lib/manual-asistente.ts`).
 * Import dinámico: no pesa en el bundle de nadie que no abra el chat.
 */
export function cargarManual(): Promise<string> {
  manual ??= import("../../README.md?raw")
    .then((m) => [GUIA_BASICA, m.default].filter(Boolean).join("\n\n"))
    .catch(() => GUIA_BASICA);
  return manual;
}
