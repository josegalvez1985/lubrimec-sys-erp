import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Datos multi-sistema: nunca servir desde caché. Toda consulta va al servidor en el
  // momento (staleTime 0) y no se conserva entre desmontajes (gcTime 0). Además refetch
  // al montar, al volver a la ventana y al reconectar. Excepción: los widgets del dashboard
  // conservan el dato en memoria (GC_DASHBOARD) para no parpadear al volver al home.
  const queryClient = new QueryClient({
    // Red de seguridad: si una mutación no define su propio onError, igual se avisa.
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError) return;
        // authFetch ya cerró la sesión y llevó al login: no tapar esa pantalla.
        if (error instanceof Error && error.message === "Sesión expirada") return;
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "No se pudo completar la operación.",
        );
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
