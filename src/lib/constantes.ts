/**
 * Constantes compartilhadas entre o proxy e o servidor.
 *
 * Vive num arquivo próprio, sem `server-only` e sem importar `next/headers`,
 * porque o proxy.ts precisa do nome do cookie e não pode carregar o módulo de
 * sessão inteiro (que fala com o banco).
 */

export const NOME_COOKIE_SESSAO = "zxp_sessao";

/** Cookie com o termo da busca. Fica fora da URL de propósito — ver acoes.ts. */
export const NOME_COOKIE_BUSCA = "zxp_busca";

/**
 * 7 dias, contados a partir do login (não renova sozinho). Ele usa o painel no
 * celular entre uma call e outra: pedir senha toda hora faria a aba ficar
 * aberta pra sempre, que é pior. A sessão pode ser revogada a qualquer
 * momento — o que faz esse prazo ser aceitável.
 */
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

/** O token de sessão tem 32 bytes aleatórios em base64url: sempre 43 caracteres. */
export const TAMANHO_TOKEN = 43;

export function formatoTokenValido(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
