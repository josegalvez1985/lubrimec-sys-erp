import { createFileRoute } from "@tanstack/react-router";

// Proxy server-side para imágenes binarias del módulo ORDS "paginaweb"
// (evita CORS y reenvía el binario tal cual, sin forzar JSON). Endpoint público:
// GET /api/img/articulosimg/:id  →  .../ords/josegalvez/paginaweb/articulosimg/:id
const ORDS_TARGET = process.env.ORDS_TARGET ?? "https://oracleapex.com";
const ORDS_PREFIX = "/ords/josegalvez/paginaweb/";

// ORDS/Oracle responde intermitentemente lento o con 404/5xx transitorios: sin
// timeout el fetch se cuelga y el <img> queda cargando para siempre. Cortamos a
// los 15s y reintentamos ante fallo (timeout, error de red o status de fallo).
const TIMEOUT_MS = 15_000;
const MAX_INTENTOS = 3;

// ORDS devuelve 404 tanto cuando el artículo no tiene imagen como, bajo carga, de
// forma transitoria para imágenes que SÍ existen (verificado en 197/264). Por eso
// reintentamos también el 404: si tras todos los intentos sigue 404, se asume que
// realmente no hay imagen y se devuelve tal cual.
function esFallo(status: number): boolean {
  return status === 404 || status >= 500;
}

async function pedirImagen(target: string): Promise<Response> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(target, {
        headers: { "user-agent": "Mozilla/5.0 (lubrimec-proxy)" },
        signal: ctrl.signal,
      });
      if (esFallo(res.status) && intento < MAX_INTENTOS) continue;
      return res;
    } catch (err) {
      ultimoError = err; // timeout (abort) o error de red → reintentar
    } finally {
      clearTimeout(t);
    }
  }
  throw ultimoError;
}

async function forward(request: Request, splat: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${ORDS_TARGET}${ORDS_PREFIX}${splat}${incoming.search}`;

  try {
    const res = await pedirImagen(target);
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    // Timeout o error de red tras los reintentos: 504 para que el <img> falle
    // rápido y muestre "Sin imagen disponible" en vez de girar indefinidamente.
    return new Response("Gateway Timeout", {
      status: 504,
      headers: { "cache-control": "no-store" },
    });
  }
}

export const Route = createFileRoute("/api/img/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
