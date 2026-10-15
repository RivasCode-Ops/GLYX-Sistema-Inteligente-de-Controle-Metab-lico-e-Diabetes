import { describe, expect, it } from "vitest";
import { computePeriodAdherence } from "./adherence";
import { consolidarRegistrosDeDose, contarTomadas, marcacaoDoRegistro } from "./tomadas";

// Dados SINTÉTICOS. Um item com dose às 08:00, de 14/10/2026 (São Paulo, UTC-3).
const TZ = "America/Sao_Paulo";
const SP = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h + 3, m)).toISOString();
const MED = "med-sintetico";
const tomada = (taken_at: string, extra: Record<string, unknown> = {}) => ({ medication_id: MED, taken_at, confirmed: true, ...extra });
const adesao = (logs: { taken_at: string }[]) => computePeriodAdherence(["08:00"], logs, TZ, "2026-10-14", "2026-10-14");

describe("número de tomadas registradas", () => {
  it("repetição IDÊNTICA do histórico antigo conta uma vez", () => {
    expect(contarTomadas([tomada(SP(8)), tomada(SP(8)), tomada(SP(8))])).toBe(1);
  });
  it("instantes diferentes contam todos — não são fundidos por estarem na mesma janela", () => {
    expect(contarTomadas([tomada(SP(8)), tomada(SP(13))])).toBe(2);
  });
  it("tomada adicional conta como tomada", () => {
    expect(contarTomadas([tomada(SP(8)), tomada(SP(13), { adherence_status: "adicional", scheduled_for: null })])).toBe(2);
  });
  it("dose pulada não é tomada", () => {
    expect(contarTomadas([tomada(SP(8), { confirmed: false })])).toBe(0);
  });
});

describe("adesão por janela", () => {
  it("uma tomada na janela: 1 de 1, nada a mais", () => {
    expect(adesao([tomada(SP(8, 5))])).toEqual({ expectedDoses: 1, takenDoses: 1, unmatchedLogs: 0, skippedDoses: 0 });
  });
  it("repetição idêntica antiga NÃO aparece como tomada a mais (era o efeito das 22 linhas da D14)", () => {
    expect(adesao([tomada(SP(8, 5)), tomada(SP(8, 5)), tomada(SP(8, 5))])).toEqual({ expectedDoses: 1, takenDoses: 1, unmatchedLogs: 0, skippedDoses: 0 });
  });
  it("tomada ADICIONAL aparece como a mais — a adesão não a esconde para ficar em 100%", () => {
    expect(adesao([tomada(SP(8, 5)), tomada(SP(13), { adherence_status: "adicional" })])).toEqual({
      expectedDoses: 1,
      takenDoses: 1,
      unmatchedLogs: 1,
      skippedDoses: 0,
    });
  });
  it("CORREÇÃO é uma linha só (com o horário corrigido): 1 de 1, nada a mais", () => {
    expect(adesao([tomada(SP(9, 30), { correcoes: [{ taken_at_anterior: SP(8) }] })])).toEqual({
      expectedDoses: 1,
      takenDoses: 1,
      unmatchedLogs: 0,
      skippedDoses: 0,
    });
  });
});

describe("exibição no histórico", () => {
  it("funde só repetições idênticas e diz quantas", () => {
    const { registros, repeticoesIdenticas } = consolidarRegistrosDeDose([tomada(SP(8)), tomada(SP(8)), tomada(SP(13))]);
    expect(registros).toHaveLength(2);
    expect(repeticoesIdenticas).toBe(1);
  });
  it("marca o que cada registro é", () => {
    expect(marcacaoDoRegistro(tomada(SP(8)))).toBeNull();
    expect(marcacaoDoRegistro(tomada(SP(13), { adherence_status: "adicional" }))).toBe("tomada adicional");
    expect(marcacaoDoRegistro(tomada(SP(9), { correcoes: [{}] }))).toBe("horário corrigido");
    expect(marcacaoDoRegistro(tomada(SP(8), { confirmed: false }))).toBe("pulada");
  });
  it("antes da migration (sem `correcoes`), a tomada aparece sem marcação, sem erro", () => {
    expect(marcacaoDoRegistro({ taken_at: SP(8) })).toBeNull();
  });
});

describe("relatório médico", () => {
  // O relatório usa computePeriodAdherence: `loggedDoses` = tomadas na janela;
  // `extraLogs` = "registros que não casaram (dose extra ou duplicidade)".
  it("com repetições antigas e uma tomada adicional: 1 tomada na janela e 1 a mais (a adicional), não 3", () => {
    const r = adesao([tomada(SP(8, 5)), tomada(SP(8, 5)), tomada(SP(13), { adherence_status: "adicional" })]);
    expect(r.takenDoses).toBe(1);
    expect(r.unmatchedLogs).toBe(1);
  });
});
