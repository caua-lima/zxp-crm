import "server-only";

import { randomUUID } from "node:crypto";

/**
 * Log estruturado e sanitizado — uma linha JSON por evento.
 *
 * Regra do projeto: o log NUNCA recebe corpo de resposta do banco, anotações,
 * relato, telefone, e-mail, senha, cookie ou chave. Só categoria, operação,
 * status, duração e um identificador de correlação.
 *
 * Duas camadas de proteção, porque "lembrar de não logar" não escala:
 *  1. só entram valores primitivos, com tamanho limitado;
 *  2. campos cujo NOME sugere dado sensível são descartados mesmo se alguém
 *     passar (o teste "logs não carregam PII" cobre isto).
 */

type Valor = string | number | boolean | null | undefined;
export type CamposLog = Record<string, Valor>;

const NOME_SENSIVEL =
  /senha|password|token|cookie|secret|segredo|authorization|chave|key|telefone|whatsapp|email|e-mail|nome|contexto|observac|anotac|corpo|body|detalhe|hint|message|mensagem/i;

const LIMITE_TEXTO = 120;

function limpar(campos: CamposLog): Record<string, Valor> {
  const saida: Record<string, Valor> = {};

  for (const [chave, valor] of Object.entries(campos)) {
    if (NOME_SENSIVEL.test(chave)) continue;
    if (valor === undefined) continue;

    saida[chave] =
      typeof valor === "string" ? valor.replace(/[\r\n\t]/g, " ").slice(0, LIMITE_TEXTO) : valor;
  }

  return saida;
}

export function novaCorrelacao(): string {
  return randomUUID().slice(0, 8);
}

export function registrar(
  nivel: "info" | "warn" | "error",
  evento: string,
  campos: CamposLog = {},
) {
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    evento,
    ...limpar(campos),
  });

  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}
