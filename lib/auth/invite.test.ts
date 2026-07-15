import { describe, expect, it } from "vitest";
import { inviteCodesMatch } from "./invite";

describe("inviteCodesMatch", () => {
  it("aceita códigos iguais com espaços nas bordas", () => {
    expect(inviteCodesMatch("  abc  ", "abc")).toBe(true);
  });

  it("rejeita códigos diferentes", () => {
    expect(inviteCodesMatch("abc", "xyz")).toBe(false);
  });
});
