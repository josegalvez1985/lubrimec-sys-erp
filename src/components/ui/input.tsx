import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Alto y tipografía salen de la escala fluida de src/styles.css: compactos
          // en notebooks (1366) y táctiles (44px / 16px) en móvil.
          "flex h-[var(--control-h)] w-full rounded-md border border-input bg-transparent px-[var(--control-px)] py-1 text-[length:var(--field-font)] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-[length:var(--ui-font-sm)] file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
