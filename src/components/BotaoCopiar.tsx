"use client";

import { useState } from "react";

/**
 * Copia um valor (telefone, e-mail) e avisa o resultado em texto, numa região
 * `aria-live` — quem usa leitor de tela ouve "Copiado". Falha de verdade (sem
 * permissão, navegador sem a API) é dita, não escondida.
 */
export function BotaoCopiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [estado, setEstado] = useState<"" | "copiado" | "falhou">("");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setEstado("copiado");
    } catch {
      setEstado("falhou");
    }

    setTimeout(() => setEstado(""), 2500);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copiar}
        className="min-h-11 rounded-lg border border-borda px-3 text-sm font-semibold text-texto-2 transition hover:border-dourado/50 hover:text-texto"
      >
        Copiar<span className="sr-only"> {rotulo}</span>
      </button>

      <span role="status" aria-live="polite" className="text-xs text-texto-3">
        {estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não consegui copiar" : ""}
      </span>
    </span>
  );
}
