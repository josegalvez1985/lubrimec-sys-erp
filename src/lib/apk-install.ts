import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";

// Descarga el APK dentro de la app y lanza el instalador de Android directamente.
// El WebView de Capacitor NO maneja descargas (un <a href> a un .apk no hace nada),
// por eso dentro del APK siempre se usa este flujo. Requiere el permiso
// REQUEST_INSTALL_PACKAGES en el manifest; Android igual pide confirmar la instalación.
export async function descargarEInstalarApk(url: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Descarga falló: HTTP ${res.status}`);
  const blob = await res.blob();
  // Filesystem.writeFile necesita el binario como base64.
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = () => reject(new Error("No se pudo leer el APK descargado"));
    r.readAsDataURL(blob);
  });
  const escrito = await Filesystem.writeFile({
    path: "lubrimesys.apk",
    data: base64,
    directory: Directory.Cache, // cubierto por cache-path en file_paths.xml (FileProvider)
  });
  await FileOpener.open({
    filePath: escrito.uri,
    contentType: "application/vnd.android.package-archive",
  });
}
