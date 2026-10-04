import type { CamposEditaveis } from "./lead";

/**
 * Resultado de uma edição, devolvido pelas Server Actions ao formulário.
 *
 * Tipado de propósito: o componente precisa distinguir "alguém alterou antes
 * de mim" de "o banco caiu" de "minha sessão expirou" — cada um pede uma
 * reação diferente, e nenhum deles pode virar "Salvo". `ok: true` só existe
 * quando o servidor confirmou a linha gravada.
 *
 * Sem `server-only`: é importado por componentes de cliente (só tipos).
 */

export type MotivoFalha =
  | "nao_encontrado"
  | "validacao"
  /** Não consegui falar com o banco. Nada foi gravado. */
  | "indisponivel"
  /** Passou do prazo numa escrita: PODE ter gravado. */
  | "incerto"
  /** Sessão expirou ou foi revogada. */
  | "sessao"
  /** Falta aplicar a migration no banco. */
  | "schema";

export type ResultadoEdicao =
  | { ok: true; atual: CamposEditaveis }
  | { ok: false; motivo: "conflito"; atual: CamposEditaveis; mensagem: string }
  | { ok: false; motivo: MotivoFalha; mensagem: string };

export type EntradaEdicao = { id: string; versao: number };
