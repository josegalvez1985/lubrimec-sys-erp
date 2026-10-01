import { lazy, Suspense, useState } from "react";
import { BarChart3, Boxes, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventarioView } from "@/components/inventario-view";

// Página 58 (Inventario): pestaña "Conteos" = la vista de siempre, sin cambios;
// pestaña "Comparación" = el reporte que compara un inventario con los anteriores.
//
// Mismo patrón que conteo-efectivo-pagina: la vista de conteos queda montada al
// cambiar de pestaña (solo se oculta) y la comparación es lazy (recharts y el PDF
// bajan solo si se abre).
const ComparacionInventario = lazy(() =>
  import("@/components/comparacion-inventario").then((m) => ({
    default: m.ComparacionInventario,
  })),
);

export function InventarioPagina() {
  const [pestana, setPestana] = useState<"conteos" | "comparacion">("conteos");
  const [comparacionAbierta, setComparacionAbierta] = useState(false);

  return (
    <div className="space-y-3">
      <Tabs
        value={pestana}
        onValueChange={(v) => {
          setPestana(v as typeof pestana);
          if (v === "comparacion") setComparacionAbierta(true);
        }}
      >
        <TabsList>
          <TabsTrigger value="conteos" className="gap-1.5">
            <Boxes className="h-4 w-4" />
            Conteos
          </TabsTrigger>
          <TabsTrigger value="comparacion" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Comparación
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div hidden={pestana !== "conteos"}>
        <InventarioView />
      </div>
      {comparacionAbierta && (
        <div hidden={pestana !== "comparacion"}>
          <Suspense
            fallback={
              <div className="grid place-items-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            }
          >
            <ComparacionInventario />
          </Suspense>
        </div>
      )}
    </div>
  );
}
