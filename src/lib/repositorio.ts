import "server-only";

import { exigirSessao } from "./auth";
import type { Lead } from "./lead";

/**
 * Acesso à tabela `leads` do Supabase.
 *
 * Sem SDK, igual à LP: PostgREST é um GET/PATCH HTTP e o projeto fica com uma
 * dependência a menos. A chave usada é a `service_role`, que só existe no
 * servidor — a tabela tem RLS ligado e nenhuma policy, então nenhuma chave
 * pública lê nada, nem se vazar no navegador.
 *
 * Toda função exportada daqui chama `exigirSessao()` antes de qualquer coisa.
 */

const COLUNAS =
  "id,criado_em,nome,whatsapp,email,idade,peso,contexto,consentimento_em,status,observacoes";

async function supabase(caminho: string, init?: RequestInit) {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.",
    );
  }

  const resposta = await fetch(`${url}/rest/v1/${caminho}`, {
    ...init,
    // Painel de leads: dado velho aqui é pior que uma requisição a mais.
    cache: "no-store",
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!resposta.ok) {
    throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
  }

  return resposta;
}

/**
 * Todos os leads, mais recentes primeiro.
 *
 * Traz a lista inteira de propósito: o filtro por status e a contagem de cada
 * aba saem do mesmo array, sem uma consulta por aba. O teto de 500 existe pra
 * isso não degradar em silêncio se o volume crescer — quando encostar nele, a
 * hora é de paginar, não de aumentar o número.
 */
export async function listarLeads(): Promise<Lead[]> {
  await exigirSessao();

  const resposta = await supabase(
    `leads?select=${COLUNAS}&order=criado_em.desc&limit=500`,
  );

  return resposta.json();
}

export async function buscarLead(id: string): Promise<Lead | null> {
  await exigirSessao();

  const resposta = await supabase(
    `leads?select=${COLUNAS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const linhas: Lead[] = await resposta.json();

  return linhas[0] ?? null;
}

export async function atualizarLead(
  id: string,
  campos: Partial<Pick<Lead, "status" | "observacoes">>,
) {
  await exigirSessao();

  await supabase(`leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(campos),
  });
}
