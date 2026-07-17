import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "@/lib/auth/errors";

describe("friendlyAuthError", () => {
  it("traduz rate limit", () => {
    expect(friendlyAuthError("Email rate limit exceeded")).toMatch(/Muitas tentativas/);
  });

  it("traduz credenciais inválidas", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("Senha atual incorreta.");
  });
});
