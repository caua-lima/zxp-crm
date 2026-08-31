/**
 * Constantes compartilhadas entre o proxy e o servidor.
 *
 * Vive num arquivo próprio, sem `server-only` e sem importar `next/headers`,
 * porque o proxy.ts precisa do nome do cookie e não pode carregar o módulo de
 * sessão inteiro.
 */

export const NOME_COOKIE_SESSAO = "zxp_sessao";

/** 7 dias. Ele usa isto no celular entre uma call e outra — pedir senha toda
 *  hora faria ele deixar a aba aberta pra sempre, que é pior. */
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
