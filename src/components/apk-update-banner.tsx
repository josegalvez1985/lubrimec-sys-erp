import { useState } from "react";
import { Download, X } from "lucide-react";
import { useApkUpdate } from "@/hooks/use-apk-update";
import { ApkInstallGuide } from "@/components/apk-install-guide";

// Banner de "nueva versión disponible" dentro del APK. Aparece solo si el APK
// instalado es anterior a la versión de public/apk-version.json. No autoactualiza:
// abre el APK nuevo para que el usuario lo instale (Android lo requiere fuera de Play).
export function ApkUpdateBanner() {
  const update = useApkUpdate();
  const [oculto, setOculto] = useState(false);
  const [guia, setGuia] = useState(false);

  if (!update || oculto) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center gap-3 bg-primary px-4 py-2 text-primary-foreground shadow-lg">
      <span className="flex-1 text-sm font-medium">
        Nueva versión disponible ({update.version})
      </span>
      <a
        href={update.url}
        onClick={() => setGuia(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground px-3 py-1.5 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
      >
        <Download className="h-4 w-4" />
        Actualizar
      </a>
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
