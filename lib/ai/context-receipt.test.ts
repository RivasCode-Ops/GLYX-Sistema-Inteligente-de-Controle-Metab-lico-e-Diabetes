import { describe, expect, it } from "vitest";
import {
  RECEIPT_KEYS,
  buildContextReceipt,
  divergenciaAlimentacao,
  divergenciaExercicio,
  divergenciaInsulina,
  divergenciaMedicacao,
  renderContextReceipt,
  type FieldInput,
  type ReceiptKey,
} from "./context-receipt";

const JANELA = { from: "2026-09-07T03:00:00.000Z", to: "2026-09-08T02:59:59.999Z" };
const MOMENTO = new Date("2026-09-07T17:32:11.000Z");

function campo(over: Partial<FieldInput> = {}): FieldInput {
  return { count: 0, summary: null, window: JANELA, ...over };
}

/**
 * Dataset fixo, com contagens conhecidas. O snapshot é gravado a partir DAQUI,
 * nunca do banco real: snapshot tirado de dados vivos passa a mudar sozinho e
 * deixa de detectar mudança de comportamento.
 */
function fixture(): Record<ReceiptKey, FieldInput> {
  return {
    glicemia: campo({ count: 12, summary: "ultima 125 mg/dL as 14:05" }),
    alimentacao: campo({ count: 0 }),
    exercicio: campo({
      count: 1,
      summary: "1 sessao",
      divergence: divergenciaExercicio({ sessions: 1, totalMinutes: 0 }),
    }),
    medicacao: campo({ count: 4, summary: "2 med, 2 supplement" }),
    insulina: campo({ count: 3, summary: "3 registros ultimos 7d" }),
    sono: campo({ count: 0 }),
    alertas_48h: campo({ count: 0, zeroConfirmed: true, summary: "0 alertas" }),
    mapa_risco: campo({ count: 1, summary: "score de 06/09" }),
  };
}

describe("completude", () => {
  it("o recibo tem as oito chaves obrigatórias, sempre", () => {
    const vazio = Object.fromEntries(RECEIPT_KEYS.map((k) => [k, campo()])) as Record<
      ReceiptKey,
      FieldInput
    >;
    const r = buildContextReceipt("u1", vazio, MOMENTO);
    expect(r.fields.map((f) => f.key)).toEqual([...RECEIPT_KEYS]);
    expect(r.fields).toHaveLength(8);
  });

  it("banco vazio não some com campo nenhum", () => {
    const vazio = Object.fromEntries(RECEIPT_KEYS.map((k) => [k, campo()])) as Record<
      ReceiptKey,
      FieldInput
    >;
    const r = buildContextReceipt("u1", vazio, MOMENTO);
    expect(r.missing).toEqual([...RECEIPT_KEYS]);
  });
});

describe("os três estados", () => {
  it("fonte sem linhas é nao_registrado, com count 0 e summary null", () => {
    const r = buildContextReceipt("u1", fixture(), MOMENTO);
    const alimentacao = r.fields.find((f) => f.key === "alimentacao")!;
    expect(alimentacao.state).toBe("nao_registrado");
    expect(alimentacao.count).toBe(0);
    expect(alimentacao.summary).toBeNull();
  });

  it("ausência explícita é zero_confirmado, e é fato", () => {
    const r = buildContextReceipt("u1", fixture(), MOMENTO);
    const alertas = r.fields.find((f) => f.key === "alertas_48h")!;
    expect(alertas.state).toBe("zero_confirmado");
    expect(alertas.count).toBe(0);
    expect(alertas.summary).toBe("0 alertas");
  });

  it("nunca existe nao_registrado com count > 0", () => {
    const entradas = fixture();
    entradas.sono = campo({ count: 5, summary: "5 noites" });
    const r = buildContextReceipt("u1", entradas, MOMENTO);
    for (const f of r.fields) {
      if (f.state === "nao_registrado") expect(f.count).toBe(0);
    }
  });

  it("resumo em campo sem registro é descartado, não exibido", () => {
    const entradas = fixture();
    // Alguém monta um resumo e esquece de conferir a contagem: o recibo não
    // deixa isso virar "0 g de carboidrato" na tela do modelo.
    entradas.alimentacao = campo({ count: 0, summary: "0 g de carboidrato" });
    const r = buildContextReceipt("u1", entradas, MOMENTO);
    expect(r.fields.find((f) => f.key === "alimentacao")!.summary).toBeNull();
  });

  it("contagem negativa ou fracionária não passa", () => {
    const entradas = fixture();
    entradas.glicemia = campo({ count: -3 });
    entradas.sono = campo({ count: 2.7, summary: "duas noites e pouco" });
    const r = buildContextReceipt("u1", entradas, MOMENTO);
    expect(r.fields.find((f) => f.key === "glicemia")!.count).toBe(0);
    expect(r.fields.find((f) => f.key === "sono")!.count).toBe(2);
  });
});

