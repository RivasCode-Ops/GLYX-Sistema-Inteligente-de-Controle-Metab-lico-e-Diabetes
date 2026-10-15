import { describe, expect, it } from "vitest";
import { decidirAcessoDaConta } from "./account-gate";

describe("decisão de acesso da conta", () => {
  it("falha ao ler o perfil NÃO libera (era o furo: profile nulo passava)", () => {
    expect(decidirAcessoDaConta({ data: null, error: { message: "timeout" } })).toBe("indisponivel");
  });

  it("erro com dado presente também não libera", () => {
    expect(decidirAcessoDaConta({ data: { disabled: false }, error: { message: "x" } })).toBe("indisponivel");
  });

  it("conta desativada é desativada", () => {
    expect(decidirAcessoDaConta({ data: { disabled: true }, error: null })).toBe("desativada");
  });

  it("conta ativa passa", () => {
    expect(decidirAcessoDaConta({ data: { disabled: false }, error: null })).toBe("liberar");
  });

  it("perfil ausente sem erro passa, como no banco", () => {
    expect(decidirAcessoDaConta({ data: null, error: null })).toBe("liberar");
  });
});
