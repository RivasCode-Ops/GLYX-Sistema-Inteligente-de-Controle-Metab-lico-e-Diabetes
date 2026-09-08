/**
 * Métricas de glicemia que o médico pede primeiro — e episódio em vez de leitura.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * O app tinha 5.044 leituras de sensor e entregava contagem e média. Faltavam
 * três números que qualquer consulta de diabetes começa pedindo — GMI, CV e os
 * tempos em faixa em PERCENTUAL — e sobrava um erro de método: contar LEITURA
 * onde o que existe é EPISÓDIO.
 *
 * Com sensor de 5 em 5 minutos, uma hiperglicemia de duas horas e meia vira 27
 * leituras. O score do app tirava 22 pontos por "210 leituras acima da meta",
 * número que descreve a frequência do sensor tanto quanto a do usuário. Um dia
 * ruim em 17/07 aparecia como epidemia.
 *
 * ---------------------------------------------------------------------------
 * CRITÉRIO DE EPISÓDIO
 * ---------------------------------------------------------------------------
 * Segue o consenso internacional de CGM (Battelino et al., 2019): um evento
 * começa quando as leituras cruzam o limiar por pelo menos 15 minutos, e termina
 * quando voltam para dentro por pelo menos 15 minutos. Não é invenção deste app,
 * e é o mesmo critério que o relatório do fabricante do sensor usa — o que
 * importa porque o médico compara os dois.
 *
 * Nada aqui é interpretação clínica: são descrições dos registros. GMI é
 * ESTIMATIVA a partir da média do sensor e não substitui a HbA1c de laboratório
 * — quando as duas divergem, isso é achado para o médico, não erro do app.
 */

export type GlucosePoint = { value_mg_dl: number; recorded_at: string };

export type GlucoseTargets = { targetMin: number; targetMax: number };

/** Minutos contínuos fora da faixa para um evento existir, e para ele encerrar. */
export const EPISODE_MIN_MINUTES = 15;

/**
 * Intervalo acima do qual duas leituras não são consideradas contínuas.
 *
 * Sensor típico entrega uma leitura a cada 5 min. Com 30 min de silêncio, não
 * há como afirmar o que aconteceu no meio — e emendar as pontas criaria um
 * episódio que talvez nunca tenha existido.
 */
export const MAX_GAP_MINUTES = 30;

export type Episode = {
  kind: "hipo" | "hiper";
  startAt: string;
  endAt: string;
  minutes: number;
  /** Pior valor do episódio: menor na hipo, maior na hiper. */
  peak: number;
  readings: number;
};

export type GlucoseMetrics = {
  readings: number;
  mean: number | null;
  /** Coeficiente de variação em % — estabilidade. Abaixo de 36% é o alvo usual. */
  cvPercent: number | null;
  /**
   * Indicador de Gestão da Glicemia, em %. Estimativa derivada da média do
   * sensor pela fórmula de Bergenstal (2018): 3,31 + 0,02392 × média.
   */
  gmiPercent: number | null;
  /** Percentuais de tempo — a forma em que o consenso os pede. */
  tirPercent: number | null;
  tbrPercent: number | null;
  tarPercent: number | null;
  episodes: Episode[];
  hipoEpisodes: number;
  hiperEpisodes: number;
  /** Distribuição de episódios por hora local — 24 posições. */
  hipoByHour: number[];
  hiperByHour: number[];
  coverage: {
    daysWithData: number;
    daysInPeriod: number;
    percent: number | null;
    /** Buracos de 2 dias ou mais, do maior para o menor. */
    gaps: { fromDay: string; toDay: string; days: number }[];
  };
};

function localDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone });
}

function localHour(iso: string, timeZone: string): number {
  return Number(
    new Date(iso).toLocaleString("en-US", { timeZone, hour: "2-digit", hour12: false })
  );
}

