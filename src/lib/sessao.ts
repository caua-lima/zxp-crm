import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { bancoFetch, lerJson } from "./banco";
import { configuracao } from "./config";
import {
  DURACAO_SESSAO_MS,
  NOME_COOKIE_SESSAO,
  formatoTokenValido,
} from "./constantes";
import { ErroCrm } from "./erros";
import { registrar } from "./log";

/**
 * Sessão de usuário único, REVOGÁVEL.
 *
 * O cookie guarda um identificador aleatório e opaco (32 bytes). O banco guarda
 * só o HASH dele. Cada requisição autenticada consulta o banco: é isso que
 * permite revogar uma sessão — logout, troca de senha e "sair de todos os
 * dispositivos" passam a valer na hora, inclusive para uma cópia do cookie.
 *
 * Sem biblioteca de auth e sem criptografia própria: o único segredo
 * criptográfico é o HMAC que impede guardar a senha ou o IP em texto puro.
 * Não há cadastro, papéis nem "esqueci minha senha": um usuário, uma senha.
 *
 * IMPORTANTE: o cookie É uma credencial. Quem o copiar entra no painel até a
 * sessão ser revogada ou expirar — por isso a revogação existe.
 */

export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Impressão digital da senha em uso. Cada sessão guarda a sua; mudar
 * ADMIN_PASSWORD muda a impressão e derruba TODAS as sessões abertas, sem
 * ninguém precisar lembrar de fazê-lo.
 */
export function impressaoCredencial(): string {
  const { segredo, senhaAdmin } = configuracao();

  return createHmac("sha256", segredo).update(`credencial:v1:${senhaAdmin}`).digest("hex");
}

/** Compara senhas em tempo constante (o digest normaliza o comprimento). */
export function senhaConfere(fornecida: string): boolean {
  const { senhaAdmin } = configuracao();

  const a = createHash("sha256").update(fornecida).digest();
  const b = createHash("sha256").update(senhaAdmin).digest();

  return timingSafeEqual(a, b);
}

/** Opções do cookie de sessão. Exportada para os testes conferirem httpOnly/Secure/SameSite. */
export function opcoesCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURACAO_SESSAO_MS / 1000,
  };
}

/** Abre uma sessão nova e a entrega no cookie. Lança ErroCrm se o banco falhar. */
export async function abrirSessao(): Promise<void> {
  const token = gerarToken();

  await bancoFetch("sessao.criar", "crm_sessoes", {
    metodo: "POST",
    preferir: "return=minimal",
    corpo: {
      id_hash: hashToken(token),
      credencial: impressaoCredencial(),
      expira_em: new Date(Date.now() + DURACAO_SESSAO_MS).toISOString(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(NOME_COOKIE_SESSAO, token, opcoesCookie());

  // Limpeza oportunista do que expirou há mais de 30 dias. Falhar aqui não pode
  // atrapalhar um login que já deu certo.
  const corte = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await bancoFetch("sessao.limpar", `crm_sessoes?expira_em=lt.${encodeURIComponent(corte)}`, {
    metodo: "DELETE",
    preferir: "return=minimal",
  }).catch(() => undefined);
}

/**
 * Revoga a sessão do cookie atual e apaga o cookie. Devolve false se o servidor
 * não conseguiu revogar (o cookie é apagado de qualquer jeito, mas uma cópia
 * dele continuaria valendo — quem chama precisa avisar).
 */
export async function fecharSessao(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(NOME_COOKIE_SESSAO)?.value;

  cookieStore.delete(NOME_COOKIE_SESSAO);

  if (!formatoTokenValido(token)) return true;

  try {
    await bancoFetch(
      "sessao.revogar",
      `crm_sessoes?id_hash=eq.${hashToken(token)}&revogada_em=is.null`,
      {
        metodo: "PATCH",
        preferir: "return=minimal",
        corpo: { revogada_em: new Date().toISOString() },
      },
    );

    return true;
  } catch {
    return false;
  }
}

/** Revoga TODAS as sessões abertas (sair de todos os dispositivos). */
export async function encerrarTodasAsSessoes(): Promise<void> {
  await bancoFetch("sessao.revogar_todas", "crm_sessoes?revogada_em=is.null", {
    metodo: "PATCH",
    preferir: "return=minimal",
    corpo: { revogada_em: new Date().toISOString() },
  });
}

/**
 * A sessão do cookie atual é válida AGORA? Consulta o banco a cada chamada.
 *
 * Devolve false para "não é válida" (sem cookie, formato errado, desconhecida,
 * expirada, revogada, senha trocada). LANÇA ErroCrm quando não consegue
 * verificar (banco fora do ar, projeto pausado, migration pendente).
 *
 * A distinção importa. Tratar "não consegui verificar" como "sessão inválida"
 * mandaria o dono para a tela de login como se a senha tivesse expirado,
 * quando na verdade o banco caiu. Nos dois casos NINGUÉM vê dado (falha
 * fechada) — só muda o diagnóstico mostrado.
 */
export async function validarSessao(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(NOME_COOKIE_SESSAO)?.value;

  // Formato errado (cookie do modelo antigo, lixo, cookie forjado) nem chega ao banco.
  if (!formatoTokenValido(token)) return false;

  const agora = new Date().toISOString();
  const resposta = await bancoFetch(
    "sessao.validar",
    `crm_sessoes?select=id_hash` +
      `&id_hash=eq.${hashToken(token)}` +
      `&credencial=eq.${impressaoCredencial()}` +
      `&revogada_em=is.null` +
      `&expira_em=gt.${encodeURIComponent(agora)}` +
      `&limit=1`,
  );

  const linhas = await lerJson<unknown[]>(resposta, "sessao.validar");

  return Array.isArray(linhas) && linhas.length === 1;
}

/** Versão booleana e fechada: qualquer falha em verificar conta como "não". */
export async function sessaoAtiva(): Promise<boolean> {
  try {
    return await validarSessao();
  } catch (erro) {
    // cookies() lança um erro INTERNO do Next para marcar a rota como dinâmica
    // (e redirect/notFound também). Engolir isso aqui quebraria o framework.
    unstable_rethrow(erro);

    registrar("warn", "sessao.validacao_falhou", {
      categoria: erro instanceof ErroCrm ? erro.categoria : "desconhecida",
    });

    return false;
  }
}
