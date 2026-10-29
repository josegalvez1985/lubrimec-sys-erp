// Excepción acotada a la regla "sin caché" (src/router.tsx): los widgets del dashboard
// conservan su último dato en memoria al desmontarse, así al volver al home se muestran
// al instante mientras refetchOnMount "always" los vuelve a pedir por debajo. El dato
// siempre se re-consulta; solo se evita el spinner. No se persiste: un F5 arranca vacío.
export const GC_DASHBOARD = 30 * 60 * 1000;
