import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cargarLogo } from "@/lib/export";

// Recibo de salario de un comprobante de compra tipo SAL (botón "Recibo" de la
// pág 29 del APEX, que lo armaba con pdfMake). Mismo contenido: datos de la
// empresa, trabajador, conceptos (artículos del detalle), total en letras y
// firmas. Tamaño A5 apaisado, como el original.

// Datos fijos de la empresa: el APEX los tiene escritos en el proceso `json`.
const EMPRESA = {
  nombre: "Lubrimec, Lubricantes y Filtros",
  ruc: "RUC: 4169298-5",
  direccion: "Dirección: Ruta 2 km 18 Capiata - Paraguay",
};

export type ReciboSalario = {
  idFactura: number;
  trabajador: string;
  ci: string | null;
  fecha: string; // dd/mm/yyyy
  conceptos: { concepto: string; total: number }[];
};

// ─── Número a letras (reemplaza numeros_letras.js del APEX) ──────────────────

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DIEZ_A_VEINTINUEVE = [
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS",
  "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = [
  "", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS",
  "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function hasta999(n: number): string {
  if (n === 100) return "CIEN";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (r >= 30) {
    const u = r % 10;
    partes.push(u ? `${DECENAS[Math.floor(r / 10)]} Y ${UNIDADES[u]}` : DECENAS[Math.floor(r / 10)]);
  } else if (r >= 10) {
    partes.push(DIEZ_A_VEINTINUEVE[r - 10]);
  } else if (r > 0) {
    partes.push(UNIDADES[r]);
  }
  return partes.join(" ");
}

// "UNO" se apocopa delante de MIL / MILLONES: VEINTIÚN MIL, CIENTO UN MILLONES.
function apocopar(s: string): string {
  if (s.endsWith("VEINTIUNO")) return `${s.slice(0, -9)}VEINTIÚN`;
  if (s.endsWith("UNO")) return s.slice(0, -1);
  return s;
}

function hasta999999(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push("MIL");
  else if (miles > 1) partes.push(`${apocopar(hasta999(miles))} MIL`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(" ");
}

// Entero en letras, en mayúsculas (los guaraníes no tienen decimales: se redondea).
export function numeroALetras(valor: number): string {
  const n = Math.round(Math.abs(valor));
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const partes: string[] = [];
  if (millones === 1) partes.push("UN MILLÓN");
  else if (millones > 1) partes.push(`${apocopar(hasta999999(millones))} MILLONES`);
  if (resto) partes.push(hasta999999(resto));
  return `${valor < 0 ? "MENOS " : ""}${partes.join(" ")}`;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const fmtGs = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

export async function generarReciboSalario(r: ReciboSalario) {
  const doc = new jsPDF({ orientation: "landscape", format: "a5", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const ancho = W - 2 * M;
  doc.setTextColor(20);

  // Encabezado: empresa y trabajador a la izquierda, logo a la derecha.
  // public/logo.png es 467×534: se respeta la proporción.
  const logo = await cargarLogo();
  const logoH = 30;
  const logoW = (logoH * 467) / 534;
  if (logo) doc.addImage(logo, "PNG", W - M - logoW, M - 2, logoW, logoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("RECIBO DE SALARIO", M, M + 4);
  doc.setFontSize(11);
  doc.text(EMPRESA.nombre, M, M + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(EMPRESA.ruc, M, M + 15);
  doc.text(EMPRESA.direccion, M, M + 19.5);
  doc.text(`Trabajador: ${r.trabajador}`, M, M + 28);
  doc.text(`Nro. CI: ${r.ci ?? ""}`, M, M + 32.5);
  doc.text(`Fecha de pago: ${r.fecha}`, M, M + 37);

  const totalGeneral = r.conceptos.reduce((a, c) => a + c.total, 0);
  autoTable(doc, {
    startY: M + 42,
    margin: { left: M, right: M },
    theme: "plain",
    head: [["Concepto", { content: "Total", styles: { halign: "right" } }]],
    body: r.conceptos.map((c) => [c.concepto, fmtGs(c.total)]),
    foot: [["Total General:", fmtGs(totalGeneral)]],
    showFoot: "lastPage",
    styles: {
      fontSize: 9,
      cellPadding: { top: 1.1, bottom: 1.1, left: 1.5, right: 1.5 },
      textColor: 20,
      lineColor: [200, 200, 200],
      lineWidth: { bottom: 0.15 },
    },
    headStyles: { fontSize: 10, fontStyle: "bold", lineColor: [60, 60, 60], lineWidth: { bottom: 0.4 } },
    footStyles: { fontStyle: "bold", halign: "right", lineWidth: 0 },
    columnStyles: { 1: { halign: "right", cellWidth: 40 } },
  });
  const finY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? M + 60;

  // Pie: "recibí conforme", total en letras y firmas. Si no entra debajo de la
  // tabla (muchos conceptos), va en una hoja nueva.
  const enLetras = doc.splitTextToSize(
    `Guaraníes, ${numeroALetras(totalGeneral)}`,
    ancho,
  ) as string[];
  const lineaH = 4.5;
  const espacioFirma = 16; // entre el texto y la línea de firma
  let y = finY + 7;
  if (y + 5.5 + enLetras.length * lineaH + espacioFirma + lineaH > H - 10) {
    doc.addPage();
    y = M + 4;
  }

  doc.setFontSize(9.5);
  doc.text("Recibí conforme con la presente liquidación de salarios.", M, y);
  y += 5.5;
  doc.setFont("helvetica", "italic");
  doc.text(enLetras, M, y);
  doc.setFont("helvetica", "normal");
  y += (enLetras.length - 1) * lineaH;

  // Firmas: línea con la leyenda debajo, una por mitad de hoja. Van al pie de
  // la hoja si hay lugar; si no, a `espacioFirma` del texto.
  const yFirma = Math.max(y + espacioFirma, H - 20);
  const largo = 62;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  for (const [i, leyenda] of ["Firma del Empleador", "Firma del Trabajador"].entries()) {
    const cx = M + ancho / 4 + (i * ancho) / 2;
    doc.line(cx - largo / 2, yFirma, cx + largo / 2, yFirma);
    doc.text(leyenda, cx, yFirma + lineaH, { align: "center" });
  }

  // Igual que el resto de los PDF: pestaña nueva; si el navegador la bloquea
  // (la consulta previa puede agotar el "gesto" del clic), se descarga.
  if (!window.open(doc.output("bloburl"), "_blank")) {
    doc.save(`recibo-salario-${r.idFactura}.pdf`);
  }
}
