import "server-only";

import { createHmac } from "node:crypto";

import { rpc } from "./banco";
import { configuracao } from "./config";
import { ErroCrm } from "./erros";

/**
 * Freio de força bruta no login — PERSISTENTE.
 *
 * A versão anterior guardava as tentativas num Map em memória. Em serverless
 * cada instância tem o seu e um reinício zera tudo, então o atacante ganhava
 * tentativas novas a cada instância. Agora o contador mora no banco
 * (crm_login_falha / crm_login_espera / crm_login_ok, na migration crm_0001),
 * com incremento atômico, expiração e limpeza.
 *
 * Decisões:
 *  - A chave é um HMAC da origem. O IP nunca é gravado em texto puro.
 *  - O bloqueio é POR ORIGEM, não global: um visitante qualquer não consegue
 *    trancar o dono pra fora só errando a senha de propósito.
 *  - Se o banco não responde, o login FALHA FECHADO (ver acoes.ts). Um freio
 *    que some em silêncio quando o banco cai seria um freio que o atacante
 *    pode desligar derrubando o banco.
 *  - Limite conhecido: um atacante com MUITOS IPs distintos (botnet) soma
 *    tentativas livres por IP. O freio derruba script de dicionário; a defesa
 *    contra isso é senha longa e única (ADMIN_PASSWORD ≥ 12 em produção).
 */

export function chaveDaOrigem(origem: string): string {
  const { segredo } = configuracao();

  return createHmac("sha256", segredo).update(`origem:v1:${origem}`).digest("hex");
}

function inteiro(valor: unknown, operacao: string): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) {
    throw new ErroCrm("upstream", operacao);
  }

  return valor;
}

/** Segundos que faltam para a origem poder tentar de novo (0 = liberada). */
export async function esperaRestante(chave: string): Promise<number> {
  return inteiro(await rpc("crm_login_espera", { p_chave: chave }), "rpc.crm_login_espera");
}

/** Registra uma senha errada. Devolve por quantos segundos a origem fica bloqueada (0 = ainda livre). */
export async function registrarFalha(chave: string): Promise<number> {
  return inteiro(await rpc("crm_login_falha", { p_chave: chave }), "rpc.crm_login_falha");
}

export async function limparTentativas(chave: string): Promise<void> {
  await rpc("crm_login_ok", { p_chave: chave });
}

export function formatarEspera(segundos: number): string {
  if (segundos < 60) return `${segundos} segundo${segundos === 1 ? "" : "s"}`;

  const minutos = Math.ceil(segundos / 60);

  return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
}
