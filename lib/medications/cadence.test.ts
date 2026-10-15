import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import casosJson from "./cadence-casos.json";
import {
  alarmeHabilitado,
  cadenciaDoFormulario,
  configuracaoInconsistente,
  descreverCadencia,
  diaDaSemana,
  dosesVencidasParaAlarme,
  ehDiaDeDose,
  frequenciaAConfirmar,
  frequenciaNaEdicao,
  horariosValidos,
  inicioNoFuturo,
  lerCadencia,
  programacaoDoFormulario,
  type MedicamentoParaAlarme,
} from "./cadence";

type Caso = {
  id: string;
  descricao: string;
  timezone: string;
  agoraUTC: string;
  med: Omit<MedicamentoParaAlarme, "id">;
  esperado: { horario: string; dataDaDose: string }[];
};
const CASOS = casosJson.casos as Caso[];

describe("contrato do alarme (mesmos casos do teste SQL)", () => {
  it.each(CASOS.map((c) => [c.id, c] as const))("%s", (_id, caso) => {
    const r = dosesVencidasParaAlarme([{ id: "med", ...caso.med }], new Date(caso.agoraUTC), caso.timezone);
    expect(r.map((d) => ({ horario: d.horario, dataDaDose: d.dataDaDose }))).toEqual(caso.esperado);
  });

  it("todo caso também existe no teste SQL, para as duas implementações não divergirem", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "tests", "med_alarms_due.sql"), "utf8");
    for (const c of CASOS) expect(sql).toContain(`'${c.id}'`);
  });
});

describe("cadência vinda do formulário", () => {
  // D1 (aprovada em 15/10/2026): o app não presume mais "todo dia".
  it("cadastro com horário sem frequência é recusado com frase (vazio ou campo ausente)", () => {
    const erro = { ok: false, erro: "Escolha a frequência dos alarmes: todo dia, uma vez por semana ou a cada N dias." };
    expect(cadenciaDoFormulario({ cadence: "" }, true, "cadastro")).toEqual(erro);
    expect(cadenciaDoFormulario({ cadence: null }, true, "cadastro")).toEqual(erro);
  });

  it("cadastro sem horário não exige frequência: não há alarme, fica não declarada", () => {
    const r = cadenciaDoFormulario({ cadence: "" }, false, "cadastro");
    expect(r).toEqual({
      ok: true,
      colunas: { cadence: null, cadence_weekday: null, cadence_interval_days: null, cadence_anchor_on: null },
      explicita: false,
    });
  });

  it("edição com campo vazio ou ausente não mexe na frequência nem confirma", () => {
    expect(cadenciaDoFormulario({ cadence: "" }, true, "edicao")).toEqual({ ok: true, colunas: null, explicita: false });
    expect(cadenciaDoFormulario({ cadence: null }, true, "edicao")).toEqual({ ok: true, colunas: null, explicita: false });
  });

  it("frequência escolhida conta como explícita, no cadastro e na edição", () => {
    for (const modo of ["cadastro", "edicao"] as const) {
      expect(cadenciaDoFormulario({ cadence: "diaria" }, true, modo)).toEqual({
        ok: true,
        colunas: { cadence: "diaria", cadence_weekday: null, cadence_interval_days: null, cadence_anchor_on: null },
        explicita: true,
      });
    }
  });

  it("semanal sem dia é recusada com frase, não com nome de constraint", () => {
    const r = cadenciaDoFormulario({ cadence: "semanal", cadence_weekday: "" }, true, "cadastro");
    expect(r).toEqual({ ok: false, erro: "Escolha o dia da semana da dose semanal." });
  });

  it("semanal com dia limpa os campos de intervalo", () => {
    const r = cadenciaDoFormulario(
      { cadence: "semanal", cadence_weekday: "3", cadence_interval_days: "7", cadence_anchor_on: "2026-10-01" },
      true,
      "edicao"
    );
    expect(r).toEqual({
      ok: true,
      colunas: { cadence: "semanal", cadence_weekday: 3, cadence_interval_days: null, cadence_anchor_on: null },
      explicita: true,
    });
  });

  it("intervalo exige 2–90 dias e data real (D2: a data de início é obrigatória)", () => {
    expect(cadenciaDoFormulario({ cadence: "intervalo", cadence_interval_days: "1", cadence_anchor_on: "2026-10-01" }, true, "cadastro").ok).toBe(false);
    expect(cadenciaDoFormulario({ cadence: "intervalo", cadence_interval_days: "3", cadence_anchor_on: "2026-02-30" }, true, "cadastro").ok).toBe(false);
    expect(cadenciaDoFormulario({ cadence: "intervalo", cadence_interval_days: "3", cadence_anchor_on: "" }, true, "cadastro")).toEqual({
      ok: false,
      erro: "Informe a data da primeira dose do intervalo.",
    });
    expect(cadenciaDoFormulario({ cadence: "intervalo", cadence_interval_days: "3", cadence_anchor_on: "2026-10-01" }, true, "cadastro")).toEqual({
      ok: true,
      colunas: { cadence: "intervalo", cadence_weekday: null, cadence_interval_days: 3, cadence_anchor_on: "2026-10-01" },
      explicita: true,
    });
  });

  it("valor desconhecido é recusado", () => {
    expect(cadenciaDoFormulario({ cadence: "mensal" }, true, "edicao").ok).toBe(false);
  });
});

