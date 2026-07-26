import { describe, expect, it } from "vitest";
import { detectProviderOutage, looksLikeProviderIssue, type SyncFailure } from "./outage";

const LIBRE = "librelinkup";

function fail(userId: string, kind: SyncFailure["kind"], provider = LIBRE): SyncFailure {
  return { userId, kind, provider };
}

describe("detectProviderOutage", () => {
  it("rodada sem falha não é quebra", () => {
    const v = detectProviderOutage([], LIBRE, 3);
    expect(v.isOutage).toBe(false);
    expect(v.affectedUsers).toBe(0);
  });

  it("client_version num único usuário já é quebra do provedor", () => {
    // Nenhuma ação do usuário resolve; esperar um segundo só atrasaria o
    // diagnóstico numa base com um piloto só.
    const v = detectProviderOutage([fail("u1", "client_version")], LIBRE, 1);
    expect(v.isOutage).toBe(true);
    expect(v.kind).toBe("client_version");
  });

  it("senha errada NUNCA vira quebra do provedor, nem em vários usuários", () => {
    const v = detectProviderOutage(
      [fail("u1", "auth"), fail("u2", "auth"), fail("u3", "auth")],
      LIBRE,
      3
    );
    expect(v.isOutage).toBe(false);
  });

  it("chave de criptografia também é individual", () => {
    const v = detectProviderOutage([fail("u1", "crypto"), fail("u2", "crypto")], LIBRE, 2);
    expect(v.isOutage).toBe(false);
  });

  it("indisponibilidade em metade ou mais das conexões é quebra", () => {
    const v = detectProviderOutage(
      [fail("u1", "unavailable"), fail("u2", "unavailable")],
      LIBRE,
      4
    );
    expect(v.isOutage).toBe(true);
    expect(v.kind).toBe("unavailable");
    expect(v.affectedUsers).toBe(2);
  });

  it("um usuário isolado com rede caída não é quebra", () => {
    const v = detectProviderOutage([fail("u1", "unavailable")], LIBRE, 4);
    expect(v.isOutage).toBe(false);
  });

  it("minoria falhando não é quebra, mesmo com 2 usuários", () => {
    const v = detectProviderOutage(
      [fail("u1", "unavailable"), fail("u2", "unavailable")],
      LIBRE,
      10
    );
    expect(v.isOutage).toBe(false);
  });

  it("o mesmo usuário falhando duas vezes conta uma vez só", () => {
    const v = detectProviderOutage(
      [fail("u1", "unavailable"), fail("u1", "unavailable")],
      LIBRE,
      2
    );
    expect(v.affectedUsers).toBe(1);
    expect(v.isOutage).toBe(false);
  });

  it("ignora falhas de outro provedor", () => {
    const v = detectProviderOutage(
      [fail("u1", "unavailable", "dexcom"), fail("u2", "unavailable", "dexcom")],
      LIBRE,
      2
    );
    expect(v.isOutage).toBe(false);
    expect(v.affectedUsers).toBe(0);
  });

  it("mistura de senha errada com indisponibilidade classifica pela predominante", () => {
    const v = detectProviderOutage(
      [fail("u1", "auth"), fail("u2", "unavailable"), fail("u3", "unavailable")],
      LIBRE,
      4
    );
    expect(v.isOutage).toBe(true);
    expect(v.kind).toBe("unavailable");
  });
});

describe("looksLikeProviderIssue", () => {
  it("aponta problema do provedor só nos tipos que o usuário não resolve", () => {
    expect(looksLikeProviderIssue("client_version")).toBe(true);
    expect(looksLikeProviderIssue("unavailable")).toBe(true);
    expect(looksLikeProviderIssue("auth")).toBe(false);
    expect(looksLikeProviderIssue("crypto")).toBe(false);
    expect(looksLikeProviderIssue(null)).toBe(false);
    expect(looksLikeProviderIssue(undefined)).toBe(false);
  });
});
