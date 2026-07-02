import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Helpers de exportación de reportes (Excel/PDF). Patrón documentado en
// src/GUIA_FRONT.md ("Gotchas de UI"): columnas definidas una vez por la vista,
// PDF con encabezado logo + título + subtítulo, abierto en pestaña nueva.

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// Logo del proyecto (public/logo.png) como data URL para incrustarlo en el PDF.
async function cargarLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null; // sin logo el PDF sale igual
  }
}

export type TablaExport = {
  titulo: string; // encabezado visible (ej. "Lubrimesys — Ventas Por Artículos")
  subtitulo: string; // también se usa como nombre de archivo
  columnas: string[];
  filas: string[][];
  pie?: string[]; // fila de totales (opcional)
};

// Excel: tabla HTML con extensión .xls (Excel la abre con columnas y formato,
// sin sumar una librería al bundle).
export function exportarExcel({ subtitulo, columnas, filas, pie }: TablaExport) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = `<tr>${columnas.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = filas
    .map((f) => `<tr>${f.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`)
    .join("");
  const foot = pie ? `<tr>${pie.map((s) => `<td><b>${esc(s)}</b></td>`).join("")}</tr>` : "";
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${head}${body}${foot}</table></body></html>`;
  descargarBlob(new Blob(["﻿", html], { type: "application/vnd.ms-excel" }), `${subtitulo}.xls`);
}

// PDF apaisado con logo + título + subtítulo; se abre en pestaña nueva (desde
// ahí se imprime o guarda). Nunca aborta por el logo.
export async function exportarPdf({ titulo, subtitulo, columnas, filas, pie }: TablaExport) {
  const doc = new jsPDF({ orientation: "landscape" });
  const logo = await cargarLogo();
  if (logo) doc.addImage(logo, "PNG", 14, 5, 12, 12);
  doc.setFontSize(13);
  doc.text(titulo, logo ? 30 : 14, 11);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitulo, logo ? 30 : 14, 16);
  doc.setTextColor(20);
  autoTable(doc, {
    startY: 20,
    head: [columnas],
    body: filas,
    foot: pie ? [pie] : undefined,
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [234, 88, 12] }, // naranja del tema
    footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
  });
  window.open(doc.output("bloburl"), "_blank");
}
