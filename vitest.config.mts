import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aqui = (caminho: string) => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: aqui("./src") + "/" },
      { find: /^server-only$/, replacement: aqui("./tests/stubs/server-only.ts") },
      // Fora de uma requisição do Next, cookies/headers/redirect não existem:
      // os testes usam versões controláveis (ver tests/stubs).
      { find: /^next\/headers$/, replacement: aqui("./tests/stubs/next-headers.ts") },
      { find: /^next\/navigation$/, replacement: aqui("./tests/stubs/next-navigation.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // O pglite sobe um Postgres em WASM: a primeira carga é lenta.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
