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
    const inicio = paraMinutos(d.at);
    const mecanismos = baixamPorCanonical.get(d.canonical) ?? [];

    // Sem horário, sem duração utilizável, ou sem mecanismo hipoglicemiante
    // conhecido: fica de fora do cálculo E aparece na lista. Sumir calado é o
    // que faria o número enganar — a janela teria sido calculada sem o item.
    if (inicio === null || !(d.durationHours > 0) || mecanismos.length === 0) {
      unscheduled.push(d.name);
      continue;
    }

    // Recorte no fim do dia. Uma dose de ação longa segue agindo depois da
    // meia-noite, e este relatório é do dia — ver a limitação declarada abaixo.
    const fim = Math.min(inicio + d.durationHours * 60, MINUTOS_NO_DIA);
    if (fim <= inicio) {
      unscheduled.push(d.name);
      continue;
    }
    intervalos.push({ inicio, fim, dose: d, mecanismos });
  }

  // LIMITAÇÃO DECLARADA: a dose de ONTEM que ainda está agindo não é projetada
  // neste dia. Para insulina basal de 24 h tomada às 22:00, isso significa que
  // as janelas da manhã não a contam. A contagem é, portanto, um PISO — nunca
  // superestima, pode subestimar. Projetar a dose anterior mudaria a contagem
  // esperada do caso de referência (15:00–17:00 passaria de 4 para 5), então é
  // decisão de curadoria, não de implementação.

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

    windows.push({
      from: paraHHMM(de),
      to: paraHHMM(ate),
      mechanismCount: mecanismos.length,
      mechanisms: mecanismos,
      doses: ativos.map((a) => a.dose),
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
