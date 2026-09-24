import "@/styles.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreciosVentasView } from "@/components/precios-ventas-view";

const qs = new URLSearchParams(location.search);
if (qs.get("tema") === "dark") document.documentElement.classList.add("dark");
const ancho = qs.get("ancho") ?? "1500";

// Captura el PDF en el DOM (para --dump-dom) en vez de abrir una pestaña.
window.open = ((url: string) => {
  fetch(url).then((res) => res.arrayBuffer()).then((buf) => {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const pre = document.createElement("pre");
    pre.id = "pdf-b64";
    pre.textContent = btoa(s);
    document.body.appendChild(pre);
  });
  return {} as Window;
}) as typeof window.open;

function clickCuando(texto: string, luego?: () => void, intentos = 200) {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === texto);
  if (b && !b.hasAttribute("disabled")) { b.click(); luego?.(); return; }
  if (intentos > 0) setTimeout(() => clickCuando(texto, luego, intentos - 1), 50);
}
// Radix Tabs se activa con mousedown, no con click.
function tabCuando(texto: string, luego?: () => void, intentos = 200) {
  const b = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent?.trim() === texto) as HTMLElement | undefined;
  if (b) { b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); luego?.(); return; }
  if (intentos > 0) setTimeout(() => tabCuando(texto, luego, intentos - 1), 50);
}

createRoot(document.getElementById("app")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <div style={{ padding: 16, maxWidth: Number(ancho), background: "var(--background)" }}>
      <PreciosVentasView />
    </div>
  </QueryClientProvider>,
);
if (qs.get("tab") !== "precios") {
  tabCuando("Evolución", () => { if (qs.get("pdf")) setTimeout(() => clickCuando("PDF"), 800); });
}