function detectEpisodes(
  sorted: GlucosePoint[],
  kind: Episode["kind"],
  fora: (v: number) => boolean
): Episode[] {
  const out: Episode[] = [];
  let atual: GlucosePoint[] = [];
  let dentroDesde: number | null = null;

  const fechar = () => {
    if (!atual.length) return;
    const inicio = new Date(atual[0].recorded_at).getTime();
    const fim = new Date(atual[atual.length - 1].recorded_at).getTime();
    const minutos = Math.round((fim - inicio) / 60_000);
    if (minutos >= EPISODE_MIN_MINUTES) {
      const valores = atual.map((p) => p.value_mg_dl);
      out.push({
        kind,
        startAt: atual[0].recorded_at,
        endAt: atual[atual.length - 1].recorded_at,
        minutes: minutos,
        peak: kind === "hipo" ? Math.min(...valores) : Math.max(...valores),
        readings: atual.length,
      });
    }
    atual = [];
  };

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const t = new Date(p.recorded_at).getTime();
    const anterior = i > 0 ? new Date(sorted[i - 1].recorded_at).getTime() : null;

    // Silêncio longo interrompe qualquer episódio em curso: não se emenda o que
    // não foi medido.
    if (anterior != null && (t - anterior) / 60_000 > MAX_GAP_MINUTES) {
      fechar();
      dentroDesde = null;
    }

    if (fora(p.value_mg_dl)) {
      atual.push(p);
      dentroDesde = null;
      continue;
    }

    if (!atual.length) continue;
    // De volta à faixa: o episódio só encerra depois de 15 min dentro.
    if (dentroDesde == null) dentroDesde = t;
    if ((t - dentroDesde) / 60_000 >= EPISODE_MIN_MINUTES) {
      fechar();
      dentroDesde = null;
    }
  }
  fechar();
  return out;
}

export function computeGlucoseMetrics(
  points: GlucosePoint[],
  targets: GlucoseTargets,
  timeZone = "America/Sao_Paulo"
): GlucoseMetrics {
  const vazio: GlucoseMetrics = {
    readings: 0,
    mean: null,
    cvPercent: null,
    gmiPercent: null,
    tirPercent: null,
    tbrPercent: null,
    tarPercent: null,
    episodes: [],
    hipoEpisodes: 0,
    hiperEpisodes: 0,
    hipoByHour: Array(24).fill(0),
    hiperByHour: Array(24).fill(0),
    coverage: { daysWithData: 0, daysInPeriod: 0, percent: null, gaps: [] },
  };
  if (!points.length) return vazio;

  const sorted = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const valores = sorted.map((p) => p.value_mg_dl);
  const n = valores.length;
  const mean = valores.reduce((s, v) => s + v, 0) / n;

  // Desvio amostral (n-1). Com uma leitura só não há dispersão a afirmar.
  const cvPercent =
    n > 1
      ? Math.round(
          (Math.sqrt(valores.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) / mean) * 1000
        ) / 10
      : null;

  const abaixo = valores.filter((v) => v < targets.targetMin).length;
  const acima = valores.filter((v) => v >= targets.targetMax).length;

  const hipo = detectEpisodes(sorted, "hipo", (v) => v < targets.targetMin);
  const hiper = detectEpisodes(sorted, "hiper", (v) => v >= targets.targetMax);

  const hipoByHour = Array(24).fill(0) as number[];
  const hiperByHour = Array(24).fill(0) as number[];
  for (const e of hipo) hipoByHour[localHour(e.startAt, timeZone)] += 1;
  for (const e of hiper) hiperByHour[localHour(e.startAt, timeZone)] += 1;

  const dias = [...new Set(sorted.map((p) => localDay(p.recorded_at, timeZone)))].sort();
  const primeiro = new Date(`${dias[0]}T12:00:00Z`).getTime();
  const ultimo = new Date(`${dias[dias.length - 1]}T12:00:00Z`).getTime();
  const diasNoPeriodo = Math.round((ultimo - primeiro) / 86_400_000) + 1;

  const gaps: GlucoseMetrics["coverage"]["gaps"] = [];
  for (let i = 1; i < dias.length; i++) {
    const a = new Date(`${dias[i - 1]}T12:00:00Z`).getTime();
    const b = new Date(`${dias[i]}T12:00:00Z`).getTime();
    const vao = Math.round((b - a) / 86_400_000);
    if (vao >= 2) gaps.push({ fromDay: dias[i - 1], toDay: dias[i], days: vao - 1 });
  }
  gaps.sort((a, b) => b.days - a.days);

  return {
    readings: n,
    mean: Math.round(mean),
    cvPercent,
    gmiPercent: Math.round((3.31 + 0.02392 * mean) * 100) / 100,
    tirPercent: Math.round(((n - abaixo - acima) / n) * 1000) / 10,
    tbrPercent: Math.round((abaixo / n) * 1000) / 10,
    tarPercent: Math.round((acima / n) * 1000) / 10,
    episodes: [...hipo, ...hiper].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    hipoEpisodes: hipo.length,
    hiperEpisodes: hiper.length,
    hipoByHour,
    hiperByHour,
    coverage: {
      daysWithData: dias.length,
      daysInPeriod: diasNoPeriodo,
      percent: Math.round((dias.length / diasNoPeriodo) * 1000) / 10,
      gaps,
    },
  };
}

