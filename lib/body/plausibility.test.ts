import { describe, expect, it } from "vitest";
import { findImplausible, isSuspect, MAX_CM_PER_WEEK } from "./plausibility";
import type { BodyMeasurement } from "@/lib/body/fields";

function medicao(dia: string, campos: Partial<BodyMeasurement>): BodyMeasurement {
  return {
    id: `m-${dia}`,
    user_id: "u1",
    measured_on: dia,
    created_at: `${dia}T12:00:00Z`,
    ...campos,
  } as BodyMeasurement;
}

describe("findImplausible", () => {
  it("pega a oscilação real de peitoral: 110 → 100 em dois dias", () => {
    const h = [
      medicao("2026-07-26", { chest_cm: 110 }),
      medicao("2026-07-28", { chest_cm: 100 }),
    ];
    const s = findImplausible(h, ["chest_cm"]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ from: 110, to: 100, delta: -10, days: 2 });
  });

  it("pega os 28 cm de ombros em oito dias", () => {
    const h = [
      medicao("2026-07-28", { shoulders_cm: 112 }),
      medicao("2026-08-05", { shoulders_cm: 140 }),
      medicao("2026-08-10", { shoulders_cm: 110 }),
    ];
    // As DUAS transições são impossíveis — subir 28 e cair 30.
    expect(findImplausible(h, ["shoulders_cm"])).toHaveLength(2);
  });

  it("deixa passar progresso humano rápido", () => {
    // 1,5 cm de braço em quatro semanas é ganho muito bom, e tem que passar.
    const h = [
      medicao("2026-07-01", { arm_right_flexed_cm: 34 }),
      medicao("2026-07-29", { arm_right_flexed_cm: 35.5 }),
    ];
    expect(findImplausible(h, ["arm_right_flexed_cm"])).toEqual([]);
  });

  it("em intervalo curto, o piso de ruído da fita protege medição correta", () => {
    // 0,8 cm em um dia: abaixo da taxa semanal seria reprovado, mas está dentro
    // do erro da própria fita — reprovar aqui puniria quem mede certo.
    const h = [
      medicao("2026-07-01", { chest_cm: 100 }),
      medicao("2026-07-02", { chest_cm: 100.8 }),
    ];
    expect(findImplausible(h, ["chest_cm"])).toEqual([]);
  });

  it("peso tem régua própria, mais folgada que a das circunferências", () => {
    // 2 kg em uma semana é plausível (retenção, balança diferente); 2 cm de
    // peitoral na mesma semana está no limite.
    const peso = [
      medicao("2026-07-01", { weight_kg: 78 }),
      medicao("2026-07-08", { weight_kg: 80 }),
    ];
    expect(findImplausible(peso, ["weight_kg"])).toEqual([]);

    const peito = [
      medicao("2026-07-01", { chest_cm: 100 }),
      medicao("2026-07-08", { chest_cm: 105 }),
    ];
    expect(findImplausible(peito, ["chest_cm"])).toHaveLength(1);
  });

  it("intervalo longo tolera mais, porque a taxa acumula", () => {
    // 6 cm em seis meses é lento; 6 cm em uma semana é impossível.
    const lento = [
      medicao("2026-01-01", { chest_cm: 100 }),
      medicao("2026-07-01", { chest_cm: 106 }),
    ];
    expect(findImplausible(lento, ["chest_cm"])).toEqual([]);
    expect(MAX_CM_PER_WEEK).toBe(2);
  });

  it("campo ausente numa medição não quebra a cadeia", () => {
    const h = [
      medicao("2026-07-01", { chest_cm: 100 }),
      medicao("2026-07-05", { waist_cm: 90 }),
      medicao("2026-07-10", { chest_cm: 101 }),
    ];
    // Compara 100 com 101 pulando a medição sem peitoral — nove dias, tudo bem.
    expect(findImplausible(h, ["chest_cm"])).toEqual([]);
  });

  it("uma medição só não produz suspeita", () => {
    expect(findImplausible([medicao("2026-07-01", { chest_cm: 100 })], ["chest_cm"])).toEqual([]);
  });
});

describe("isSuspect", () => {
  it("marca os dois lados da transição impossível", () => {
    const h = [
      medicao("2026-07-26", { chest_cm: 110 }),
      medicao("2026-07-28", { chest_cm: 100 }),
    ];
    const s = findImplausible(h, ["chest_cm"]);
    // Não dá para saber qual dos dois é o errado, então nenhum dos dois serve
    // para calcular meta — é o que impede "faltam 14 cm, faça 8 séries".
    expect(isSuspect(s, "chest_cm", 110)).toBe(true);
    expect(isSuspect(s, "chest_cm", 100)).toBe(true);
    expect(isSuspect(s, "chest_cm", 105)).toBe(false);
    expect(isSuspect(s, "waist_cm", 110)).toBe(false);
  });
});
