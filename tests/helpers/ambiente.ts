import { afterAll, beforeAll, beforeEach, vi } from "vitest";

import { reiniciarRequisicao } from "../stubs/next-headers";
import { FakeSupabase } from "./fake-supabase";

/** Chave de teste: parece uma secreta (nunca "publishable") e tem o tamanho mínimo exigido. */
export const CHAVE_BANCO = "sb_secret_chave-so-de-teste-0123456789";
export const SENHA = "senha-de-teste-bem-longa";
export const SEGREDO = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";

/**
 * Sobe o banco simulado e aponta as variáveis de ambiente para ele. Devolve a
 * instância; ela é limpa antes de cada teste.
 */
export function prepararAmbiente(extras: Record<string, string> = {}) {
  const banco = new FakeSupabase(CHAVE_BANCO);
  let url = "";

  const aplicar = () => {
    vi.stubEnv("SUPABASE_URL", url);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", CHAVE_BANCO);
    vi.stubEnv("ADMIN_PASSWORD", SENHA);
    vi.stubEnv("AUTH_SECRET", SEGREDO);
    // Prazo curto: os testes de timeout não podem levar 8 segundos cada.
    vi.stubEnv("CRM_PRAZO_BANCO_MS", "300");

    for (const [k, v] of Object.entries(extras)) vi.stubEnv(k, v);
  };

  beforeAll(async () => {
    url = await banco.iniciar();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await banco.parar();
  });

  beforeEach(() => {
    banco.reiniciar();
    reiniciarRequisicao();
    aplicar();
  });

  return banco;
}

/** Captura o que o código joga no console, para provar que dado sensível NÃO aparece lá. */
export function capturarConsole() {
  const linhas: string[] = [];
  const registrar = (...args: unknown[]) => {
    linhas.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  const espioes = [
    vi.spyOn(console, "log").mockImplementation(registrar),
    vi.spyOn(console, "warn").mockImplementation(registrar),
    vi.spyOn(console, "error").mockImplementation(registrar),
  ];

  return {
    linhas,
    texto: () => linhas.join("\n"),
    parar: () => espioes.forEach((e) => e.mockRestore()),
  };
}

/** Pedidos feitos à tabela `leads` (exclui sessão e contadores). */
export function pedidosAosLeads(banco: FakeSupabase) {
  return banco.pedidos.filter((p) => p.caminho === "/rest/v1/leads");
}
