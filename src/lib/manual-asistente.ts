/**
 * El manual del asistente, armado EN EL BUILD a partir del README (plugin de
 * `vite.config.ts`, sobre `README.md?raw`). Así el chunk que baja el navegador
 * ya no trae nombres de la base ni del código: el asistente no puede exponer lo
 * que nunca recibió, y el README completo no queda publicado en el sitio.
 *
 * Se queda con la sección "Páginas implementadas" (hasta "Rendimiento") y saca:
 * - el código en línea técnico (`tabla_x`, `db/x_sql.sql`, `PKG_X.fn`,
 *   `DataTable`, `LISTAR`...); el que es texto de pantalla (`Nueva marca`) queda
 *   como texto;
 * - los identificadores con guion bajo fuera de código (salvo `page_id`, que la
 *   IA usa para ubicar la pantalla abierta);
 * - los nombres de archivos y los enlaces a archivos.
 *
 * Si se cambian los títulos de esas secciones del README, el manual queda vacío
 * (la IA dice que no sabe) pero nada se rompe.
 */
export function manualParaAsistente(md: string): string {
  // Los títulos, solo a principio de línea (el texto los puede citar).
  const texto = md.replace(/\r\n?/g, "\n");
  const desde = texto.search(/^## Páginas implementadas/m);
  if (desde < 0) return "";
  const resto = texto.slice(desde + 1).search(/^## Rendimiento/m);
  let s = texto.slice(desde, resto < 0 ? undefined : desde + 1 + resto);

  s = s
    // Enlaces: solo el texto (suelen apuntar a archivos del repo).
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Código en línea: el técnico se va, el de pantalla queda como texto.
    .replace(/`([^`\n]+)`/g, (_, c: string) => (esTecnico(c) ? "" : c))
    // Archivos sueltos.
    .replace(/[\w./-]+\.(sql|tsx?|jsx?|md|json)\b/gi, "")
    // Identificadores con guion bajo (tablas, columnas, paquetes), aunque vengan
    // pegados a un número ("1000pkg_ventas").
    .replace(/(?<![A-Za-z])[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*\b/g, (t) =>
      t === "page_id" ? t : "",
    )
    .replace(/\bORDS\b/g, "el servidor")
    // Lo que queda colgando después de borrar: "Backend: ." o "Front: , y (...)".
    .replace(
      /\b(Backend|Front|Endpoints?|Paquetes?|Tablas?|Archivos?|Vistas?)\s*:\s*(?:(?:[,;]|\by\b|\be\b|\bo\b)\s*)*(?=[.;,)(\n—]|$)/gi,
      "",
    )
    .replace(/([.;])\s*(?:(?:[,;]|\by\b)\s*)+(?=[(\s])/g, "$1")
    .replace(/\(\s*(?:[,;/+·y]\s*)*\)/g, "")
    .replace(/[ \t]+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/[,;]\s*\./g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/[ \t]{2,}/g, " ");

  return s.trim();
}

function esTecnico(c: string): boolean {
  const t = c.trim();
  if (t === "page_id") return false; // la IA lo usa para ubicar la pantalla abierta
  if (/[_/\\$]|\.[A-Za-z]|\(|=>|::/.test(t)) return true; // rutas, archivos, llamadas
  if (/[a-z][A-Z]/.test(t)) return true; // camelCase / PascalCase (componentes)
  if (/\s/.test(t)) return false; // texto con espacios: es de pantalla
  if (/^[A-Z][A-Z0-9]{3,}$/.test(t)) return true; // LISTAR, INVENTARIO
  return /^[a-z][a-z0-9-]*$/.test(t); // stock, marcas, cod-empresa
}
