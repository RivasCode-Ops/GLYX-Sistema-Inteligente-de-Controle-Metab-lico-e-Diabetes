import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
    // GLYX-46: nenhum teste alcança destino fora da máquina (ver lib/testes/guarda-destino.ts).
    globalSetup: ["./lib/testes/setup-global.ts"],
    setupFiles: ["./lib/testes/rede-bloqueada.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
