import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FUSO_PADRAO,
  formatarData,
  formatarDataHora,
  formatarDiaISO,
  formatarHora,
} from "./format";

// A leitura real que expôs o defeito: 08/09/2026 00:24:23 em São Paulo é
// 03:24:23 em UTC. Era este o número que aparecia na linha do tempo.
const LEITURA = "2026-09-08T03:24:23.000Z";

describe("formatação com fuso explícito", () => {
  it("mostra a hora local, não a do servidor", () => {
    expect(formatarHora(LEITURA, "America/Sao_Paulo")).toBe("00:24");
    // Sem fuso explícito o resultado dependeria de onde o código roda — em UTC
    // daria 03:24, que é exatamente o defeito medido.
    expect(formatarHora(LEITURA, "UTC")).toBe("03:24");
  });

  it("cai no fuso padrão quando o perfil não declara", () => {
    expect(formatarHora(LEITURA, null)).toBe(formatarHora(LEITURA, FUSO_PADRAO));
    expect(formatarHora(LEITURA, undefined)).toBe("00:24");
    expect(formatarHora(LEITURA, "")).toBe("00:24");
  });

  it("a data vira o dia junto com a hora", () => {
    expect(formatarData(LEITURA, "America/Sao_Paulo")).toBe("08/09/2026");
    // 02:00 UTC do dia 08 é 23:00 do dia 07 em São Paulo.
    expect(formatarData("2026-09-08T02:00:00.000Z", "America/Sao_Paulo")).toBe("07/09/2026");
    expect(formatarData("2026-09-08T02:00:00.000Z", "UTC")).toBe("08/09/2026");
  });

  it("data e hora juntas usam o mesmo fuso", () => {
    const s = formatarDataHora(LEITURA, "America/Sao_Paulo");
    expect(s).toContain("08/09/2026");
    expect(s).toContain("00:24");
  });

  it("dia puro não vira, ancorado ao meio-dia UTC", () => {
    // O motivo do meio-dia: new Date("2026-09-08") é meia-noite UTC, que em São
    // Paulo é dia 07 às 21:00 — a data pura apareceria um dia atrás.
    expect(formatarDiaISO("2026-09-08")).toBe("08/09/2026");
    expect(
      new Date("2026-09-08").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    ).toBe("07/09/2026");
  });
});

/**
 * P48: `dateStyle`/`timeStyle` não podem conviver com campos avulsos (`day`,
 * `hour`…) — o Intl lança `TypeError: Invalid option`. O helper punha os estilos
 * sempre, e o relatório completo dava erro 500 para quem tinha remédio.
 */
describe("formatarDataHora com opções do chamador (P48)", () => {
  it("o próprio Intl recusa estilo junto com campo avulso", () => {
    expect(() =>
      new Date(LEITURA).toLocaleString("pt-BR", {
        timeZone: "UTC",
        dateStyle: "short",
        hour: "2-digit",
      })
    ).toThrow(TypeError);
  });

  it("formato do relatório completo (fmtDateTime)", () => {
    expect(
      formatarDataHora(LEITURA, null, {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    ).toBe("08/09/2026, 00:24");
  });

  it("formato do gráfico de tendência da glicemia, no fuso padrão", () => {
    expect(
      formatarDataHora(LEITURA, null, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    ).toBe("8 de set., 00:24");
  });

  it("só o fuso nas opções mantém o formato curto (rodapé do relatório)", () => {
    expect(formatarDataHora(LEITURA, null, { timeZone: "UTC" })).toBe("08/09/2026, 03:24");
  });

  it("sem opções segue igual (demais consumidores)", () => {
    expect(formatarDataHora(LEITURA)).toBe("08/09/2026, 00:24");
    expect(formatarDataHora(LEITURA, "UTC")).toBe("08/09/2026, 03:24");
  });

  it("estilo pedido pelo chamador continua valendo", () => {
    expect(formatarDataHora(LEITURA, null, { dateStyle: "long" })).toBe(
      "8 de setembro de 2026 às 00:24"
    );
  });

  it("entrada inválida aparece como inválida, sem data inventada", () => {
    expect(formatarDataHora("não é data")).toBe("Invalid Date");
    expect(formatarDataHora("não é data", null, { day: "2-digit", hour: "2-digit" })).toBe(
      "Invalid Date"
    );
  });
});

/**
 * Trava de regressão: nenhuma formatação de INSTANTE pode ficar sem fuso.
 *
 * É teste e não convenção porque a convenção já falhou 42 vezes. Duas
 * armadilhas que a primeira versão deste teste caiu, e que estão resolvidas
 * aqui:
 *
 * 1. A chamada pode ocupar VÁRIAS LINHAS, com o `timeZone` na linha seguinte.
 *    Ler linha a linha acusava como infrator código que já estava certo.
 * 2. `toLocaleString` também formata NÚMERO — passos, kcal, tokens — e ali fuso
 *    não existe. Só `toLocaleDateString` e `toLocaleTimeString` são sempre data.
 */
const RAIZES = ["app", "components", "lib"];

function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, out);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(caminho);
  }
  return out;
}

describe("nenhuma formatação de instante sem fuso", () => {
  it("toda chamada a toLocale*String de data declara timeZone", () => {
    const infratores: string[] = [];

    for (const raiz of RAIZES) {
      for (const arq of arquivos(join(process.cwd(), raiz))) {
        // O próprio módulo de formatação é a exceção: é ele que injeta o fuso.
        if (arq.endsWith(join("lib", "time", "format.ts"))) continue;

        const texto = readFileSync(arq, "utf8");
        const rx = /\.toLocale(String|DateString|TimeString)\s*\(/g;
        let m: RegExpExecArray | null;

        while ((m = rx.exec(texto)) !== null) {
          // Da abertura até o fecha-parêntese correspondente.
          let i = rx.lastIndex;
          let nivel = 1;
          while (i < texto.length && nivel > 0) {
            if (texto[i] === "(") nivel += 1;
            else if (texto[i] === ")") nivel -= 1;
            i += 1;
          }
          const chamada = texto.slice(m.index, i);
          if (chamada.includes("timeZone")) continue;

          const antes = texto.slice(Math.max(0, m.index - 80), m.index);
          const ehData = m[1] !== "String" || /new Date\s*\(|_at\b|At\b/.test(antes);
          if (!ehData) continue;

          // Data pura ancorada ao meio-dia UTC não depende de fuso.
          if (antes.includes("T12:00:00")) continue;

          const linha = texto.slice(0, m.index).split("\n").length;
          const rel = arq.replace(process.cwd(), "").split("\\").join("/");
          infratores.push(`${rel}:${linha}`);
        }
      }
    }

    expect(
      infratores,
      `Formatação de data sem fuso — use lib/time/format.ts:\n${infratores.join("\n")}`
    ).toEqual([]);
  });
});