export type HourPattern = {
  /** Faixa contígua de horas onde os episódios se concentram. */
  fromHour: number;
  toHour: number;
  count: number;
  total: number;
  percent: number;
};

/**
 * Concentração de episódios numa faixa de horas — a frase que vale a consulta.
 *
 * O critério é o BLOCO CONTÍGUO de horas com episódio, e não uma janela de
 * largura fixa. A primeira versão varria janelas de 3 a 8 horas e escolhia a
 * mais estreita que reunisse a maioria: com os episódios reais (3h, 4h, 5h, 6h
 * e 7h) ela parava em 4h–7h e deixava uma hipoglicemia de fora, porque 4 horas
 * já bastavam para cruzar o limiar. O bloco contíguo acha as cinco horas
 * inteiras sem precisar de largura arbitrária — e é o que se quer dizer com
 * "de madrugada".
 *
 * Devolve `null` quando não há concentração que se sustente: menos de
 * `minTotal` episódios, ou nenhum bloco que reúna a maioria deles. Achar padrão
 * em três episódios é ver forma em nuvem.
 */
export function findHourPattern(
  byHour: number[],
  minTotal = 5,
  minShare = 0.6
): HourPattern | null {
  const total = byHour.reduce((s, v) => s + v, 0);
  if (total < minTotal) return null;

  // Todas as horas ocupadas: aí não há bloco que distinga nada.
  if (byHour.every((v) => v > 0)) return null;

  // Começa depois de uma hora vazia, para os blocos não serem cortados no meio
  // — é o que permite enxergar faixa que cruza a meia-noite.
  const inicioVarredura = byHour.findIndex((v) => v === 0);
  let melhor: HourPattern | null = null;

  let h = 0;
  while (h < 24) {
    const hora = (inicioVarredura + h) % 24;
    if (byHour[hora] === 0) {
      h += 1;
      continue;
    }
    let soma = 0;
    let largura = 0;
    while (largura < 24 && byHour[(inicioVarredura + h + largura) % 24] > 0) {
      soma += byHour[(inicioVarredura + h + largura) % 24];
      largura += 1;
    }
    if (!melhor || soma > melhor.count) {
      melhor = {
        fromHour: hora,
        toHour: (inicioVarredura + h + largura - 1) % 24,
        count: soma,
        total,
        percent: Math.round((soma / total) * 1000) / 10,
      };
    }
    h += largura;
  }

  if (!melhor || melhor.count / total < minShare) return null;
  return melhor;
}
