"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { exigirSessao } from "./auth";
import { ehStatus } from "./lead";
import { atualizarLead } from "./repositorio";
import {
  esperaRestanteMs,
  formatarEspera,
  limparTentativas,
  registrarFalha,
} from "./limite";
import { abrirSessao, fecharSessao, senhaConfere } from "./sessao";

/**
 * Server Actions do painel.
 *
 * Atenção ao ler isto: a doc do Next 16 é explícita em que Server Actions são
 * alcançáveis por POST direto, sem passar pela tela. Por isso toda ação daqui
 * chama `exigirSessao()` antes de tocar em qualquer dado — menos o login, que
 * é justamente quem cria a sessão.
 */

export type EstadoLogin = { erro?: string };

async function origemDaRequisicao() {
  const cabecalhos = await headers();

  // Na Vercel o IP real vem no primeiro item do x-forwarded-for.
  const encaminhado = cabecalhos.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();

  return cabecalhos.get("x-real-ip") ?? "desconhecida";
}

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const origem = await origemDaRequisicao();

  const espera = esperaRestanteMs(origem);
  if (espera > 0) {
    return {
      erro: `Muitas tentativas. Tente de novo em ${formatarEspera(espera)}.`,
    };
  }

  const senha = formData.get("senha");
  if (typeof senha !== "string" || senha.length === 0) {
    return { erro: "Digite a senha." };
  }

  let correta: boolean;

  try {
    correta = senhaConfere(senha);
  } catch (erro) {
    console.error("[login] Configuração ausente:", erro);
    return { erro: "Painel não configurado. Confira as variáveis de ambiente." };
  }

  if (!correta) {
    registrarFalha(origem);

    // Mensagem única e sem detalhe: nada aqui deve ajudar quem está tentando
    // adivinhar (se a senha existe, se chegou perto, quantas faltam).
    return { erro: "Senha incorreta." };
  }

  limparTentativas(origem);
  await abrirSessao();

  redirect("/");
}

export async function sair() {
  await fecharSessao();
  redirect("/login");
}

export async function mudarStatus(id: string, status: string) {
  await exigirSessao();

  if (!ehStatus(status)) {
    throw new Error(`Status inválido: ${status}`);
  }

  await atualizarLead(id, { status });

  revalidatePath("/");
  revalidatePath(`/leads/${id}`);
}

export type EstadoObservacoes = { salvo?: boolean; erro?: string };

export async function salvarObservacoes(
  _estadoAnterior: EstadoObservacoes,
  formData: FormData,
): Promise<EstadoObservacoes> {
  await exigirSessao();

  const id = formData.get("id");
  const texto = formData.get("observacoes");

  if (typeof id !== "string" || typeof texto !== "string") {
    return { erro: "Dados inválidos." };
  }

  try {
    await atualizarLead(id, { observacoes: texto.trim() || null });
  } catch (erro) {
    console.error("[observacoes] Falha ao salvar:", erro);
    return { erro: "Não consegui salvar. Tente de novo." };
  }

  revalidatePath(`/leads/${id}`);

  return { salvo: true };
}
