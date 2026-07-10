import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// URL de la imagen del artículo (módulo ORDS "paginaweb", binario público).
// Con servidor Node (dev/Nitro) va por el proxy /api/img; en el build estático de
// GitHub Pages (VITE_API_URL absoluta a ORDS) no existe el proxy → URL directa a ORDS.
const API_BASE = import.meta.env.VITE_API_URL ?? "";
export const imgArticuloUrl = (id: string) =>
  API_BASE.startsWith("http")
    ? `${API_BASE.replace(/lubrimec\/?$/, "paginaweb/")}articulosimg/${encodeURIComponent(id)}`
    : `/api/img/articulosimg/${encodeURIComponent(id)}`;

// Modal que muestra la imagen de un artículo. `open` controla la apertura; si el
// artículo no tiene id (backend sin id_articulo) igual abre y muestra "Sin imagen".
export function ArticuloImgModal({
  open,
  id,
  titulo,
  onClose,
  src,
}: {
  open: boolean;
  id: string | null;
  titulo?: string | null;
  onClose: () => void;
  // URL alternativa de la imagen (default: módulo paginaweb). Ej: urlImagenArticulo
  // de api.ts para servir el BLOB de ARTICULOS directo (pág 82).
  src?: string;
}) {
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  // Reinicia el estado al abrir/cambiar de artículo, sin useEffect (patrón lastKey).
  const [lastId, setLastId] = useState<string | null>(null);
  if (id !== lastId) {
    setLastId(id);
    setEstado("cargando");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{titulo || "Imagen del artículo"}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-[240px] place-items-center">
          {id == null ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm">Sin imagen disponible</p>
            </div>
          ) : (
            <>
              {estado === "cargando" && (
                <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />
              )}
              {estado === "error" ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="h-8 w-8" />
                  <p className="text-sm">Sin imagen disponible</p>
                </div>
              ) : (
                // key = id: fuerza recarga y reinicia el estado al cambiar de artículo.
                <img
                  key={id}
                  src={src ?? imgArticuloUrl(id)}
                  alt={titulo ?? "Artículo"}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain"
                  onLoad={() => setEstado("ok")}
                  onError={() => setEstado("error")}
                  style={{ display: estado === "ok" ? "block" : "none" }}
                />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
