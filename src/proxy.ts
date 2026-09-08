import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { NOME_COOKIE_SESSAO } from "@/lib/constantes";

/**
 * Proxy (no Next 16 é o que antes se chamava middleware).
 *
 * Faz DUAS coisas, e é importante saber o que ele NÃO faz:
 *
 * 1. Checagem otimista — se não existe cookie de sessão, manda pro login sem
 *    nem tocar no banco. Isso corta o tráfego anônimo cedo e barato.
 * 2. `X-Robots-Tag: noindex` em toda resposta. O painel nunca deve aparecer em
 *    buscador, e o cabeçalho cobre até o que a tag <meta> não alcança.
 *
 * O que ele NÃO faz é autorizar. Ele só olha se o cookie EXISTE, não se a
 * assinatura confere — qualquer um pode forjar um cookie com esse nome e
 * passar por aqui. A doc do Next é explícita nisso: proxy não é solução de
 * sessão. A verificação real é `exigirSessao()`, na DAL, e ela roda em toda
 * leitura e toda escrita.
 */
export function proxy(request: NextRequest) {
  const temCookie = Boolean(
    request.cookies.get(NOME_COOKIE_SESSAO)?.value,
  );
  const ehLogin = request.nextUrl.pathname === "/login";

  let resposta: NextResponse;

  if (!temCookie && !ehLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    resposta = NextResponse.redirect(destino);
  } else {
    resposta = NextResponse.next();
  }

  resposta.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return resposta;
}

export const config = {
  // `icon.svg` precisa ficar de fora: sem isso o proxy manda o pedido do
  // favicon pro login, e a aba da própria tela de login fica sem logo.
  // Ícone não é dado sensível — o que precisa de sessão é lead, não imagem.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
