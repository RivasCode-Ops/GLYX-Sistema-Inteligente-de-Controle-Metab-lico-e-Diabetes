import { describe, expect, it } from "vitest";
import { seedAliases, seedInteractions, seedMechanisms } from "./__fixtures__/read-seed";
import { buildVerdict, resolveCanonical } from "./interaction-check";
import { buildMechanismReport } from "./mechanism-count";
import { buildOverlapReport } from "./overlap";
import { findForbiddenLanguage, FORBIDDEN_PHRASES } from "./forbidden-language";
import {
  DOCTOR_NOTE,
  NO_FINDING_NOTE,
  TONE_LABEL,
  blockedText,
  renderVerdictBlock,
  toSafetyPayload,
  unknownSubstanceNote,
} from "./present";

/**
 * O teste que trava o escopo.
 *
 * Varre TEXTO RENDERIZADO — o que chega ao usuário —, não o fonte. A distinção
 * importa: o prompt que PROÍBE o modelo de dizer "é seguro" contém a frase "é
 * seguro", e varrer o fonte reprovaria justamente a instrução que existe para
 * impedir o problema.
 *
 * Quando o card de mecanismos e a folha "Levar ao médico" existirem, os
 * renderizadores deles entram na lista de `TEXTOS` abaixo.
 */

const ALIASES = seedAliases();
const INTERACTIONS = seedInteractions();
const MECHANISMS = seedMechanisms();

function verdictPara(candidatos: string[], uso: string[]) {
  return buildVerdict(
    resolveCanonical(candidatos, ALIASES),
    resolveCanonical(uso, ALIASES).canonical,
    INTERACTIONS
  );
}

/** Todo texto que os módulos de segurança conseguem produzir hoje. */
function textosRenderizados(): string[] {
  const cenarios = [
    verdictPara(["Berberina 500mg"], ["Lantus", "Fiasp"]),
    verdictPara(["Creatina"], ["Lantus"]),
    verdictPara(["Ômega 3"], ["Lantus"]),
    verdictPara([], []),
  ];

  const textos: string[] = [NO_FINDING_NOTE, DOCTOR_NOTE, ...Object.values(TONE_LABEL)];

  for (const v of cenarios) {
    const payload = toSafetyPayload(v);
    textos.push(
      renderVerdictBlock(v),
      blockedText(v),
      unknownSubstanceNote(v.unresolved) ?? "",
      payload.label,
      payload.unknownNote ?? "",
      payload.noFindingNote ?? "",
      payload.doctorNote,
      ...payload.findings.map((f) => f.message)
    );
  }

  // Rótulos de mecanismo e de janela, que vão para a tela do card.
  const relatorio = buildMechanismReport(
    [
      { name: "Lantus", canonical: ["insulina_basal"], kind: "med", addedAt: "2026-01-10T10:00:00Z" },
      { name: "Berberina", canonical: ["berberina"], kind: "supplement", addedAt: "2026-09-02T09:00:00Z" },
    ],
    MECHANISMS
  );
  textos.push(...relatorio.lowering.map((m) => m.label), ...relatorio.other.map((m) => m.label));

  const overlap = buildOverlapReport(
    [
      { canonical: "insulina_rapida", name: "Fiasp", at: "12:00", durationHours: 5, source: "insulin_log" },
      { canonical: "inibidor_sglt2", name: "Glyxambi", at: "12:30", durationHours: 24, source: "reminder" },
      { canonical: "inibidor_dpp4", name: "Glyxambi", at: "12:30", durationHours: 24, source: "reminder" },
      { canonical: "berberina", name: "Berberina", at: "15:00", durationHours: 8, source: "reminder" },
    ],
    MECHANISMS
  );
  textos.push(...overlap.windows.map((w) => `${w.from}–${w.to} (${w.mechanismCount} simultâneos)`));

  return textos.filter((t) => t.length > 0);
}

describe("linguagem proibida no texto renderizado", () => {
  it.each(textosRenderizados().map((t, i) => [i, t] as const))(
    "texto %i não diagnostica, não manda suspender e não libera",
    (_i, texto) => {
      expect(findForbiddenLanguage(texto), texto.slice(0, 120)).toEqual([]);
    }
  );
});

describe("o detector em si", () => {
  it("pega atribuição de causa", () => {
    const hits = findForbiddenLanguage("Provavelmente isso está causando suas quedas.");
    expect(hits.map((h) => h.phrase)).toContain("isso está causando");
  });

  it("pega conduta, com e sem acento e caixa", () => {
    expect(findForbiddenLanguage("SUSPENDA o uso.").length).toBeGreaterThan(0);
    expect(findForbiddenLanguage("Interrompa por ora.").length).toBeGreaterThan(0);
  });

  it("pega liberação", () => {
    expect(findForbiddenLanguage("O produto é seguro para você.").length).toBeGreaterThan(0);
    expect(findForbiddenLanguage("Pode manter como está.").length).toBeGreaterThan(0);
  });

  it("pega previsão de glicemia com hora e valor", () => {
    const hits = findForbiddenLanguage("Sua glicemia vai cair para 55 mg/dL por volta das 15h.");
    expect(hits.map((h) => h.phrase)).toContain("previsão de glicemia com hora e valor");
  });

  it("não reprova o texto que o app de fato usa", () => {
    expect(findForbiddenLanguage("5 mecanismos hipoglicemiantes ativos")).toEqual([]);
    expect(findForbiddenLanguage("Maior concentração: 14:00–17:00 (4 simultâneos)")).toEqual([]);
    expect(findForbiddenLanguage("Janelas aproximadas · editáveis")).toEqual([]);
    expect(findForbiddenLanguage("Item mais recente: Berberina (suplemento, 02/09)")).toEqual([]);
  });

  it("a lista cobre as três famílias de proibição", () => {
    expect(FORBIDDEN_PHRASES).toContain("isso está causando");
    expect(FORBIDDEN_PHRASES).toContain("suspenda");
    expect(FORBIDDEN_PHRASES).toContain("é seguro");
  });
});
