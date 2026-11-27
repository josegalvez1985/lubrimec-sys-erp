// Búsqueda flexible de todo el sistema, la misma regla que las LOVs: palabras sueltas
// en cualquier orden, sin distinguir mayúsculas ni tildes, y con o sin separadores
// (OEM "15400-RTA-003" = "15400RTA003", CI "1.234.567" = "1234567").
// Uso: calcular los tokens UNA vez por búsqueda y probar cada fila con `coincide`.

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
const sinSep = (s: string) => s.replace(/[-/.\s]/g, "");

export function tokensBusqueda(q: string): string[] {
  // Un token hecho solo de separadores ("-", ".") se descarta: sin separadores
  // queda vacío y coincidiría con todo.
  return normalizar(q)
    .trim()
    .split(/\s+/)
    .filter((k) => sinSep(k) !== "");
}

export function coincide(texto: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const t = normalizar(texto);
  const tSin = sinSep(t);
  return tokens.every((k) => t.includes(k) || tSin.includes(sinSep(k)));
}
