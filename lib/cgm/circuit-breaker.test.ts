import { describe, expect, it } from "vitest";
import {
  backoffMs,
  breakerAfterFailure,
  breakerAfterSuccess,
  classifyCgmError,
  isCircuitOpen,
} from "./circuit-breaker";

describe("classifyCgmError", () => {
  it("classifica auth e rate limit", () => {
    expect(classifyCgmError("E-mail ou senha do LibreLinkUp incorretos.")).toBe("auth");
    expect(classifyCgmError("A Abbott limitou as tentativas por alguns minutos.")).toBe(
      "rate_limit"
    );
  });

  it("classifica client_version e crypto", () => {
    expect(classifyCgmError("A Abbott exige uma versão mais nova do cliente LibreLinkUp")).toBe(
      "client_version"
    );
    expect(classifyCgmError("Unsupported state or unable to authenticate data")).toBe("crypto");
  });
});

describe("breakerAfterFailure / success", () => {
  it("abre circuito e incrementa falhas", () => {
    const t0 = Date.parse("2026-07-15T12:00:00.000Z");
    const { state, kind } = breakerAfterFailure({ consecutive_failures: 0 }, "LibreLinkUp indisponível (HTTP 503).", t0);
    expect(kind).toBe("unavailable");
    expect(state.consecutive_failures).toBe(1);
    expect(state.circuit_open_until).toBeTruthy();
    expect(isCircuitOpen(state, t0 + 1000)).toBe(true);
  });

  it("auth abre por pelo menos 1h", () => {
    expect(backoffMs(1, "auth")).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(backoffMs(2, "auth")).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
  });

  it("sucesso zera o breaker", () => {
    expect(breakerAfterSuccess()).toEqual({
      consecutive_failures: 0,
      circuit_open_until: null,
      last_error_kind: null,
    });
  });

  it("circuito fecha depois do until", () => {
    const until = "2026-07-15T13:00:00.000Z";
    expect(isCircuitOpen({ circuit_open_until: until }, Date.parse(until) - 1)).toBe(true);
    expect(isCircuitOpen({ circuit_open_until: until }, Date.parse(until) + 1)).toBe(false);
  });
});
