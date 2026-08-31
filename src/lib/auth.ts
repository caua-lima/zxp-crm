import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { sessaoAtiva } from "./sessao";

/**
 * Camada de acesso a dados (DAL).
 *
 * Toda leitura e toda escrita passa por aqui antes de tocar no Supabase. O
 * motivo está na doc do Next 16: Server Actions são endpoints POST públicos —
 * dá pra chamá-las direto, sem passar pela interface. Proteger só a tela, ou
 * só o proxy, deixaria as ações abertas.
 */
export const exigirSessao = cache(async () => {
  if (!(await sessaoAtiva())) {
    redirect("/login");
  }

  return true;
});
