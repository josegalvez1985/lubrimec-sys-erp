import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
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
  const body = filas.map((f) => `<tr>${f.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
  const foot = pie ? `<tr>${pie.map((s) => `<td><b>${esc(s)}</b></td>`).join("")}</tr>` : "";
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${head}${body}${foot}</table></body></html>`;
  descargarBlob(new Blob(["﻿", html], { type: "application/vnd.ms-excel" }), `${subtitulo}.xls`);
}

// PDF apaisado con logo + título + subtítulo; se abre en pestaña nueva (desde
// ahí se imprime o guarda). Nunca aborta por el logo.
export async function exportarPdf({ titulo, subtitulo, columnas, filas, pie }: TablaExport) {
  // compress: sin él jsPDF guarda las imágenes crudas (solo el logo pesa ~1 MB).
  const doc = new jsPDF({ orientation: "landscape", compress: true });
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

// ─── Reporte con gráficos (PDF) ─────────────────────────────────────────────
// A4 apaisado: encabezado (logo + título + filtros), fila de KPIs, gráficos en
// grilla de 2 columnas y tabla de detalle; pie con fecha/usuario y "Página X de
// Y" en todas las hojas. Los gráficos llegan como PNG (ver graficoAPng).
//
// Ojo con los caracteres: las fuentes estándar de jsPDF solo cubren Latin-1, así
// que el signo del guaraní, flechas, raya larga o puntos suspensivos Unicode
// salen como basura. Usar "Gs.", "+"/"-" y "...".

export type KpiPdf = { etiqueta: string; valor: string; detalle?: string };

export type GraficoPdf = {
  titulo: string;
  subtitulo?: string;
  png: string; // data URL de graficoAPng
  relacion: number; // alto / ancho de la imagen
  leyenda?: { color: string; texto: string }[];
  anchoCompleto?: boolean; // ocupa su propia fila a lo ancho (gráficos altos)
};

export type ReportePdf = {
  titulo: string;
  subtitulo: string; // filtros aplicados
  archivo: string; // nombre si el navegador bloquea la pestaña nueva y se descarga
  usuario?: string;
  kpis?: KpiPdf[];
  graficos?: GraficoPdf[];
  tabla?: { titulo: string; columnas: string[]; filas: string[][]; numericas?: number[] };
};

const NARANJA: [number, number, number] = [234, 88, 12]; // el mismo de exportarPdf

// Recorta un texto al ancho disponible (en mm) con "..." al final.
function recortar(doc: jsPDF, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > ancho) t = t.slice(0, -1);
  return `${t}...`;
}

// Reparte la leyenda en renglones que entren en el ancho del gráfico.
function renglonesLeyenda(doc: jsPDF, leyenda: GraficoPdf["leyenda"], ancho: number) {
  doc.setFontSize(7.5);
  const renglones: { color: string; texto: string; x: number }[][] = [];
  let actual: { color: string; texto: string; x: number }[] = [];
  let lx = 0;
  for (const l of leyenda ?? []) {
    const w = 6.5 + doc.getTextWidth(l.texto) + 6;
    if (actual.length && lx + w > ancho) {
      renglones.push(actual);
      actual = [];
      lx = 0;
    }
    actual.push({ ...l, x: lx });
    lx += w;
  }
  if (actual.length) renglones.push(actual);
  return renglones;
}

function altoGrafico(doc: jsPDF, g: GraficoPdf, ancho: number): number {
  const leyenda = renglonesLeyenda(doc, g.leyenda, ancho).length;
  return 5 + (g.subtitulo ? 4 : 0) + 1 + ancho * g.relacion + (leyenda ? 1.5 + leyenda * 3.5 : 0);
}

function dibujarGrafico(doc: jsPDF, g: GraficoPdf, x: number, y: number, ancho: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(recortar(doc, g.titulo, ancho), x, y + 3.5);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (g.subtitulo) {
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(recortar(doc, g.subtitulo, ancho), x, y + 2.8);
    y += 4;
  }
  y += 1;
  const alto = ancho * g.relacion;
  doc.addImage(g.png, "PNG", x, y, ancho, alto);
  y += alto;
  if (g.leyenda?.length) {
    y += 1.5;
    for (const renglon of renglonesLeyenda(doc, g.leyenda, ancho)) {
      y += 3.5;
      for (const l of renglon) {
        doc.setDrawColor(l.color);
        doc.setLineWidth(0.9);
        doc.line(x + l.x, y - 1, x + l.x + 5, y - 1);
        doc.setTextColor(80);
        doc.text(l.texto, x + l.x + 6.5, y);
      }
    }
  }
}

