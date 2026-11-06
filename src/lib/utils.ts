import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Texto de un campo S/N de la base. Otro valor se muestra tal cual. */
export const etiquetaSiNo = (v: string) => (v === "S" ? "Sí" : v === "N" ? "No" : v);
