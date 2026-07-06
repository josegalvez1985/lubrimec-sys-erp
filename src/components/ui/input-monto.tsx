import * as React from "react";
import { Input } from "@/components/ui/input";

// Input de monto/número con separador de miles en vivo (es-PY: punto de miles,
// coma decimal). Trabaja con un value numérico (number | null) y notifica cambios
// como number | null. Usar en TODO campo editable de monto/importe/precio/cantidad
// (regla del proyecto: los montos siempre llevan separador de miles).
//
//   <InputMonto value={monto} onValueChange={setMonto} />
//
// Acepta decimales (coma). Para enteros (guaraníes) dejar decimales en 0.

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (v: number | null) => void;
  /** Máximo de decimales permitidos (default 2). Usar 0 para montos enteros. */
  maxDecimals?: number;
};

const nf = (maxDecimals: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: maxDecimals });

// "1.234,5" -> 1234.5 ; "" -> null
function parsear(texto: string): number | null {
  const limpio = texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (limpio === "" || limpio === "-") return null;
  const n = Number(limpio);
  return Number.isNaN(n) ? null : n;
}

export function InputMonto({ value, onValueChange, maxDecimals = 2, ...props }: Props) {
  const [texto, setTexto] = React.useState("");
  const [foco, setFoco] = React.useState(false);

  // Cuando no está en foco, muestra el valor formateado desde la prop.
  const mostrado = foco ? texto : value == null ? "" : nf(maxDecimals).format(value);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={mostrado}
      onFocus={(e) => {
        setFoco(true);
        setTexto(value == null ? "" : nf(maxDecimals).format(value));
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFoco(false);
        props.onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        const n = parsear(raw);
        // Reformatea la parte entera con separador de miles; preserva lo que se
        // teclea como decimal (coma) para no romper la edición.
        const negativo = /^-/.test(raw.trim());
        const [entRaw, decRaw] = raw.replace(/\./g, "").split(",");
        const entDigitos = (entRaw ?? "").replace(/\D/g, "");
        const entFmt = entDigitos === "" ? "" : nf(0).format(Number(entDigitos));
        const dec = decRaw !== undefined ? "," + decRaw.replace(/\D/g, "").slice(0, maxDecimals) : "";
        setTexto((negativo && entFmt ? "-" : "") + entFmt + dec);
        onValueChange(n);
      }}
    />
  );
}
