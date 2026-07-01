import type { CapacitorConfig } from "@capacitor/cli";

// APK Android (WebView) de Lubrimesys. Carga remota: el WebView abre la app publicada
// en GitHub Pages (server.url), así el APK siempre muestra la última versión sin
// tener que regenerarlo en cada cambio. Ver GENERAR_APK.md.
const config: CapacitorConfig = {
  appId: "com.lubrimec.sys",
  appName: "Lubrimesys",
  // webDir solo debe existir para `cap sync`; el contenido real vive en server.url.
  webDir: "capacitor-www",
  server: {
    url: "https://josegalvez1985.github.io/lubrimec-sys-erp/",
    cleartext: false,
  },
};

export default config;
