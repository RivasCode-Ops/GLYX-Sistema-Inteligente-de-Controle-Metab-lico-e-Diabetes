/**
 * Idade do dado — o conceito que faltava no app.
 *
 * O painel mostrava `116 mg/dL` sob o rótulo **"Glicemia atual"** com uma
 * leitura de 13/08, e a consulta que a buscava nem trazia o `recorded_at`:
 * `select("value_mg_dl")`. Não era um erro de formatação da data — a idade do
 * dado não existia no caminho, então nenhuma tela tinha como saber que o número
 * estava velho. Daí a mesma falha aparecer em vários lugares.
 *
 * O que está em jogo não é estética. Num app de quem aplica insulina, um número
 * antigo apresentado como atual é pior que nenhum número: ele responde com
 * confiança a pergunta "como estou agora?".
 *
 * Os cortes, e por que estes:
 *
 * - **20 min** — o Libre entrega leitura a cada ~5 min. Passados 20, são quatro
 *   ciclos perdidos: já não é "agora", é "a última que chegou".
 * - **6 h** — o limite em que um valor ainda diz algo sobre o dia corrente.
 *   Depois disso, qualquer leitura vira histórico: continua valendo para ver
 *   tendência, não para descrever o presente.
 *
 * Nenhum dos dois é regra clínica — são regras de *apresentação*. Por isso
 * moram aqui e não em `glucose-thresholds.ts`, que trata de faixa alvo e é
 * decisão médica.
 */

export const FRESH_MAX_MINUTES = 20;
export const RECENT_MAX_MINUTES = 6 * 60;

/** `fresh` descreve o agora; `recent` descreve o dia; `stale` só descreve o passado. */
export type Freshness = "fresh" | "recent" | "stale";

export type ReadingAge = {
  minutes: number;
  freshness: Freshness;
  /** Texto pronto para a tela, em pt-BR. Mesma frase em toda tela que usar isto. */
  label: string;
};

/** Idade de um registro. `now` é injetável para o teste não depender do relógio. */
export function readingAge(recordedAt: string | Date, now: Date = new Date()): ReadingAge {
  const quando = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
  const minutes = Math.max(0, Math.floor((now.getTime() - quando.getTime()) / 60000));
  const freshness: Freshness =
    minutes <= FRESH_MAX_MINUTES
      ? "fresh"
      : minutes <= RECENT_MAX_MINUTES
        ? "recent"
        : "stale";
  return { minutes, freshness, label: describeAge(minutes) };
}

/**
 * "agora", "há 12 min", "há 3 h", "há 21 dias".
 *
 * Uma frase só, num lugar só: o app dava três respostas diferentes para "qual
 * foi a última leitura" porque cada tela formatava a sua.
 */
export function describeAge(minutes: number): string {
  if (minutes <= 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const horas = Math.floor(minutes / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/**
 * Tendência de verdade: exige DUAS leituras próximas no tempo.
 *
 * O card antigo desenhava seta e escrevia "estável" a partir de **um** valor —
 * `>= 140` virava "subindo", `< 100` virava "caindo", o resto "estável". Isso
 * não é tendência, é a faixa do valor com nome de direção; e o pior caso é
 * justamente o que mais engana: glicemia despencando de 200 para 130 aparecia
 * como "estável".
 *
 * Devolve `null` quando não dá para afirmar direção — e null é resposta, não
 * falta de resposta: a tela não desenha seta nenhuma.
 */
export function glucoseTrend(
  pontos: { value: number; recordedAt: string | Date }[],
  maxGapMinutes = 30
): "up" | "down" | "flat" | null {
  if (pontos.length < 2) return null;
  // A série chega em ordem cronológica; os dois últimos é que dizem a direção.
  const anterior = pontos[pontos.length - 2];
  const atual = pontos[pontos.length - 1];
  const t1 = new Date(anterior.recordedAt).getTime();
  const t2 = new Date(atual.recordedAt).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  const gap = Math.abs(t2 - t1) / 60000;
  if (gap > maxGapMinutes) return null;

  const delta = atual.value - anterior.value;
  if (delta >= 10) return "up";
  if (delta <= -10) return "down";
  return "flat";
}
