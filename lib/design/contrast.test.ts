import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AA_LARGE,
  AA_TEXT,
  contrastRatio,
  oklchToHex,
  oklchToLinearRgb,
  parseOklchTriple,
  type Oklch,
} from "./oklch";

/**
 * Mede o contraste de todo par texto/superfície que o app usa, contra WCAG AA.
 *
 * Lê os tokens do `globals.css` REAL. Uma cópia dos valores aqui dentro
 * passaria verde no dia em que alguém mexesse no CSS e esquecesse do teste —
 * que é justamente o dia em que a medição precisaria falhar.
 *
 * O teste também GRAVA `docs/CONTRASTE.md`. É o registro que o briefing pede
 * ("registrar os números medidos no repo"), e gerá-lo aqui é o que impede o
 * documento de envelhecer: ele se refaz a cada `npm test`.
 */

const RAIZ = process.cwd();

function lerTokens(): Map<string, Oklch> {
  const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
  const tokens = new Map<string, Oklch>();
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*([\d.]+\s+[\d.]+\s+[\d.]+)\s*;/g)) {
    const cor = parseOklchTriple(m[2]);
    if (cor) tokens.set(m[1], cor);
  }
  return tokens;
}

const TOKENS = lerTokens();

function token(nome: string): Oklch {
  const t = TOKENS.get(nome);
  if (!t) throw new Error(`token --${nome} não encontrado em globals.css`);
  return t;
}

/** Superfícies sobre as quais texto de fato é desenhado. */
const SUPERFICIES = ["background-50", "background-100", "background-200"] as const;

/** Pares de texto: nível AA exigido de cada um. */
const TEXTOS: { token: string; alvo: number; papel: string }[] = [
  { token: "foreground-950", alvo: AA_TEXT, papel: "texto primário" },
  { token: "foreground-900", alvo: AA_TEXT, papel: "texto primário alternativo" },
  { token: "foreground-800", alvo: AA_TEXT, papel: "texto secundário" },
  { token: "foreground-700", alvo: AA_TEXT, papel: "texto secundário fraco" },
  { token: "foreground-600", alvo: AA_LARGE, papel: "texto terciário / legenda" },
  { token: "foreground-500", alvo: AA_LARGE, papel: "texto terciário fraco" },
  // Cor de ação e de identidade: são elemento de interface e texto grande,
  // então o alvo é 3:1. A regra "sobe um degrau" da landing (‑600 claro vira
  // ‑400 escuro) existe justamente para isto fechar.
  { token: "primary-400", alvo: AA_LARGE, papel: "ação primária / Glicemia" },
  { token: "primary-300", alvo: AA_LARGE, papel: "ação primária clara" },
  { token: "accent-400", alvo: AA_LARGE, papel: "acento" },
  { token: "module-glicemia", alvo: AA_LARGE, papel: "módulo Glicemia" },
  { token: "module-alimentacao", alvo: AA_LARGE, papel: "módulo Alimentação" },
  { token: "module-exercicio", alvo: AA_LARGE, papel: "módulo Exercício" },
  { token: "module-medicacao", alvo: AA_LARGE, papel: "módulo Medicação" },
  { token: "severity-critico", alvo: AA_LARGE, papel: "severidade crítica" },
  { token: "severity-atencao", alvo: AA_LARGE, papel: "severidade atenção" },
];

type Medida = {
  texto: string;
  papel: string;
  superficie: string;
  razao: number;
  alvo: number;
  passa: boolean;
};

const MEDIDAS: Medida[] = TEXTOS.flatMap((t) =>
  SUPERFICIES.map((s) => {
    const razao = contrastRatio(token(t.token), token(s));
    return {
      texto: t.token,
      papel: t.papel,
      superficie: s,
      razao,
      alvo: t.alvo,
      passa: razao >= t.alvo,
    };
  })
);

describe("contraste WCAG AA dos pares em uso", () => {
  it.each(MEDIDAS.map((m) => [`${m.texto} sobre ${m.superficie}`, m] as const))(
    "%s",
    (_nome, m) => {
      expect(
        m.razao,
        `${m.papel}: ${m.razao.toFixed(2)}:1, alvo ${m.alvo}:1`
      ).toBeGreaterThanOrEqual(m.alvo);
    }
  );
});

describe("gamut", () => {
  it("nenhum token de cor sai do sRGB", () => {
    const fora = [...TOKENS.entries()]
      .filter(([nome]) => !nome.startsWith("font"))
      .filter(([, cor]) => oklchToLinearRgb(cor).clipped)
      .map(([nome]) => nome);
    // Cor fora do gamut é recortada na conversão: o valor medido deixa de ser
    // o valor exibido, e a medição passaria a atestar uma cor que ninguém vê.
    expect(fora).toEqual([]);
  });
});

describe("registro dos números medidos", () => {
  it("grava docs/CONTRASTE.md", () => {
    const reprovados = MEDIDAS.filter((m) => !m.passa);
    const linhas = MEDIDAS.map(
      (m) =>
        `| \`${m.texto}\` | ${m.papel} | \`${m.superficie}\` | ${m.razao.toFixed(2)}:1 | ${m.alvo}:1 | ${m.passa ? "✅" : "❌"} |`
    );

    const hex = [...TOKENS.entries()]
      .filter(([nome]) => !nome.startsWith("font"))
      .map(([nome, cor]) => `| \`--${nome}\` | \`${cor.l} ${cor.c} ${cor.h}\` | \`${oklchToHex(cor)}\` |`);

    const doc = `# Contraste medido — tema escuro do app

> Gerado por \`lib/design/contrast.test.ts\` a cada \`npm test\`. Não editar à mão:
> a próxima execução sobrescreve. Para mudar um número, mude o token em
> \`app/globals.css\`.

Conversão OKLCH → sRGB linear e luminância relativa WCAG em
\`lib/design/oklch.ts\`. Alvo: **${AA_TEXT}:1** para corpo, **${AA_LARGE}:1** para
texto grande e elemento de interface.

Superfícies medidas: ${SUPERFICIES.map((s) => `\`${s}\``).join(", ")}.

## Pares texto × superfície

| token | papel | superfície | medido | alvo | |
|---|---|---|---|---|---|
${linhas.join("\n")}

**${MEDIDAS.length - reprovados.length} de ${MEDIDAS.length} pares passam.**${
      reprovados.length
        ? `\n\nReprovados: ${reprovados.map((m) => `\`${m.texto}\` sobre \`${m.superficie}\``).join(", ")}.`
        : ""
    }

## Tokens em hexadecimal

Equivalente sRGB de cada token, para conferência em ferramenta externa.

| token | OKLCH | hex |
|---|---|---|
${hex.join("\n")}

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Medição gerada pelo próprio repositório.
`;

    mkdirSync(join(RAIZ, "docs"), { recursive: true });
    writeFileSync(join(RAIZ, "docs", "CONTRASTE.md"), doc);
    expect(doc.length).toBeGreaterThan(0);
  });
});
