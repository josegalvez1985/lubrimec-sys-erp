import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import type { Plugin } from "vite";
import { manualParaAsistente } from "./src/lib/manual-asistente";

// El manual del asistente: `README.md?raw` llega al bundle ya recortado y sin
// nombres de la base ni del código (ver src/lib/manual-asistente.ts).
function manualAsistente(): Plugin {
  return {
    name: "manual-asistente",
    transform(code, id) {
      if (!/README\.md\?raw$/.test(id)) return;
      const m = /^export default ([\s\S]*?);?\s*$/.exec(code.trim());
      if (!m) return;
      return `export default ${JSON.stringify(manualParaAsistente(JSON.parse(m[1])))};`;
    },
  };
}

// Base path: "/lubrimec-sys-erp/" en GitHub Pages, "/" en local.
const BASE = process.env.GITHUB_PAGES === "true" ? "/lubrimec-sys-erp/" : "/";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    base: BASE,
    define,
    css: { transformer: "lightningcss" },
    resolve: {
      // Resolución nativa de los "paths" del tsconfig (reemplaza al plugin
      // vite-tsconfig-paths, soportado de forma nativa desde Vite 7).
      tsconfigPaths: true,
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    // strictPort: si 8080 está ocupado, falla en vez de saltar a otro puerto
    // (evita la confusión de "el navegador va a 5173 pero el server quedó en 5174").
    // open: abre solo el navegador por defecto al arrancar `npm run dev`.
    server: { host: "::", port: 8080, strictPort: true, open: true },
    plugins: [
      manualAsistente(),
      tailwindcss(),
      tanstackStart({ server: { entry: "server" }, spa: { enabled: true } }),
      nitro(),
      viteReact(),
    ],
  };
});
