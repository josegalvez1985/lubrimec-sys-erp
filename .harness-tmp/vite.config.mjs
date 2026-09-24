import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
const raiz = path.resolve(import.meta.dirname, "..");
export default defineConfig({
  root: import.meta.dirname,
  publicDir: path.join(raiz, "public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/lib/api", replacement: path.join(import.meta.dirname, "mock-api.ts") },
      { find: "@", replacement: path.join(raiz, "src") },
    ],
  },
  server: { port: 5199, strictPort: true },
});
