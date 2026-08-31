import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { DURACAO_SESSAO_MS, NOME_COOKIE_SESSAO } from "./constantes";

/**
 * Sessão de usuário único, assinada com HMAC-SHA256.
 *
 * Sem biblioteca de auth de propósito: é um usuário só, sem cadastro, sem
 * papéis e sem "esqueci minha senha". Um JWT assinado à mão com o `crypto` do
 * Node resolve isso em 40 linhas auditáveis, e menos dependência é menos
 * superfície de ataque num painel que expõe dado de menor de idade.
 *
 * O cookie NÃO guarda dado nenhum além da validade. Não há o que roubar dele:
 * quem tem o cookie está autenticado, quem não tem, não está.
 */

function segredo() {
  const valor = process.env.AUTH_SECRET;

  // Falha alto e cedo. Um segredo curto (ou ausente) torna a assinatura
  // forjável, e um painel que "funciona" nesse estado é pior que um fora do ar.
  if (!valor || valor.length < 32) {
    throw new Error(
      "AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres). " +
        "Gere um com: openssl rand -base64 32",
    );
  }

  return valor;
}

function assinar(payload: string) {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

/** Compara dois textos sem vazar, pelo tempo de resposta, onde eles diferem. */
function iguaisEmTempoConstante(a: string, b: string) {
  // O digest normaliza o comprimento: `timingSafeEqual` recusa buffers de
  // tamanhos diferentes, e esse próprio erro já vazaria informação.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();

  return timingSafeEqual(ha, hb);
}

export function senhaConfere(fornecida: string) {
  const esperada = process.env.ADMIN_PASSWORD;

  if (!esperada) {
    throw new Error("ADMIN_PASSWORD não configurada.");
  }

  return iguaisEmTempoConstante(fornecida, esperada);
}

function criarToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + DURACAO_SESSAO_MS }),
  ).toString("base64url");

  return `${payload}.${assinar(payload)}`;
}

export function tokenValido(token: string | undefined) {
  if (!token) return false;

  const [payload, assinatura] = token.split(".");
  if (!payload || !assinatura) return false;

  if (!iguaisEmTempoConstante(assinatura, assinar(payload))) return false;

  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as { exp?: unknown };

    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

export async function abrirSessao() {
  const cookieStore = await cookies();

  cookieStore.set(NOME_COOKIE_SESSAO, criarToken(), {
    httpOnly: true,
    // Em desenvolvimento o localhost é http, e `secure` impediria o cookie de
    // ser gravado. Em produção é sempre https.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_MS / 1000,
  });
}

export async function fecharSessao() {
  const cookieStore = await cookies();
  cookieStore.delete(NOME_COOKIE_SESSAO);
}

export async function sessaoAtiva() {
  const cookieStore = await cookies();

  return tokenValido(cookieStore.get(NOME_COOKIE_SESSAO)?.value);
}
