import { describe, expect, it } from "vitest";

import { destinoDeVolta, filtroDeUrl, sufixoDe, urlLista } from "@/lib/navegacao";

describe("urlLista / sufixoDe", () => {
  it("monta URLs só com parâmetros conhecidos", () => {
    expect(urlLista()).toBe("/");
    expect(urlLista({ status: "novo" })).toBe("/?status=novo");
    expect(urlLista({ status: "retornos", cursor: "abc_DEF-123" })).toBe("/?status=retornos&cursor=abc_DEF-123");
  });

  it("cursor com caracteres estranhos é descartado, não vira URL", () => {
    expect(urlLista({ cursor: "a&b=c" })).toBe("/");
    expect(urlLista({ cursor: "../../x" })).toBe("/");
  });

  it("sufixoDe: vazio sem estado, codificado com estado", () => {
    expect(sufixoDe({})).toBe("");
    expect(sufixoDe({ status: "novo" })).toBe(`?de=${encodeURIComponent("status=novo")}`);
  });
});

describe("filtroDeUrl", () => {
  it("aceita status conhecidos e 'retornos'; o resto vira null", () => {
    expect(filtroDeUrl("novo")).toBe("novo");
    expect(filtroDeUrl("retornos")).toBe("retornos");
    expect(filtroDeUrl("hackeado")).toBeNull();
    expect(filtroDeUrl(undefined)).toBeNull();
    expect(filtroDeUrl(["novo"])).toBeNull();
  });
});

describe("destinoDeVolta — nunca há OPEN REDIRECT", () => {
  it("volta para o filtro e a página de onde veio", () => {
    expect(destinoDeVolta("status=novo&cursor=abc")).toEqual({
      href: "/?status=novo&cursor=abc",
      rotulo: "← Voltar para novo",
    });
  });

  it("sem `de`, volta à lista inteira", () => {
    expect(destinoDeVolta(undefined)).toEqual({ href: "/", rotulo: "← Todos os leads" });
  });

  it.each([
    "https://golpe.com",
    "//golpe.com",
    "/\\golpe.com",
    "javascript:alert(1)",
    "status=novo&redirect=https://golpe.com",
    "https://golpe.com/?status=novo",
    "x".repeat(500),
    "status=hackeado",
    "cursor=a b c",
  ])("destino malicioso %j vira a lista (ou parâmetro conhecido), nunca um endereço externo", (entrada) => {
    const { href } = destinoDeVolta(entrada);

    expect(href.startsWith("/")).toBe(true);
    expect(href.startsWith("//")).toBe(false);
    expect(href).not.toContain("golpe");
    expect(href).not.toContain("javascript");
  });

  it("o `de` só carrega parâmetros que a função reconhece", () => {
    const { href } = destinoDeVolta("status=novo&cursor=abc&extra=1&outro=2");

    expect(href).toBe("/?status=novo&cursor=abc");
  });

  it("não aceita o que não é texto", () => {
    expect(destinoDeVolta(["a"])).toEqual({ href: "/", rotulo: "← Todos os leads" });
    expect(destinoDeVolta(42)).toEqual({ href: "/", rotulo: "← Todos os leads" });
  });
});
