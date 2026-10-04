import type { ReactNode } from "react";

/**
 * Selo de texto. A informação está NO TEXTO ("Não contatar"), não só na cor —
 * quem não distingue dourado de cinza lê do mesmo jeito.
 */
export function Selo({ children, destaque = false }: { children: ReactNode; destaque?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        destaque
          ? "border-dourado/40 bg-dourado/10 text-dourado"
          : "border-marfim/15 bg-marfim/5 text-texto-2"
      }`}
    >
      {children}
    </span>
  );
}