describe("divergências", () => {
  it("1 sessão com 0 min diverge; 1 sessão com 45 min não", () => {
    expect(divergenciaExercicio({ sessions: 1, totalMinutes: 0 })).not.toBeNull();
    expect(divergenciaExercicio({ sessions: 1, totalMinutes: 45 })).toBeNull();
    expect(divergenciaExercicio({ sessions: 0, totalMinutes: 0 })).toBeNull();
  });

  it("dose órfã cita a contagem", () => {
    expect(divergenciaMedicacao({ orphanLogs: 3 })).toContain("3");
    expect(divergenciaMedicacao({ orphanLogs: 0 })).toBeNull();
  });

  it("pico sem leitura posterior diverge", () => {
    expect(divergenciaAlimentacao({ spikeMeals: 2, glucoseReadingsAfterSpike: 0 })).toContain("2");
    expect(divergenciaAlimentacao({ spikeMeals: 2, glucoseReadingsAfterSpike: 5 })).toBeNull();
  });

  /** Relevante para a fatia 1: 'outra' não entra no conjunto de substâncias em uso. */
  it("insulina sem tipo avisa que fica fora do checador", () => {
    const d = divergenciaInsulina({ kindOther: 1 });
    expect(d).toContain("checador de interação");
    expect(divergenciaInsulina({ kindOther: 0 })).toBeNull();
  });

  it("hasDivergence reflete qualquer campo divergente", () => {
    expect(buildContextReceipt("u1", fixture(), MOMENTO).hasDivergence).toBe(true);
    const limpo = fixture();
    limpo.exercicio = campo({ count: 1, summary: "1 sessao" });
    expect(buildContextReceipt("u1", limpo, MOMENTO).hasDivergence).toBe(false);
  });
});

/**
 * O teste mais importante da fatia: qualquer mudança no que chega ao prompt
 * passa a quebrar aqui. Sem ele, `user-context.ts` pode mudar em silêncio e
 * ninguém vê — que é exatamente o problema que o recibo existe para resolver.
 */
describe("snapshot do recibo contra dataset fixo", () => {
  it("o objeto inteiro", () => {
    expect(buildContextReceipt("usuario-de-teste", fixture(), MOMENTO)).toMatchSnapshot();
  });

  it("o texto que vai para o prompt", () => {
    expect(
      renderContextReceipt(buildContextReceipt("usuario-de-teste", fixture(), MOMENTO))
    ).toMatchSnapshot();
  });
});

describe("texto do prompt", () => {
  const texto = renderContextReceipt(buildContextReceipt("u1", fixture(), MOMENTO));

  it("lista os campos sem registro em separado", () => {
    expect(texto).toContain("CAMPOS SEM REGISTRO: alimentacao, sono");
  });

  it("marca a divergência na linha do campo", () => {
    expect(texto).toContain("DIVERGENCIA: 1 sessão(ões) registrada(s) com 0 min");
  });

  it("campo sem registro não mostra número que pareça medida", () => {
    const linha = texto.split("\n").find((l) => l.startsWith("alimentacao"))!;
    expect(linha).toContain("nao_registrado");
    expect(linha).not.toMatch(/\d+\s*g\b/);
  });

  it("diz explicitamente quando nada falta", () => {
    const cheio = Object.fromEntries(
      RECEIPT_KEYS.map((k) => [k, campo({ count: 1, summary: "ok" })])
    ) as Record<ReceiptKey, FieldInput>;
    expect(renderContextReceipt(buildContextReceipt("u1", cheio, MOMENTO))).toContain(
      "CAMPOS SEM REGISTRO: (nenhum)"
    );
  });
});

/**
 * Cruzamento com a fatia 1 — a razão de o recibo existir para a segurança.
 *
 * Se a leitura de `medications` voltar vazia por qualquer motivo (filtro,
 * `active`, RLS), o checador cruza a substância candidata contra conjunto vazio
 * e não encontra nada. `blocked: false` com base em zero medicamentos NÃO é
 * "não há interação" — é "não havia com o que cruzar". Silêncio já foi lido
 * como liberação uma vez.
 */
describe("cruzamento com o checador de interação", () => {
  it("medicacao sem registro marca o contexto como incompleto", () => {
    const entradas = fixture();
    entradas.medicacao = campo({ count: 0 });
    const r = buildContextReceipt("u1", entradas, MOMENTO);

    const medicacao = r.fields.find((f) => f.key === "medicacao")!;
    expect(medicacao.state).toBe("nao_registrado");
    expect(r.missing).toContain("medicacao");
  });

  it("o texto do prompt não deixa um veredito sem achado passar por completo", () => {
    const entradas = fixture();
    entradas.medicacao = campo({ count: 0 });
    const texto = renderContextReceipt(buildContextReceipt("u1", entradas, MOMENTO));

    // O SYSTEM manda declarar a lacuna quando o campo está aqui. Sem esta
    // linha, um `blocked: false` calculado sobre zero medicamentos chegaria ao
    // modelo indistinguível de um cruzamento que de fato não achou nada.
    expect(texto).toContain("CAMPOS SEM REGISTRO:");
    expect(texto.split("CAMPOS SEM REGISTRO:")[1]).toContain("medicacao");
  });

  it("insulina 'outra' aparece como divergência, porque some do checador", () => {
    const entradas = fixture();
    entradas.insulina = campo({
      count: 3,
      summary: "3 registros",
      divergence: divergenciaInsulina({ kindOther: 2 }),
    });
    const texto = renderContextReceipt(buildContextReceipt("u1", entradas, MOMENTO));
    expect(texto).toContain("não entram no checador de interação");
  });
});
