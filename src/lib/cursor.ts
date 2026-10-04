import "server-only";

import { ehTimestampIso, ehUuid } from "./validacao";

/**
 * Cursor de paginação: posição estável da lista (valor da coluna de ordenação
 * + id). Só o servidor codifica e decodifica — usa Buffer, que não existe no
 * navegador, e por isso não mora em validacao.ts (importado por cliente).
 */
export type Cursor = { c: string; i: string };

export function codificarCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/**
 * Lê um cursor vindo da URL. A URL é entrada do usuário: qualquer coisa fora
 * do formato esperado vira null (e a lista recomeça do início) em vez de
 * chegar ao banco.
 */
export function decodificarCursor(bruto: unknown): Cursor | null {
  if (typeof bruto !== "string" || bruto.length === 0 || bruto.length > 200) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(bruto)) return null;

  try {
    const { c, i } = JSON.parse(Buffer.from(bruto, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;

    return ehTimestampIso(c) && ehUuid(i) ? { c, i } : null;
  } catch {
    return null;
  }
}
