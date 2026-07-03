import { createFileRoute } from "@tanstack/react-router";

// Proxy server-side para imágenes binarias del módulo ORDS "paginaweb"
// (evita CORS y reenvía el binario tal cual, sin forzar JSON). Endpoint público:
// GET /api/img/articulosimg/:id  →  .../ords/josegalvez/paginaweb/articulosimg/:id
const ORDS_TARGET = process.env.ORDS_TARGET ?? "https://oracleapex.com";
const ORDS_PREFIX = "/ords/josegalvez/paginaweb/";

async function forward(request: Request, splat: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${ORDS_TARGET}${ORDS_PREFIX}${splat}${incoming.search}`;

  const res = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0 (lubrimec-proxy)" },
  });
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/img/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
