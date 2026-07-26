import { describe, expect, it } from "vitest";
import { computeComposition } from "./composition";
import { computeDeltas, computeProgress, progressSummary } from "./progress";
import type { BodyMeasurement } from "./fields";

const PROFILE = { sex: "m" as const, ageYears: 40, heightCm: 180 };

function withComposition(m: BodyMeasurement) {
  return { measurement: m, composition: computeComposition({ ...PROFILE, measurement: m }) };
}

describe("computeDeltas", () => {
  it("compara só o que existe nas duas datas", () => {
    const deltas = computeDeltas(
      { measured_on: "2026-05-01", waist_cm: 91, chest_cm: 110 },
      { measured_on: "2026-07-01", waist_cm: 89, thigh_right_cm: 55 }
    );
    expect(deltas.map((d) => d.key)).toEqual(["waist_cm"]);
    expect(deltas[0].delta).toBe(-2);
    expect(deltas[0].direction).toBe("down");
  });

  it("marca variação dentro do erro de medição como estável", () => {
    const deltas = computeDeltas(
      { measured_on: "2026-05-01", chest_cm: 110 },
      { measured_on: "2026-07-01", chest_cm: 110.5 }
    );
    expect(deltas[0].direction).toBe("stable");
    expect(deltas[0].withinNoise).toBe(true);
  });
});

describe("computeProgress", () => {
  it("peso sobe e cintura desce → recomposição", () => {
    const p = computeProgress(
      withComposition({ measured_on: "2026-05-01", weight_kg: 78, waist_cm: 91, neck_cm: 39 }),
      withComposition({ measured_on: "2026-07-01", weight_kg: 79.2, waist_cm: 89, neck_cm: 39 })
    );
    expect(p.verdict.id).toBe("recomposicao");
    expect(p.weightDeltaKg).toBe(1.2);
    expect(p.waistDeltaCm).toBe(-2);
  });

  it("peso sobe e cintura sobe → ganho com gordura", () => {
    const p = computeProgress(
      withComposition({ measured_on: "2026-05-01", weight_kg: 78, waist_cm: 89, neck_cm: 39 }),
      withComposition({ measured_on: "2026-07-01", weight_kg: 81, waist_cm: 93, neck_cm: 39 })
    );
    expect(p.verdict.id).toBe("ganho_com_gordura");
    expect(p.verdict.tone).toBe("atencao");
  });

  it("peso e cintura caem → perda de gordura", () => {
    const p = computeProgress(
      withComposition({ measured_on: "2026-05-01", weight_kg: 85, waist_cm: 98, neck_cm: 40 }),
      withComposition({ measured_on: "2026-07-01", weight_kg: 82, waist_cm: 94, neck_cm: 40 })
    );
    expect(p.verdict.id).toBe("perda_de_gordura");
  });

  it("tudo dentro do ruído → estável, não evolução", () => {
    const p = computeProgress(
      withComposition({ measured_on: "2026-05-01", weight_kg: 80, waist_cm: 90, neck_cm: 39 }),
      withComposition({ measured_on: "2026-07-01", weight_kg: 80.3, waist_cm: 90.5, neck_cm: 39 })
    );
    expect(p.verdict.id).toBe("estavel");
  });

  it("datas invertidas são reordenadas em vez de virar evolução negativa", () => {
    const older = withComposition({ measured_on: "2026-05-01", weight_kg: 78, waist_cm: 91, neck_cm: 39 });
    const newer = withComposition({ measured_on: "2026-07-01", weight_kg: 80, waist_cm: 89, neck_cm: 39 });
    const p = computeProgress(newer, older);
    expect(p.fromDate).toBe("2026-05-01");
    expect(p.toDate).toBe("2026-07-01");
    expect(p.weightDeltaKg).toBe(2);
  });

  it("split massa magra/gordura só sai com o mesmo método nas duas datas", () => {
    const comDobras = withComposition({
      measured_on: "2026-07-01",
      weight_kg: 80,
      waist_cm: 89,
      neck_cm: 39,
      skf_chest_mm: 12,
      skf_abdominal_mm: 20,
      skf_thigh_mm: 14,
    });
    const soFita = withComposition({
      measured_on: "2026-05-01",
      weight_kg: 78,
      waist_cm: 91,
      neck_cm: 39,
    });
    const misto = computeProgress(soFita, comDobras);
    expect(misto.leanDeltaKg).toBeNull();
    expect(misto.splitIsEstimated).toBe(false);

    const dobrasAntes = withComposition({
      measured_on: "2026-05-01",
      weight_kg: 78,
      waist_cm: 91,
      neck_cm: 39,
      skf_chest_mm: 14,
      skf_abdominal_mm: 24,
      skf_thigh_mm: 16,
    });
    const mesmoMetodo = computeProgress(dobrasAntes, comDobras);
    expect(mesmoMetodo.leanDeltaKg).not.toBeNull();
    expect(mesmoMetodo.fatDeltaKg).not.toBeNull();
  });

  it("resumo traz o formato pedido: peso, massa magra e cintura", () => {
    const p = computeProgress(
      withComposition({
        measured_on: "2026-05-01",
        weight_kg: 78,
        waist_cm: 91,
        neck_cm: 39,
        skf_chest_mm: 14,
        skf_abdominal_mm: 24,
        skf_thigh_mm: 16,
      }),
      withComposition({
        measured_on: "2026-07-01",
        weight_kg: 79.2,
        waist_cm: 89,
        neck_cm: 39,
        skf_chest_mm: 12,
        skf_abdominal_mm: 21,
        skf_thigh_mm: 14,
      })
    );
    const summary = progressSummary(p);
    expect(summary).toContain("peso +1,2 kg");
    expect(summary).toContain("massa magra estimada");
    expect(summary).toContain("cintura -2 cm");
  });
});