export async function exportarPdfReporte(r: ReportePdf) {
  // compress: cada gráfico sin comprimir ocupa ~2,2 MB (1280×580 RGB crudo).
  const doc = new jsPDF({ orientation: "landscape", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const ancho = W - 2 * M;
  const limite = H - 12; // debajo va el pie

  // Encabezado
  const logo = await cargarLogo();
  const xTitulo = logo ? M + 15 : M;
  if (logo) doc.addImage(logo, "PNG", M, 7, 12, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text(r.titulo, xTitulo, 12.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  const lineasSub = doc.splitTextToSize(r.subtitulo, W - M - xTitulo) as string[];
  doc.text(lineasSub, xTitulo, 17.5);
  let y = Math.max(22, 17.5 + lineasSub.length * 3.6) + 1;
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 5;

  // KPIs
  if (r.kpis?.length) {
    const gap = 4;
    const w = (ancho - gap * (r.kpis.length - 1)) / r.kpis.length;
    const h = 17;
    r.kpis.forEach((k, i) => {
      const x = M + i * (w + gap);
      doc.setFillColor(248, 246, 243);
      doc.setDrawColor(229, 226, 220);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, w, h, 2, 2, "FD");
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(recortar(doc, k.etiqueta, w - 6), x + 3, y + 5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20);
      doc.text(recortar(doc, k.valor, w - 6), x + 3, y + 11.3);
      doc.setFont("helvetica", "normal");
      if (k.detalle) {
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text(recortar(doc, k.detalle, w - 6), x + 3, y + 15);
      }
    });
    y += h + 6;
  }

  // Gráficos, de a dos por fila (uno solo en la fila, o con anchoCompleto, va a lo
  // ancho); la fila que no entra pasa a la hoja siguiente.
  if (r.graficos?.length) {
    const gap = 7;
    const filas: GraficoPdf[][] = [];
    for (const g of r.graficos) {
      const ultima = filas[filas.length - 1];
      if (!g.anchoCompleto && ultima?.length === 1 && !ultima[0].anchoCompleto) ultima.push(g);
      else filas.push([g]);
    }
    for (const fila of filas) {
      const w = fila.length === 1 ? ancho : (ancho - gap) / 2;
      const altoFila = Math.max(...fila.map((g) => altoGrafico(doc, g, w)));
      if (y + altoFila > limite) {
        doc.addPage();
        y = M;
      }
      fila.forEach((g, j) => dibujarGrafico(doc, g, M + j * (w + gap), y, w));
      y += altoFila + 6;
    }
  }

  // Tabla de detalle
  if (r.tabla) {
    if (y + 30 > limite) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(r.tabla.titulo, M, y + 3.5);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 6,
      margin: { left: M, right: M, bottom: 14 },
      head: [r.tabla.columnas],
      body: r.tabla.filas,
      styles: { fontSize: 7, cellPadding: 1.4 },
      headStyles: { fillColor: NARANJA },
      alternateRowStyles: { fillColor: [250, 249, 247] },
      columnStyles: Object.fromEntries(
        (r.tabla.numericas ?? []).map((i) => [i, { halign: "right" as const }]),
      ),
    });
  }

  // Pie en todas las hojas (se escribe al final, cuando ya se conoce el total).
  const ahora = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const generado =
    `Lubrimesys · Generado el ${p2(ahora.getDate())}/${p2(ahora.getMonth() + 1)}/` +
    `${ahora.getFullYear()} ${p2(ahora.getHours())}:${p2(ahora.getMinutes())}` +
    (r.usuario ? ` por ${r.usuario}` : "");
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(generado, M, H - 6);
    doc.text(`Página ${p} de ${total}`, W - M, H - 6, { align: "right" });
  }

  // Igual que exportarPdf: pestaña nueva. Si el navegador la bloquea (armar los
  // gráficos puede agotar el "gesto" del clic), se descarga el archivo.
  if (!window.open(doc.output("bloburl"), "_blank")) doc.save(`${r.archivo}.pdf`);
}

// Dibuja un gráfico de recharts fuera de pantalla, con tamaño fijo, y lo devuelve
// como PNG (data URL) para el PDF. Se monta aparte en vez de capturar el de la
// pantalla para que el PDF salga siempre claro (papel blanco) aunque la app esté
// en modo oscuro, y del mismo tamaño en cualquier pantalla. El gráfico debe usar
// colores literales (hex): una var(--x) no se resuelve dentro de la imagen.
export async function graficoAPng(
  grafico: ReactElement,
  ancho: number,
  alto: number,
  escala = 2,
): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(grafico);
    const svg = await esperarSvgEstable(host);
    return await svgAPng(svg, ancho, alto, escala);
  } finally {
    root.unmount();
    host.remove();
  }
}

// recharts termina de dibujar en varios pasos (su store se llena en efectos): se
// espera a que el SVG deje de cambiar entre dos cuadros seguidos.
async function esperarSvgEstable(host: HTMLElement): Promise<SVGSVGElement> {
  const cuadro = () => new Promise<void>((ok) => requestAnimationFrame(() => ok()));
  let previo = -1;
  for (let i = 0; i < 120; i++) {
    await cuadro();
    const svg = host.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!svg) continue;
    const largo = svg.innerHTML.length;
    if (largo > 0 && largo === previo) return svg;
    previo = largo;
  }
  throw new Error("No se pudo dibujar el gráfico para el PDF");
}

function svgAPng(svg: SVGSVGElement, ancho: number, alto: number, escala: number): Promise<string> {
  const clon = svg.cloneNode(true) as SVGSVGElement;
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clon.setAttribute("width", String(ancho));
  clon.setAttribute("height", String(alto));
  clon.removeAttribute("style");
  // Fuera del documento el texto no hereda la fuente de la app (caería en serif).
  clon.setAttribute("font-family", "Helvetica, Arial, sans-serif");
  const xml = new XMLSerializer().serializeToString(clon);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((ok, falla) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ancho * escala;
      canvas.height = alto * escala;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return falla(new Error("El navegador no permite generar imágenes"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ok(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falla(new Error("No se pudo convertir el gráfico a imagen"));
    };
    img.src = url;
  });
}
