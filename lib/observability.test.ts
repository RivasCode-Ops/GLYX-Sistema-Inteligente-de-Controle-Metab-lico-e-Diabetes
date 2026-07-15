import { describe, expect, it } from "vitest";
import { cronNeedsAlert } from "./observability";

describe("cronNeedsAlert", () => {
  it("alerta CGM com falhas", () => {
    expect(cronNeedsAlert("cgm-sync", { failed: 2, synced: 1 })).toBe(true);
  });

  it("não alerta CGM saudável", () => {
    expect(cronNeedsAlert("cgm-sync", { failed: 0, synced: 3 })).toBe(false);
  });

  it("alerta push quando todos os endpoints morreram", () => {
    expect(cronNeedsAlert("push-dispatch", { sent: 0, dead: 4, total: 4 })).toBe(true);
  });

  it("não alerta push com entregas parciais", () => {
    expect(cronNeedsAlert("push-dispatch", { sent: 3, dead: 1, total: 4 })).toBe(false);
  });

  it("alerta meal-suggest quando failed > 0", () => {
    expect(cronNeedsAlert("meal-suggest", { failed: 5, sent: 0 })).toBe(true);
  });
});
