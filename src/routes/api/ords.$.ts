import { createFileRoute } from "@tanstack/react-router";

// Proxy server-side hacia ORDS (evita CORS del navegador).
const ORDS_TARGET = process.env.ORDS_TARGET ?? "https://oracleapex.com";
const ORDS_PREFIX = "/ords/josegalvez/lubrimec/";

async function forward(request: Request, splat: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${ORDS_TARGET}${ORDS_PREFIX}${splat}${incoming.search}`;

  const headers = new Headers();
  // Reenvía solo lo necesario; deja que fetch fije Host/Content-Length.
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  headers.set("accept", "application/json");
  headers.set("user-agent", "Mozilla/5.0 (lubrimec-proxy)");

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    // ArrayBuffer y no text(): los uploads binarios (foto de inventario) se
    // corrompen si se decodifican como UTF-8; para JSON da igual.
    const body = await request.arrayBuffer();
    // Solo reenvía cuerpo + content-type si realmente hay payload; un DELETE sin
    // body con content-type JSON hace que ORDS responda 400 ("Expected {,[ but got EOF").
    if (body.byteLength > 0) {
      init.body = body;
      headers.set("content-type", request.headers.get("content-type") ?? "application/json");
    }
  }

  const res = await fetch(target, init);
  const contentType = res.headers.get("content-type") ?? "application/json";
  // Binarios (imágenes, etc.): reenviar los bytes crudos. Usar res.text() los corrompe
  // (decodifica como UTF-8). El JSON de la API sí es texto, pero ArrayBuffer sirve para ambos.
  const body = await res.arrayBuffer();
  const outHeaders: Record<string, string> = { "content-type": contentType };
  const cacheControl = res.headers.get("cache-control");
  if (cacheControl) outHeaders["cache-control"] = cacheControl;
  return new Response(body, { status: res.status, headers: outHeaders });
}

export const Route = createFileRoute("/api/ords/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => forward(request, params._splat ?? ""),
      POST: ({ request, params }) => forward(request, params._splat ?? ""),
      PUT: ({ request, params }) => forward(request, params._splat ?? ""),
      DELETE: ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
