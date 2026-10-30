import { describe, expect, it } from "vitest";
import type { UnifiedHealthSnapshot } from "@/lib/health/types";
import { MAX_DAYS_PER_REQUEST, checkHealthSnapshots } from "./snapshot-limits";

const AGORA = new Date("2026-10-30T15:00:00Z");

function dia(o: Partial<UnifiedHealthSnapshot> = {}): UnifiedHealthSnapshot {
  return {
    snapshotDate: "2026-10-29",
    source: "google_fit",
    steps: 8000,
    sleepHours: 7.5,
    restingHr: 62,
    activeCalories: 450,
    stressScore: null,
    metadata: null,
    ...o,
  };
}

describe("checkHealthSnapshots (GLYX-21)", () => {
  it("aceita um dia plausível", () => {
    expect(checkHealthSnapshots([dia()], AGORA)).toEqual({
      ok: true,
      snapshots: [dia()],
      duplicadosIgnorados: 0,
    });
  });

  it("recusa 'mock' — o caso que encheu a série real de dado falso", () => {
    const r = checkHealthSnapshots([dia({ source: "mock" })], AGORA);
    expect(r).toMatchObject({ ok: false });
  });

  it.each([
    ["sono negativo", { sleepHours: -5 }],
    ["mais de 24 h de sono", { sleepHours: 30 }],
    ["dois milhões de passos", { steps: 2_000_000 }],
    ["FC de repouso 0", { restingHr: 0 }],
    ["caloria NaN", { activeCalories: Number.NaN }],
  ])("recusa %s", (_, o) => {
    expect(checkHealthSnapshots([dia(o)], AGORA).ok).toBe(false);
  });

  it("campo ausente é aceito — dia sem medição de sono não é erro", () => {
    expect(checkHealthSnapshots([dia({ sleepHours: null, restingHr: null })], AGORA).ok).toBe(true);
  });

  it.each(["2026-02-30", "29/10/2026", "", "2026-13-01"])("recusa data inválida %j", (d) => {
    expect(checkHealthSnapshots([dia({ snapshotDate: d })], AGORA).ok).toBe(false);
  });

  it("aceita amanhã (fuso) e recusa depois disso", () => {
    expect(checkHealthSnapshots([dia({ snapshotDate: "2026-10-31" })], AGORA).ok).toBe(true);
    expect(checkHealthSnapshots([dia({ snapshotDate: "2026-11-01" })], AGORA).ok).toBe(false);
  });

  it("mesmo dia e fonte repetidos: fica o último, e o upsert não quebra", () => {
    const r = checkHealthSnapshots([dia({ steps: 1000 }), dia({ steps: 9000 })], AGORA);
    expect(r.ok && r.snapshots).toEqual([dia({ steps: 9000 })]);
    expect(r.ok && r.duplicadosIgnorados).toBe(1);
  });

  it("recusa envio acima do limite de dias", () => {
    const muitos = Array.from({ length: MAX_DAYS_PER_REQUEST + 1 }, () => dia());
    expect(checkHealthSnapshots(muitos, AGORA).ok).toBe(false);
  });
});
