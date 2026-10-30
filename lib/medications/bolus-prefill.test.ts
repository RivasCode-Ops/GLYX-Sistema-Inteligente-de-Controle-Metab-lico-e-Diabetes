import { describe, expect, it } from "vitest";
import { bolusGlucosePrefill } from "./bolus-prefill";

const AGORA = new Date("2026-10-30T15:00:00Z");
function minutosAtras(m: number) {
  return new Date(AGORA.getTime() - m * 60000).toISOString();
}

describe("bolusGlucosePrefill", () => {
  it("sem leitura, não inventa valor", () => {
    expect(bolusGlucosePrefill(null, AGORA)).toEqual({ value: null, latest: null });
  });

  it("pré-preenche leitura de até 20 min e mostra a idade", () => {
    const r = bolusGlucosePrefill({ value: 147, recordedAt: minutosAtras(5) }, AGORA);
    expect(r.value).toBe(147);
    expect(r.latest).toEqual({ value: 147, ageLabel: "há 5 min", freshness: "fresh" });
  });

  it("leitura de 21 min já não entra no campo", () => {
    const r = bolusGlucosePrefill({ value: 147, recordedAt: minutosAtras(21) }, AGORA);
    expect(r.value).toBeNull();
    expect(r.latest?.freshness).toBe("recent");
  });

  it("o caso que originou isto: leitura de semanas atrás não vira glicemia atual", () => {
    const r = bolusGlucosePrefill({ value: 116, recordedAt: "2026-10-09T15:00:00Z" }, AGORA);
    expect(r.value).toBeNull();
    expect(r.latest).toEqual({ value: 116, ageLabel: "há 21 dias", freshness: "stale" });
  });
});
