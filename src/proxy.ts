import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { NOME_COOKIE_SESSAO } from "@/lib/constantes";

/**
 * Proxy (no Next 16 é o que antes se chamava middleware).
 *
 * Faz TRÊS coisas, e é importante saber o que ele NÃO faz:
 *
 * 1. Checagem otimista — se não existe cookie de sessão, manda pro login sem
 *    nem tocar no banco. Corta o tráfego anônimo cedo e barato.
 * 2. `X-Robots-Tag: noindex` em toda resposta. O painel nunca deve aparecer em
 *    buscador, e o cabeçalho cobre até o que a tag <meta> não alcança.
 * 3. Content-Security-Policy com NONCE por requisição (padrão da doc do Next).
 *
 * O que ele NÃO faz é autorizar. Ele só olha se o cookie EXISTE, não se é
 * válido — qualquer um pode criar um cookie com esse nome e passar por aqui. A
 * doc do Next é explícita: proxy não é solução de sessão. A verificação real é
 * `exigirSessao()`, na DAL, que consulta o banco em toda leitura e escrita.
 */

function politicaDeConteudo(nonce: string) {
  const dev = process.env.NODE_ENV === "development";

  // `unsafe-eval` só em desenvolvimento: o React o usa para remontar pilhas de
  // erro. Em produção não é necessário e não é permitido.
  const politica = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Em desenvolvimento o Next injeta estilo inline sem nonce (HMR).
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Impede o painel de ser colocado dentro de um <iframe> (clickjacking).
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];

  return politica.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaDeConteudo(nonce);

  // CSP_REPORT_ONLY=1 só REPORTA violações, sem bloquear: saída de emergência
  // se uma política nova quebrar algo em produção (ver docs/OPERACAO.md).
  const cabecalhoCsp =
    process.env.CSP_REPORT_ONLY === "1"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

  const temCookie = Boolean(request.cookies.get(NOME_COOKIE_SESSAO)?.value);
  const ehLogin = request.nextUrl.pathname === "/login";

  let resposta: NextResponse;

  if (!temCookie && !ehLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    resposta = NextResponse.redirect(destino);
  } else {
    // O Next lê o nonce do CSP do REQUEST para aplicá-lo aos próprios scripts.
    const cabecalhos = new Headers(request.headers);
    cabecalhos.set("x-nonce", nonce);
    cabecalhos.set(cabecalhoCsp, csp);

    resposta = NextResponse.next({ request: { headers: cabecalhos } });
  }

  resposta.headers.set(cabecalhoCsp, csp);
  resposta.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return resposta;
}

export const config = {
  matcher: [
    {
      // `icon.svg` fica de fora: sem isso o proxy manda o pedido do favicon para
      // o login, e a aba da própria tela de login fica sem logo. Ícone não é
      // dado sensível. Prefetch também fica de fora (recomendação da doc).
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
