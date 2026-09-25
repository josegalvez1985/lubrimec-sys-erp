import { lazy, Suspense, useState } from "react";
import { BarChart3, Coins, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConteoEfectivoView } from "@/components/conteo-efectivo-view";

// Página 85 (Conteo de Efectivo): pestaña "Conteo" = la vista de siempre, sin
// cambios; pestaña "Comparación" = el reporte de comparación entre fechas.
//
// La vista del conteo queda montada al cambiar de pestaña (solo se oculta), así no
// pierde el filtro de fecha ni lo que ya cargó. La comparación es lazy: recharts y
// el armado del PDF bajan solo si se abre.
const ComparacionConteo = lazy(() =>
  import("@/components/comparacion-conteo").then((m) => ({ default: m.ComparacionConteo })),
);

export function ConteoEfectivoPagina() {
  const [pestana, setPestana] = useState<"conteo" | "comparacion">("conteo");
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
          <TabsTrigger value="conteo" className="gap-1.5">
            <Coins className="h-4 w-4" />
            Conteo
          </TabsTrigger>
          <TabsTrigger value="comparacion" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Comparación
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div hidden={pestana !== "conteo"}>
        <ConteoEfectivoView />
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
            <ComparacionConteo />
          </Suspense>
        </div>
      )}
    </div>
  );
}
