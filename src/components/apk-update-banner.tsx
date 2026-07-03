import { useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { useApkUpdate } from "@/hooks/use-apk-update";
import { ApkInstallGuide } from "@/components/apk-install-guide";
import { descargarEInstalarApk } from "@/lib/apk-install";

// Banner de "nueva versión disponible" dentro del APK. Aparece solo si el APK
// instalado es anterior a la versión de public/apk-version.json. No autoactualiza:
// descarga el APK y abre el instalador (Android exige confirmación fuera de Play).
export function ApkUpdateBanner() {
  const update = useApkUpdate();
  const [oculto, setOculto] = useState(false);
  const [guia, setGuia] = useState(false);
  const [descargando, setDescargando] = useState(false);

  if (!update || oculto) return null;

  async function onActualizar() {
    if (descargando) return;
    setDescargando(true);
    try {
      await descargarEInstalarApk(update!.url);
    } catch {
      // Fallback: flujo viejo (descarga vía navegador + guía de instalación).
      window.open(update!.url, "_blank");
      setGuia(true);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center gap-3 bg-primary px-4 py-2 text-primary-foreground shadow-lg">
      <span className="flex-1 text-sm font-medium">
        Nueva versión disponible ({update.version})
      </span>
      <button
        onClick={onActualizar}
        disabled={descargando}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground px-3 py-1.5 text-sm font-semibold text-primary transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {descargando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {descargando ? "Descargando…" : "Actualizar"}
      </button>
      <button
        onClick={() => setOculto(true)}
        aria-label="Cerrar"
        className="rounded-md p-1 hover:bg-primary-foreground/10"
      >
        <X className="h-4 w-4" />
      </button>
      <ApkInstallGuide open={guia} onOpenChange={setGuia} />
    </div>
  );
}
