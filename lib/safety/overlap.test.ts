import { describe, expect, it } from "vitest";
import { seedMechanisms } from "./__fixtures__/read-seed";
import { buildOverlapReport, type ScheduledDose } from "./overlap";

const MECHANISMS = seedMechanisms();

function dose(
  canonical: string,
  name: string,
  at: string,
  durationHours: number,
  source: ScheduledDose["source"] = "reminder",
  dayOffset?: number
): ScheduledDose {
  return { canonical, name, at, durationHours, source, dayOffset };
}

/**
 * Caso de referência.
 *
 * Corrigido em 07/09/2026 de 4 para 5 mecanismos. O 4 vinha de contar só as
 * doses do próprio dia: às 15:00, a Lantus das 22:00 "ainda não foi tomada".
 * Mas a Lantus dura 24 h — a de ONTEM está ativa a tarde inteira de hoje.
 * Descartá-la fazia a janela da tarde nunca contar insulina basal, que é
 * justamente a que está ativa 24 h por dia e justamente a janela em que a
 * hipoglicemia acontece.
 *
 * Lantus e Glyxambi são regime diário (`reminder`); a Fiasp é correção avulsa
 * (`insulin_log`), e por isso NÃO é projetada para trás.
 */
const DIA = [
  dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
  dose("inibidor_sglt2", "Glyxambi", "12:30", 24),
  dose("inibidor_dpp4", "Glyxambi", "12:30", 24),
  dose("berberina", "Berberina", "15:00", 8),
  dose("insulina_basal", "Lantus", "22:00", 24),
];

describe("sobreposição de janelas", () => {
  const r = buildOverlapReport(DIA, MECHANISMS);

  it("o pico é 15:00–17:00 com 5 mecanismos", () => {
    expect(r.peak).not.toBeNull();
    expect(r.peak?.from).toBe("15:00");
    expect(r.peak?.to).toBe("17:00");
    expect(r.peak?.mechanismCount).toBe(5);
  });

  it("a insulina basal do dia anterior está entre eles", () => {
    expect(r.peak?.mechanisms).toEqual([
      "glicosuria_renal",
      "incretina",
      "insulina_exogena_basal",
      "insulina_exogena_rapida",
      "sensibilizador_amp",
    ]);
  });

  it("nenhuma janela reportada tem menos de 3", () => {
    for (const w of r.windows) expect(w.mechanismCount).toBeGreaterThanOrEqual(3);
  });
});

/**
 * A regressão que originou a correção: sem projetar a dose do dia anterior, a
 * basal desaparece de toda janela antes do horário em que ela é tomada.
 */
describe("projeção da dose anterior", () => {
  it("basal de 24 h tomada às 22:00 conta na tarde do dia seguinte", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_basal", "Lantus", "22:00", 24),
        dose("inibidor_sglt2", "Jardiance", "08:00", 24),
        dose("metformina", "Glifage", "08:00", 12),
      ],
      MECHANISMS
    );
    // Às 15:00 a Lantus de HOJE ainda não foi tomada. A de ontem está ativa, e
    // é ela que a versão anterior descartava.
    const asQuinze = r.windows.find((w) => w.from <= "15:00" && w.to > "15:00");
    expect(asQuinze?.mechanisms).toContain("insulina_exogena_basal");
    expect(asQuinze?.mechanismCount).toBe(3);
  });

  it("aplicação avulsa NÃO é repetida como se fosse diária", () => {
    // Uma correção de insulina rápida ontem às 12:00 não significa que houve
    // outra hoje. Projetá-la inventaria dose que não aconteceu.
    const r = buildOverlapReport(
      [
        dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
        dose("inibidor_sglt2", "Jardiance", "12:00", 24),
        dose("inibidor_dpp4", "Januvia", "12:00", 24),
      ],
      MECHANISMS
    );
    const cedo = r.windows.find((w) => w.from === "00:00");
    expect(cedo?.mechanisms ?? []).not.toContain("insulina_exogena_rapida");
  });

  it("registro real de dia anterior entra pelo dayOffset", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_basal", "Lantus", "22:00", 24, "insulin_log", -1),
        dose("inibidor_sglt2", "Jardiance", "08:00", 24),
        dose("berberina", "Berberina", "09:00", 8),
      ],
      MECHANISMS
    );
    const manha = r.windows.find((w) => w.from <= "10:00" && w.to > "10:00");
    expect(manha?.mechanisms).toContain("insulina_exogena_basal");
  });

  /**
   * Fixar 48 h cobriria a basal e continuaria perdendo o GLP-1 semanal, que
   * tem 168 h no seed — o mesmo defeito, uma substância adiante.
   */
  it("GLP-1 semanal continua ativo dias depois da aplicação", () => {
    const r = buildOverlapReport(
      [
        dose("agonista_glp1", "Ozempic", "10:00", 168),
        dose("insulina_basal", "Lantus", "22:00", 24),
        dose("berberina", "Berberina", "09:00", 8),
      ],
      MECHANISMS
    );
    const manha = r.windows.find((w) => w.from <= "10:00" && w.to > "10:00");
    expect(manha?.mechanisms).toContain("incretina");
  });
});

