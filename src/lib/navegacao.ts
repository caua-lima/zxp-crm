import { ehStatus, rotuloStatus, type StatusLead } from "./lead";

/**
 * URLs da lista e o "voltar" do detalhe.
 *
 * Sem `server-only`: usado por componentes de servidor e de cliente.
 *
 * O "voltar" preserva filtro e página, mas NUNCA aceita um destino vindo da
 * URL. O parâmetro `de` carrega só uma query string; o destino é sempre
 * reconstruído aqui como "/" + parâmetros conhecidos e validados. Isso impede
 * open redirect: `?de=https://golpe.com` ou `?de=//golpe.com` não viram nada.
 */

export type FiltroUrl = StatusLead | "retornos" | null;

export function filtroDeUrl(valor: unknown): FiltroUrl {
  if (valor === "retornos") return "retornos";

  return ehStatus(valor) ? valor : null;
}

const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

export function urlLista(p: { status?: FiltroUrl; cursor?: string | null } = {}): string {
  const pares: string[] = [];

  if (p.status) pares.push(`status=${p.status}`);
  if (p.cursor && CURSOR.test(p.cursor)) pares.push(`cursor=${p.cursor}`);

  return pares.length > 0 ? `/?${pares.join("&")}` : "/";
}

/** Sufixo `?de=…` para os links que saem da lista rumo ao detalhe. */
export function sufixoDe(p: { status?: FiltroUrl; cursor?: string | null }): string {
  const url = urlLista(p);
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";

  return query ? `?de=${encodeURIComponent(query)}` : "";
}

export function rotuloFiltro(filtro: FiltroUrl): string {
  if (filtro === "retornos") return "Retornos";

  return filtro ? rotuloStatus[filtro] : "Todos";
}

/** Destino seguro do "voltar" a partir do `de` da URL (qualquer lixo vira a lista inteira). */
export function destinoDeVolta(de: unknown): { href: string; rotulo: string } {
  const padrao = { href: "/", rotulo: "← Todos os leads" };

  if (typeof de !== "string" || de.length > 300) return padrao;

  let parametros: URLSearchParams;

  try {
    parametros = new URLSearchParams(de);
  } catch {
    return padrao;
  }

  const status = filtroDeUrl(parametros.get("status"));
  const cursor = parametros.get("cursor");
  const href = urlLista({ status, cursor });

  if (href === "/") return padrao;

  return {
    href,
    rotulo: status ? `← Voltar para ${rotuloFiltro(status).toLowerCase()}` : "← Voltar à lista",
  };
}
