import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aqui = (caminho: string) => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": aqui("./src"),
      "server-only": aqui("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // O pglite sobe um Postgres em WASM: a primeira carga é lenta.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
