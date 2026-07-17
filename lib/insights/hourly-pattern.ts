// Padrão de glicemia por hora do dia (fuso do usuário): em quais janelas o
// valor costuma ficar acima da meta. Alimenta o contexto da IA para ela
// apontar "seus piores horários" com dado real, não impressão.

export type HourlyBucket = {
  hour: number;
  avg: number;
  count: number;
  /** % das leituras dessa hora acima da meta máxima. */
  pctAbove: number;
};

export function computeHourlyPattern(
  readings: { value_mg_dl: number; recorded_at: string }[],
  timezone: string,
  targetMax: number
): HourlyBucket[] {
  const byHour = new Map<number, number[]>();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
  for (const r of readings) {
    const hour = Number(fmt.format(new Date(r.recorded_at)));
    if (!Number.isFinite(hour)) continue;
    const arr = byHour.get(hour) ?? [];
    arr.push(r.value_mg_dl);
    byHour.set(hour, arr);
  }
  return [...byHour.entries()]
    .map(([hour, vals]) => ({
      hour,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      count: vals.length,
      pctAbove: Math.round((vals.filter((v) => v > targetMax).length / vals.length) * 100),
    }))
    .sort((a, b) => a.hour - b.hour);
}

/** Piores janelas do dia (mín. 4 leituras na hora), da pior para a melhor. */
export function worstHours(buckets: HourlyBucket[], top = 3): HourlyBucket[] {
  return buckets
    .filter((b) => b.count >= 4)
    .sort((a, b) => b.pctAbove - a.pctAbove || b.avg - a.avg)
    .slice(0, top)
    .filter((b) => b.pctAbove > 0);
}
