import { describe, expect, it } from "vitest";
import { reportAge } from "./report-freshness";

const AGORA = new Date("2026-09-08T12:00:00Z");

function diasAtras(n: number): string {
  return new Date(AGORA.getTime() - n * 86_400_000).toISOString();
}

describe("reportAge", () => {
  it("o caso real que a auditoria pegou: score de 14 dias com 50 de idade", () => {
    // A última auditoria do usuário foi computada em 20/07 e a tela mostrava
    // "52/100 · Janela 14 dias" em destaque, sem nenhum aviso.
    const r = reportAge("2026-07-20T21:12:16Z", 14, AGORA);
    // 49 dias INTEIROS, não 50: de 20/07 21:12 a 08/09 12:00 faltam nove horas
    // para fechar o quinquagésimo. Dias inteiros para baixo, como no resto do
    // app — arredondar para cima inflaria a idade de todo relatório.
    expect(r.days).toBe(49);
    expect(r.stale).toBe(true);
    expect(r.warning).toContain("49 dias");
    expect(r.warning).toContain("gere um novo");
  });

  it("dentro da janela não avisa nada", () => {
    const r = reportAge(diasAtras(3), 14, AGORA);
    expect(r.stale).toBe(false);
    // Null é resposta: a tela não desenha aviso.
    expect(r.warning).toBeNull();
  });

  it("a régua é a janela coberta, não um número fixo de dias", () => {
    // Dez dias de idade: velho para um relatório de 7 dias, novo para um de 14.
    expect(reportAge(diasAtras(10), 7, AGORA).stale).toBe(true);
    expect(reportAge(diasAtras(10), 14, AGORA).stale).toBe(false);
  });

  it("a fronteira é passar a janela, não alcançá-la", () => {
    expect(reportAge(diasAtras(14), 14, AGORA).stale).toBe(false);
    expect(reportAge(diasAtras(15), 14, AGORA).stale).toBe(true);
  });

  it("sem janela declarada não afirma que envelheceu", () => {
    // Sem cobertura não há como dizer se o relatório ficou velho — e chutar
    // seria o mesmo tipo de número plausível e errado que o app recusa.
    expect(reportAge(diasAtras(90), 0, AGORA).stale).toBe(false);
    expect(reportAge(diasAtras(90), -1, AGORA).warning).toBeNull();
  });

  it("relatório do futuro não vira idade negativa", () => {
    const r = reportAge(new Date(AGORA.getTime() + 86_400_000), 14, AGORA);
    expect(r.days).toBe(0);
    expect(r.stale).toBe(false);
  });

  it("usa o mesmo vocabulário de idade da leitura de glicemia", () => {
    expect(reportAge(diasAtras(1), 14, AGORA).label).toBe("há 1 dia");
    expect(reportAge(diasAtras(2), 14, AGORA).label).toBe("há 2 dias");
  });
});
