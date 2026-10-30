import { describe, expect, it } from "vitest";
import { clientePaginadoFalso, leituras } from "@/lib/queries/fake-paginated-client";
import { describeGlucoseAverage, glucoseAverage } from "./glucose-average";

const AGORA = new Date(Date.UTC(2026, 9, 10));
const INICIO_JANELA = AGORA.getTime() - 14 * 86_400_000;

describe("glucoseAverage", () => {
  it("usa a janela inteira, não as mil primeiras leituras", async () => {
    // 2.600 leituras: ~14 dias de Libre. As mil primeiras têm média 124,5;
    // a janela toda, outra. O defeito antigo devolvia a das mil.
    const linhas = leituras(2600, "u1", INICIO_JANELA + 60_000);
    const { cliente } = clientePaginadoFalso({ glucose_readings: linhas });
    const g = await glucoseAverage(cliente, "u1", 14, AGORA);
    const esperada = Math.round(
      linhas.reduce((s, l) => s + (l.value_mg_dl as number), 0) / linhas.length
    );
    expect(g).toEqual({ media: esperada, leituras: 2600, completo: true });
  });

  it("leitura parcial não vira média", async () => {
    const { cliente } = clientePaginadoFalso(
      { glucose_readings: leituras(2600, "u1", INICIO_JANELA + 60_000) },
      { falharNaPagina: 1 }
    );
    const g = await glucoseAverage(cliente, "u1", 14, AGORA);
    expect(g.completo).toBe(false);
    expect(g.media).toBeNull();
    expect(describeGlucoseAverage(g)).toMatch(/não calculada/);
  });

  it("sem leitura na janela diz isso, não 0", async () => {
    const { cliente } = clientePaginadoFalso({ glucose_readings: [] });
    const g = await glucoseAverage(cliente, "u1", 14, AGORA);
    expect(g).toEqual({ media: null, leituras: 0, completo: true });
    expect(describeGlucoseAverage(g)).toBe("Sem leituras recentes de glicemia.");
  });
});
