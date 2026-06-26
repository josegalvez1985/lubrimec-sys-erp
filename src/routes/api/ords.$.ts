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
    init.body = await request.text();
    headers.set("content-type", request.headers.get("content-type") ?? "application/json");
  }

  const res = await fetch(target, init);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export const Route = createFileRoute("/api/ords/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => forward(request, params._splat ?? ""),
      POST: ({ request, params }) => forward(request, params._splat ?? ""),
    },
  },
});