describe("o que fica de fora do cálculo", () => {
  it("item sem horário aparece em unscheduled e não altera o pico", () => {
    const semHorario = dose("gymnema", "Gymnema", "", 8);
    const r = buildOverlapReport([...DIA, semHorario], MECHANISMS);
    expect(r.unscheduled).toContain("Gymnema");
    expect(r.peak?.mechanismCount).toBe(5);
    expect(r.peak?.from).toBe("15:00");
  });

  it("item sem duração aparece em unscheduled", () => {
    const r = buildOverlapReport([dose("berberina", "Berberina", "15:00", 0)], MECHANISMS);
    expect(r.unscheduled).toEqual(["Berberina"]);
    expect(r.peak).toBeNull();
  });

  it("horário malformado não é engolido em silêncio", () => {
    const r = buildOverlapReport([dose("berberina", "Berberina", "25:99", 8)], MECHANISMS);
    expect(r.unscheduled).toEqual(["Berberina"]);
  });

  it("substância sem mecanismo hipoglicemiante conhecido fica de fora", () => {
    const r = buildOverlapReport([dose("estatina", "Sinvastatina", "22:00", 24)], MECHANISMS);
    expect(r.unscheduled).toEqual(["Sinvastatina"]);
  });
});

describe("limiar de reporte", () => {
  it("janela com 2 mecanismos não é reportada", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
        dose("berberina", "Berberina", "12:00", 8),
      ],
      MECHANISMS
    );
    expect(r.windows).toEqual([]);
    expect(r.peak).toBeNull();
  });

  it("duas substâncias da mesma via não somam", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
        dose("insulina_basal", "Lantus", "12:00", 24, "insulin_log"),
        dose("berberina", "Berberina", "12:00", 8),
        dose("gymnema", "Gymnema", "12:00", 8),
        dose("canela_cassia", "Canela", "12:00", 8),
      ],
      MECHANISMS
    );
    // basal + rápida + sensibilizador = 3. Berberina, gymnema e canela são a
    // mesma via e contam uma vez.
    expect(r.peak?.mechanismCount).toBe(3);
  });
});

describe("empate de pico", () => {
  it("resolve pelo mais cedo", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_basal", "Lantus", "06:00", 24, "insulin_log"),
        dose("inibidor_sglt2", "Jardiance", "06:00", 24, "insulin_log"),
        dose("metformina", "Glifage", "06:00", 12, "insulin_log"),
        dose("inibidor_dpp4", "Januvia", "06:00", 24, "insulin_log"),
      ],
      MECHANISMS
    );
    expect(r.peak?.from).toBe("06:00");
  });
});

describe("recorte no dia", () => {
  it("a janela nunca passa da meia-noite", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_basal", "Lantus", "22:00", 24, "insulin_log"),
        dose("inibidor_sglt2", "Jardiance", "22:00", 24, "insulin_log"),
        dose("inibidor_dpp4", "Januvia", "22:00", 24, "insulin_log"),
      ],
      MECHANISMS
    );
    expect(r.peak?.from).toBe("22:00");
    expect(r.peak?.to).toBe("24:00");
  });
});
