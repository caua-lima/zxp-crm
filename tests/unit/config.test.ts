import { afterEach, describe, expect, it, vi } from "vitest";

import { validarConfiguracao } from "@/lib/config";
import { ErroConfiguracao } from "@/lib/erros";

afterEach(() => vi.unstubAllEnvs());

const valido = {
  SUPABASE_URL: "https://abcdefghij.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_0123456789abcdefghij",
  ADMIN_PASSWORD: "uma-senha-longa-e-unica-123",
  AUTH_SECRET: "abcdefghijklmnopqrstuvwxyz0123456789ABCD",
} as unknown as NodeJS.ProcessEnv;

const com = (mudancas: Record<string, string | undefined>) =>
  ({ ...valido, ...mudancas }) as NodeJS.ProcessEnv;

function problemas(env: NodeJS.ProcessEnv): string[] {
  try {
    validarConfiguracao(env);

    return [];
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return erro.problemas;

    throw erro;
  }
}

describe("validarConfiguracao", () => {
  it("configuração válida passa e normaliza a URL", () => {
    expect(validarConfiguracao(valido).supabaseUrl).toBe("https://abcdefghij.supabase.co");
  });

  it.each(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASSWORD", "AUTH_SECRET"])(
    "falha FECHADA quando %s está ausente",
    (nome) => {
      const lista = problemas(com({ [nome]: undefined }));

      expect(lista.join(" ")).toContain(nome);
    },
  );

  it("o erro lista NOMES de variáveis, nunca valores", () => {
    const lista = problemas(com({ AUTH_SECRET: "valorSecretoXYZ", ADMIN_PASSWORD: "valorSenhaABC" }));

    expect(lista.join(" ")).not.toContain("valorSecretoXYZ");
    expect(lista.join(" ")).not.toContain("valorSenhaABC");
  });

  it("URL colada com /rest/v1/ (erro clássico) é recusada", () => {
    expect(problemas(com({ SUPABASE_URL: "https://abc.supabase.co/rest/v1/" })).join(" ")).toContain("só a raiz");
  });

  it("http só para loopback (tráfego que não sai da máquina); host remoto exige https SEMPRE", () => {
    for (const ambiente of ["production", "development", "test"]) {
      vi.stubEnv("NODE_ENV", ambiente);

      expect(problemas(com({ SUPABASE_URL: "http://127.0.0.1:54321" })), ambiente).toEqual([]);
      expect(problemas(com({ SUPABASE_URL: "http://localhost:54321" })), ambiente).toEqual([]);
      expect(problemas(com({ SUPABASE_URL: "http://abc.supabase.co" })).join(" "), ambiente).toContain("https");
      expect(problemas(com({ SUPABASE_URL: "http://192.168.0.10:54321" })).join(" "), ambiente).toContain("https");
    }
  });

  it("URL inválida", () => {
    expect(problemas(com({ SUPABASE_URL: "isso nao é url" })).join(" ")).toContain("não é uma URL");
  });

  it("chave PÚBLICA (publishable ou anon) é recusada — o painel abriria vazio sem explicar", () => {
    expect(
      problemas(com({ SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_0123456789abcdefghij" })).join(" "),
    ).toContain("PÚBLICA");

    const jwtAnon = [
      "eyJhbGciOiJIUzI1NiJ9",
      Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
      "assinatura",
    ].join(".");
    expect(problemas(com({ SUPABASE_SERVICE_ROLE_KEY: jwtAnon })).join(" ")).toContain("PÚBLICA");
  });

  it("a service_role legada (JWT com role service_role) é aceita", () => {
    const jwt = [
      "eyJhbGciOiJIUzI1NiJ9",
      Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
      "assinatura-qualquer",
    ].join(".");

    expect(problemas(com({ SUPABASE_SERVICE_ROLE_KEY: jwt }))).toEqual([]);
  });

  it("senha: mínimo 12 e sem o valor de exemplo — em produção", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(problemas(com({ ADMIN_PASSWORD: "curta123" })).join(" ")).toContain("curta demais");
    expect(problemas(com({ ADMIN_PASSWORD: "trocar-esta-senha-no-deploy" })).join(" ")).toContain("valor de exemplo");
    expect(problemas(com({ ADMIN_PASSWORD: "password" })).join(" ")).not.toBe("");
    expect(problemas(com({ ADMIN_PASSWORD: "uma-senha-longa-e-unica-123" }))).toEqual([]);
  });

  it("no desenvolvimento a senha pode ser mais curta (8), mas não vazia", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(problemas(com({ ADMIN_PASSWORD: "oitochar" }))).toEqual([]);
    expect(problemas(com({ ADMIN_PASSWORD: "curta" })).join(" ")).toContain("curta demais");
  });

  it("AUTH_SECRET: mínimo 32 caracteres E variação (tamanho não prova entropia)", () => {
    expect(problemas(com({ AUTH_SECRET: "curto" })).join(" ")).toContain("curto demais");
    expect(problemas(com({ AUTH_SECRET: "a".repeat(40) })).join(" ")).toContain("pouca variação");
    expect(problemas(com({ AUTH_SECRET: "ab".repeat(20) })).join(" ")).toContain("pouca variação");
  });

  it("junta TODOS os problemas de uma vez (não um por tentativa)", () => {
    const lista = problemas({} as NodeJS.ProcessEnv);

    expect(lista.length).toBe(4);
  });
});