describe("D1 — frequência a confirmar", () => {
  const antigo = { reminder_times: ["08:00"], cadence: "diaria", cadence_confirmed_at: null };

  it("item antigo com horário e sem confirmação aparece como 'a confirmar'", () => {
    expect(frequenciaAConfirmar(antigo)).toBe(true);
  });

  it("confirmado, sem horário ou banco sem a coluna: não aparece", () => {
    expect(frequenciaAConfirmar({ ...antigo, cadence_confirmed_at: "2026-10-15T12:00:00Z" })).toBe(false);
    expect(frequenciaAConfirmar({ ...antigo, reminder_times: [] })).toBe(false);
    const { cadence_confirmed_at: _ausente, ...semColuna } = antigo;
    void _ausente;
    expect(frequenciaAConfirmar(semColuna)).toBe(false);
  });

  it("o alarme do item antigo NÃO muda por estar a confirmar (comportamento preservado)", () => {
    expect(ehDiaDeDose({ cadence: null }, "2026-10-15")).toBe(true);
    expect(ehDiaDeDose({ cadence: "diaria" }, "2026-10-15")).toBe(true);
    expect(alarmeHabilitado({ ...antigo, timing_strictness: "flexivel" })).toBe(true);
  });
});

describe("D2 — início no futuro", () => {
  const m = { cadence: "intervalo", cadence_interval_days: 3, cadence_anchor_on: "2026-10-20" };

  it("avisa enquanto a data de início não chegou", () => {
    expect(inicioNoFuturo(m, "2026-10-15")).toBe("2026-10-20");
    expect(inicioNoFuturo(m, "2026-10-20")).toBeNull();
    expect(inicioNoFuturo({ cadence: "diaria" }, "2026-10-15")).toBeNull();
  });

  it("não dispara antes da data de início", () => {
    expect(ehDiaDeDose(m, "2026-10-17")).toBe(false);
    expect(ehDiaDeDose(m, "2026-10-20")).toBe(true);
    expect(ehDiaDeDose(m, "2026-10-23")).toBe(true);
  });
});

describe("D3 — 'livre' com horário", () => {
  it("é configuração inconsistente e não recebe alarme implícito", () => {
    const livre = { timing_strictness: "livre", reminder_times: ["08:00"], cadence_confirmed_at: null };
    expect(configuracaoInconsistente(livre)).toBe(true);
    expect(alarmeHabilitado(livre)).toBe(false);
    // Inconsistente não vira "a confirmar": confirmar não basta, precisa de programação.
    expect(frequenciaAConfirmar(livre)).toBe(false);
    expect(configuracaoInconsistente({ timing_strictness: "livre", reminder_times: [] })).toBe(false);
  });

  it("na edição a frequência vem vazia: salvar sem escolher não ativa o alarme", () => {
    // Achado no navegador (15/10): com "todo dia" pré-selecionado, escolher só a
    // programação ativava o alarme sem escolha de frequência.
    expect(frequenciaNaEdicao({ timing_strictness: "livre", reminder_times: ["08:00"], cadence: "diaria" })).toBeNull();
    expect(frequenciaNaEdicao({ reminder_times: ["08:00"], cadence: "diaria", cadence_confirmed_at: null })).toBeNull();
    expect(frequenciaNaEdicao({ reminder_times: ["08:00"], cadence: "semanal", cadence_confirmed_at: "2026-10-15T12:00:00Z" })).toBe("semanal");
  });

  it("programação: vazio não mexe; só rígido ou flexível ativam", () => {
    expect(programacaoDoFormulario("")).toEqual({ ok: true, rigidez: null });
    expect(programacaoDoFormulario(null)).toEqual({ ok: true, rigidez: null });
    expect(programacaoDoFormulario("rigido")).toEqual({ ok: true, rigidez: "rigido" });
    expect(programacaoDoFormulario("livre")).toEqual({ ok: false, erro: "Programação inválida." });
  });
});

describe("cadência", () => {
  it("2026-10-14 é quarta-feira, como os casos assumem", () => {
    expect(diaDaSemana("2026-10-14")).toBe(3);
  });

  it("cadência pela metade cai na regra de cadência não declarada, não em 'nunca'", () => {
    expect(lerCadencia({ cadence: "semanal", cadence_weekday: null })).toBeNull();
    expect(lerCadencia({ cadence: "intervalo", cadence_interval_days: 3 })).toBeNull();
    expect(ehDiaDeDose({ cadence: "semanal", cadence_weekday: null }, "2026-10-15")).toBe(true);
  });

  it("semanal só no dia declarado, em toda a semana", () => {
    const dias = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"];
    const marcados = dias.filter((d) => ehDiaDeDose({ cadence: "semanal", cadence_weekday: 3 }, d));
    expect(marcados).toEqual(["2026-10-14"]);
  });

  it("intervalo atravessa mudança de mês sem erro de fuso", () => {
    const m = { cadence: "intervalo", cadence_interval_days: 7, cadence_anchor_on: "2026-10-28" };
    expect(ehDiaDeDose(m, "2026-11-04")).toBe(true);
    expect(ehDiaDeDose(m, "2026-11-03")).toBe(false);
  });

  it("só a rigidez 'livre' desliga o alarme", () => {
    expect(alarmeHabilitado({ timing_strictness: "livre" })).toBe(false);
    expect(alarmeHabilitado({ timing_strictness: "rigido" })).toBe(true);
    expect(alarmeHabilitado({ timing_strictness: null })).toBe(true);
  });

  it("descreve a cadência em português para o contexto da IA", () => {
    expect(descreverCadencia({ cadence: "semanal", cadence_weekday: 3 })).toBe("semanal (quarta)");
    expect(descreverCadencia({ cadence: null })).toBe("frequência não declarada");
  });

  it("horário inválido é descartado em vez de derrubar a conta", () => {
    expect(horariosValidos(["8h", "08:00", "24:00", "7:05", "12:60"])).toEqual(["08:00", "7:05"]);
  });
});
