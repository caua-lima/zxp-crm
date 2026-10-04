import { describe, expect, it, vi } from "vitest";

import { prepararAmbiente, SENHA } from "../helpers/ambiente";

const banco = prepararAmbiente();

/**
 * Este teste mora sozinho no arquivo de propósito: vi.resetModules() recarrega
 * TODOS os módulos, inclusive os stubs de cookies/headers, e isso deixaria os
 * outros testes falando com uma instância diferente da que eles configuram.
 */
describe("freio de login em serverless", () => {
  it("o bloqueio PERSISTE entre instâncias (não vive na memória do processo)", async () => {
    const tentar = async (senha: string) => {
      const acoes = await import("@/lib/acoes");
      const dados = new FormData();
      dados.set("senha", senha);

      return acoes.entrar({}, dados);
    };

    for (let i = 0; i < 4; i++) await tentar(`errada-${i}`);

    // "Outra instância serverless": memória do processo zerada, módulos recarregados.
    vi.resetModules();

    const resultado = await tentar(SENHA);

    expect(resultado.erro).toMatch(/Muitas tentativas/);
    expect(banco.sessoes).toHaveLength(0);
  });

  it("no modelo antigo (Map em memória) isto NÃO valeria: aqui o estado está no banco", async () => {
    const acoes = await import("@/lib/acoes");
    const dados = new FormData();
    dados.set("senha", "errada");
    await acoes.entrar({}, dados);

    expect(banco.tentativas).toHaveLength(1);
    expect(banco.tentativas[0].falhas).toBe(1);
  });
});
