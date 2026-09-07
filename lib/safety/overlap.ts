import type { MechanismRow } from "./mechanism-count";

/**
 * Sobreposição de janelas de ação no dia.
 *
 * Conta quantos MECANISMOS hipoglicemiantes distintos estão simultaneamente
 * dentro da janela de ação, e em que intervalo eles se concentram.
 *
 * O QUE ISTO NÃO É: previsão. Janela de ação sobreposta não é previsão de queda
 * de glicemia — não há hora, não há valor, não há afirmação sobre o futuro. É
 * associação temporal, insumo para a consulta médica.
 *
 * As durações são APROXIMADAS e assim rotuladas na tela. Servem para calcular
 * sobreposição, não para prever efeito, e o usuário pode sobrescrever cada uma.
 */

export type ScheduledDose = {
  canonical: string;
  name: string;
  /** hora do dia, HH:MM, vinda de reminder_times ou de applied_at */
  at: string;
  durationHours: number;
  source: "reminder" | "insulin_log";
  /**
   * Em que dia esta dose ocorreu, relativo ao dia avaliado. 0 = hoje,
   * -1 = ontem. Existe para o chamador poder passar um registro real de dia
   * anterior — `at` sozinho é hora do dia e não sabe dizer de que dia é.
   */
  dayOffset?: number;
};

export type OverlapWindow = {
  from: string; // "14:00"
  to: string; // "17:00"
  /** mecanismos hipoglicemiantes distintos simultâneos nesta janela */
  mechanismCount: number;
  mechanisms: string[];
  doses: ScheduledDose[];
};

export type OverlapReport = {
  /** janela com maior concentração de mecanismos no dia */
  peak: OverlapWindow | null;
  windows: OverlapWindow[];
  /** doses sem horário ou sem duração — não entram no cálculo */
  unscheduled: string[];
};

/** Abaixo disto a janela não é reportada: duas vias simultâneas é o normal de quem trata diabetes. */
const MIN_MECHANISMS = 3;

const MINUTOS_NO_DIA = 24 * 60;

function paraMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Sem `% 24` de propósito: o fim do dia sai como "24:00", não "00:00".
 * Numa janela, "22:00–00:00" se lê como se terminasse onde começa o dia — e
 * "24:00" só pode ser fim. Início nunca chega a 1440 (paraMinutos para em 23:59).
 */
function paraHHMM(minutos: number): string {
  const m = Math.max(0, Math.min(MINUTOS_NO_DIA, Math.round(minutos)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function buildOverlapReport(
  doses: ScheduledDose[],
  mechanisms: MechanismRow[]
): OverlapReport {
  // Só mecanismos que reduzem glicemia entram na contagem.
  const baixamPorCanonical = new Map<string, string[]>();
  for (const m of mechanisms) {
    if (!m.lowersGlucose) continue;
    const lista = baixamPorCanonical.get(m.canonical) ?? [];
    lista.push(m.mechanism);
    baixamPorCanonical.set(m.canonical, lista);
  }

  const unscheduled: string[] = [];
  const intervalos: { inicio: number; fim: number; dose: ScheduledDose; mecanismos: string[] }[] = [];

  for (const d of doses) {
    const horaDoDia = paraMinutos(d.at);
    const mecanismos = baixamPorCanonical.get(d.canonical) ?? [];

    // Sem horário, sem duração utilizável, ou sem mecanismo hipoglicemiante
    // conhecido: fica de fora do cálculo E aparece na lista. Sumir calado é o
    // que faria o número enganar — a janela teria sido calculada sem o item.
    if (horaDoDia === null || !(d.durationHours > 0) || mecanismos.length === 0) {
      unscheduled.push(d.name);
      continue;
    }

    const duracao = d.durationHours * 60;
    const base = horaDoDia + (d.dayOffset ?? 0) * MINUTOS_NO_DIA;

    // ---------------------------------------------------------------------
    // Projeção das doses anteriores — a correção de 07/09/2026
    // ---------------------------------------------------------------------
    // A versão anterior olhava só as doses do dia, e o efeito era grave: uma
    // basal de 24 h tomada às 22:00 nunca aparecia em janela nenhuma antes das
    // 22:00. Ou seja, a JANELA DA TARDE — onde a hipoglicemia acontece —
    // nunca contava insulina basal, justamente a que está ativa 24 h por dia.
    // Um alerta de concentração de mecanismos que descarta a basal erra para o
    // lado perigoso.
    //
    // `reminder` é regime DIÁRIO por definição (vem de `reminder_times`), então
    // as ocorrências dos dias anteriores são projetadas. Quantos dias: os que a
    // própria duração exigir. Fixar 48 h cobriria a basal e continuaria
    // perdendo o GLP-1 semanal, que tem 168 h no seed — o mesmo defeito, uma
    // substância adiante.
    //
    // `insulin_log` NÃO é projetado: é aplicação avulsa, e repeti-la como se
    // fosse diária inventaria dose que não aconteceu. Registro real de dia
    // anterior chega pelo `dayOffset`.
    const diasParaTras =
      d.source === "reminder" ? Math.ceil(d.durationHours / 24) : 0;

    for (let k = 0; k <= diasParaTras; k += 1) {
      const inicioBruto = base - k * MINUTOS_NO_DIA;
      const fimBruto = inicioBruto + duracao;

      // Recorte no dia avaliado. Fora dele a ocorrência não interessa.
      const inicio = Math.max(inicioBruto, 0);
      const fim = Math.min(fimBruto, MINUTOS_NO_DIA);
      if (fim <= inicio) continue;

      intervalos.push({ inicio, fim, dose: d, mecanismos });
    }
  }

  // Varredura por evento: os pontos de início e fim recortam o dia em
  // intervalos elementares, e dentro de cada um o conjunto ativo não muda.
  const pontos = [...new Set(intervalos.flatMap((i) => [i.inicio, i.fim]))].sort((a, b) => a - b);

  const windows: OverlapWindow[] = [];
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const de = pontos[i];
    const ate = pontos[i + 1];
    if (ate <= de) continue;

    const ativos = intervalos.filter((iv) => iv.inicio <= de && iv.fim >= ate);
    if (!ativos.length) continue;

    // Deduplicado por MECANISMO, não por substância: duas substâncias que
    // baixam glicose pela mesma via são uma via só.
    const mecanismos = [...new Set(ativos.flatMap((a) => a.mecanismos))].sort();
    if (mecanismos.length < MIN_MECHANISMS) continue;

    // A mesma dose pode estar ativa por duas ocorrências (a de ontem terminando
    // e a de hoje começando). Na lista ela aparece uma vez.
    const dosesAtivas = [...new Set(ativos.map((a) => a.dose))];

    windows.push({
      from: paraHHMM(de),
      to: paraHHMM(ate),
      mechanismCount: mecanismos.length,
      mechanisms: mecanismos,
      doses: dosesAtivas,
    });
  }

  // Empate resolve pelo mais cedo: `windows` já está em ordem cronológica, e a
  // comparação estrita preserva o primeiro.
  let peak: OverlapWindow | null = null;
  for (const w of windows) {
    if (!peak || w.mechanismCount > peak.mechanismCount) peak = w;
  }

  return { peak, windows, unscheduled };
}
