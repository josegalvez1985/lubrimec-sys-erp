import { Download, FolderDown, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Guía post-descarga del APK: Android no abre el instalador solo; hay que tocar
// el archivo descargado. Este modal le indica al usuario cómo hacerlo. Se usa en
// el login (botón "Descargar apk") y en el banner de actualización dentro del APK.
export function ApkInstallGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Descargando la app...
          </DialogTitle>
          <DialogDescription>
            La descarga comenzó. Para instalar Lubrimesys sigue estos pasos:
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
            <span>
              Cuando termine, toca la <b>notificación de descarga</b> o abre{" "}
              <FolderDown className="inline h-4 w-4 text-primary" /> <b>Descargas</b> y toca{" "}
              <b>lubrimesys.apk</b>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
            <span>
              Si Android lo pide, permite{" "}
              <ShieldCheck className="inline h-4 w-4 text-primary" />{" "}
              <b>"Instalar apps desconocidas"</b> para tu navegador.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
            <span>
              Toca <b>Instalar</b> y luego <b>Abrir</b>.
            </span>
          </li>
        </ol>
        <Button onClick={() => onOpenChange(false)} className="w-full">
          Entendido
        </Button>
      </DialogContent>
    </Dialog>
  );
}
