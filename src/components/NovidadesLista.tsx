"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { totalDeLeads } from "@/lib/acoes";

const INTERVALO_MS = 60_000;

/**
 * "Atualizado às 15:04" + botão Atualizar + aviso de leads novos.
 *
 * Decisões deliberadas:
 *  - NÃO reordena a lista sozinho. Um lead novo que aparece no topo enquanto o
 *    dedo vai tocar no segundo card faz você abrir o lead errado. Em vez disso
 *    aparece um aviso, e a lista só muda quando você pede.
 *  - Só consulta com a aba visível, a cada 60s: aba esquecida em segundo plano
 *    não fica batendo no banco (que, no plano gratuito, é limitado).
 *  - Reinicia a cada atualização da lista (a página passa `key`).
 *  - Só a lista usa isto. A tela de detalhe nunca atualiza sozinha, para não
 *    mexer no que está sendo digitado.
 */
export function NovidadesLista({ total, consultadoEm }: { total: number; consultadoEm: string }) {
  const roteador = useRouter();
  const [pendente, iniciar] = useTransition();
  // O que a consulta mais recente viu. `total` (prop) é o que a TELA mostra.
  // A página usa `key` com o total: quando a lista é atualizada, este
  // componente reinicia e a nova referência passa a valer — sem efeito nem ref.
  const [maisRecente, setMaisRecente] = useState(total);

  useEffect(() => {
    const consultar = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const atual = await totalDeLeads();
        if (typeof atual === "number") setMaisRecente(atual);
      } catch {
        // Aviso é conveniência: falhar em silêncio é o certo.
      }
    };

    const timer = setInterval(consultar, INTERVALO_MS);
    document.addEventListener("visibilitychange", consultar);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", consultar);
    };
  }, []);

  const novos = Math.max(0, maisRecente - total);

  return (
    <div className="flex flex-col gap-2">
      {novos > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dourado/40 bg-dourado/10 p-3"
        >
          <p className="text-sm font-medium text-texto">
            {novos === 1 ? "Há 1 lead novo." : `Há ${novos} leads novos.`}
          </p>

          <button
            type="button"
            onClick={() => iniciar(() => roteador.refresh())}
            className="min-h-11 rounded-lg bg-dourado px-4 text-sm font-bold text-onyx transition hover:brightness-110"
          >
            Ver agora
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm text-texto-3">
        <span>Atualizado às {consultadoEm}</span>

        <button
          type="button"
          disabled={pendente}
          onClick={() => iniciar(() => roteador.refresh())}
          className="min-h-11 rounded-lg px-3 font-semibold text-texto-2 transition hover:text-texto disabled:opacity-50"
        >
          {pendente ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
    </div>
  );
}
