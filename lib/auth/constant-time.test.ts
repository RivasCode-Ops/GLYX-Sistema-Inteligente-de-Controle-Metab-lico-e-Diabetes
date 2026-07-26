import { describe, expect, it } from "vitest";
import { secretsMatch } from "./constant-time";

describe("secretsMatch", () => {
  it("aceita segredo idêntico", () => {
    expect(secretsMatch("s3cr3t", "s3cr3t")).toBe(true);
  });

  it("recusa segredo diferente", () => {
    expect(secretsMatch("s3cr3t", "s3cr3T")).toBe(false);
  });

  it("não lança com tamanhos diferentes — timingSafeEqual cru lançaria", () => {
    expect(secretsMatch("curto", "um-segredo-bem-mais-longo")).toBe(false);
  });

  it("recusa ausente em vez de considerar vazio igual a vazio", () => {
    expect(secretsMatch(null, "s3cr3t")).toBe(false);
    expect(secretsMatch("s3cr3t", undefined)).toBe(false);
    expect(secretsMatch(null, null)).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
  });

  it("ignora espaço nas pontas, como o header pode chegar", () => {
    expect(secretsMatch(" s3cr3t ", "s3cr3t")).toBe(true);
  });
});
