import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { validarSessao } from "./sessao";

/**
 * Camada de acesso a dados (DAL).
 *
 * Toda leitura e toda escrita passa por aqui antes de tocar no banco. O motivo
 * está na doc do Next 16: Server Actions são endpoints POST públicos — dá pra
 * chamá-las direto, sem passar pela interface. Proteger só a tela, ou só o
 * proxy, deixaria as ações abertas. (O proxy só olha se o cookie EXISTE; quem
 * confere de verdade é esta função.)
 *
 * Dois desfechos diferentes, de propósito:
 *  - sessão inválida (expirou, revogada, senha trocada) → redireciona ao login;
 *  - não deu para verificar (banco fora do ar) → LANÇA erro e mostra a tela de
 *    erro. Nos dois casos ninguém vê dado; mandar para o login quando o banco
 *    caiu só faria o dono achar que perdeu a senha.
 *
 * `cache` memoiza por requisição (não entre requisições nem entre pessoas).
 */
export const exigirSessao = cache(async () => {
  if (!(await validarSessao())) {
    redirect("/login");
  }

  return true;
});
