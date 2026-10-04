import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("cabeçalhos estáticos (next.config.ts)", async () => {
  const regras = await nextConfig.headers!();
  const cabecalhos = Object.fromEntries(regras.flatMap((r) => r.headers.map((h) => [h.key, h.value])));

  it("aplicam-se a todas as rotas", () => {
    expect(regras).toHaveLength(1);
    expect(regras[0].source).toBe("/:path*");
  });

  it("proíbem iframe, MIME sniffing e permissões desnecessárias", () => {
    expect(cabecalhos["X-Frame-Options"]).toBe("DENY");
    expect(cabecalhos["X-Content-Type-Options"]).toBe("nosniff");
    expect(cabecalhos["Permissions-Policy"]).toContain("camera=()");
    expect(cabecalhos["Permissions-Policy"]).toContain("microphone=()");
    expect(cabecalhos["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("Referrer-Policy NÃO é no-referrer: isso faz o navegador mandar `Origin: null` e o Next recusa a Server Action", () => {
    expect(cabecalhos["Referrer-Policy"]).toBe("same-origin");
    expect(cabecalhos["Referrer-Policy"]).not.toBe("no-referrer");
  });

  it("não anuncia a tecnologia", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
