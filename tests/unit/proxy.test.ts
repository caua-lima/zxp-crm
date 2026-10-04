import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());

const pedido = (caminho: string, cookie?: string) =>
  new NextRequest(`http://localhost${caminho}`, { headers: cookie ? { cookie } : {} });

describe("proxy: triagem otimista", () => {
  it("sem cookie, qualquer rota do painel manda para o login", () => {
    for (const caminho of ["/", "/leads/qualquer-id", "/?status=novo"]) {
      const r = proxy(pedido(caminho));

      expect(r.status, caminho).toBe(307);
      expect(r.headers.get("location")).toBe("http://localhost/login");
    }
  });

  it("o login é público", () => {
    expect(proxy(pedido("/login")).status).toBe(200);
  });

  it("com cookie (mesmo forjado) o proxy NÃO autoriza nada: só deixa a DAL decidir", () => {
    const r = proxy(pedido("/", "zxp_sessao=qualquer-coisa"));

    // Passa adiante — quem recusa um token falso é exigirSessao(), no banco.
    expect(r.status).toBe(200);
  });

  it("toda resposta sai com noindex, inclusive o redirecionamento", () => {
    expect(proxy(pedido("/")).headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(proxy(pedido("/login")).headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });
});

describe("proxy: Content-Security-Policy", () => {
  const csp = (caminho = "/login") => proxy(pedido(caminho)).headers.get("content-security-policy") ?? "";

  it("scripts só por nonce e strict-dynamic — sem unsafe-inline e sem unsafe-eval", () => {
    const politica = csp();

    expect(politica).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    const scripts = politica.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
  });

  it("o nonce é novo a cada requisição", () => {
    const nonce = (p: string) => /nonce-([A-Za-z0-9+/=]+)/.exec(p)![1];

    expect(nonce(csp())).not.toBe(nonce(csp()));
  });

  it("proíbe iframe, plugins, <base> alheio e formulário para fora", () => {
    const politica = csp();

    expect(politica).toContain("frame-ancestors 'none'");
    expect(politica).toContain("object-src 'none'");
    expect(politica).toContain("base-uri 'self'");
    expect(politica).toContain("form-action 'self'");
    expect(politica).toContain("default-src 'self'");
  });

  it("não permite NENHUMA origem externa (nenhum http(s):// na política)", () => {
    expect(csp()).not.toMatch(/https?:\/\//);
  });

  it("estilo por nonce em produção; unsafe-eval só no desenvolvimento", () => {
    vi.stubEnv("NODE_ENV", "production");
    const producao = csp();
    expect(producao).toMatch(/style-src 'self' 'nonce-/);
    expect(producao).not.toContain("unsafe-eval");
    expect(producao).toContain("upgrade-insecure-requests");

    vi.stubEnv("NODE_ENV", "development");
    const dev = csp();
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("CSP_REPORT_ONLY=1 só reporta (saída de emergência) e troca o nome do cabeçalho", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "1");
    const r = proxy(pedido("/login"));

    expect(r.headers.get("content-security-policy")).toBeNull();
    expect(r.headers.get("content-security-policy-report-only")).toContain("default-src 'self'");
  });

  it("também vale no redirecionamento ao login", () => {
    expect(proxy(pedido("/")).headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});

describe("proxy: matcher", () => {
  const fonte = (config.matcher[0] as { source: string }).source;
  const casa = (caminho: string) => new RegExp(`^${fonte}$`).test(caminho);

  it("o ícone e os estáticos ficam de fora (senão a aba do login fica sem logo)", () => {
    expect(casa("/icon.svg")).toBe(false);
    expect(casa("/favicon.ico")).toBe(false);
    expect(casa("/_next/static/chunks/x.js")).toBe(false);
  });

  it("as rotas do painel passam pelo proxy", () => {
    expect(casa("/")).toBe(true);
    expect(casa("/login")).toBe(true);
    expect(casa("/leads/0a9c9026-d9b6-4397-a1e2-c81c9ad737ec")).toBe(true);
  });
});
