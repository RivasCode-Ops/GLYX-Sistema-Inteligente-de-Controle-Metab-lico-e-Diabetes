const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - at.getTime()) / 60000;
}

/**
 * Início do dia local (00:00) no fuso do perfil, como instante UTC — mesmo
 * critério de "hoje" usado pelas funções SQL de cron (coalesce(timezone,
 * 'America/Sao_Paulo')). Sem isso, o servidor calcula "hoje" no fuso do
 * Vercel (UTC), o que desalinha o resumo do dashboard perto da meia-noite.
 */
export function startOfLocalDayISO(timezone: string | null | undefined, at: Date = new Date()): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const offsetMin = timeZoneOffsetMinutes(tz, at);
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const utcMs =
    Date.UTC(Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day), 0, 0, 0) -
    offsetMin * 60000;
  return new Date(utcMs).toISOString();
}

/**
 * Converte um horário de parede (ano/mês/dia/hora/min/seg, sem fuso) no fuso
 * informado para o instante UTC correspondente — para parsear timestamps de
 * fontes externas (ex.: LibreLinkUp) que vêm sem indicação de fuso. Preferir
 * isto a `new Date(stringSemFuso)`, cujo resultado depende do TZ do runtime
 * (funciona “por acaso” numa máquina local com o mesmo fuso do usuário e
 * quebra em produção, onde o servidor roda em UTC).
 */
export function wallClockToUTC(
  y: number,
  month: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timezone: string | null | undefined
): Date {
  const tz = timezone || DEFAULT_TIMEZONE;
  // Primeiro palpite em UTC só pra descobrir o offset do fuso nesse instante.
  const guess = new Date(Date.UTC(y, month - 1, d, h, mi, s));
  const offsetMin = timeZoneOffsetMinutes(tz, guess);
  return new Date(Date.UTC(y, month - 1, d, h, mi, s) - offsetMin * 60000);
}

/**
 * Data local (YYYY-MM-DD) no fuso do perfil para um instante UTC. Sem isso,
 * agrupar leituras "por dia" usando `iso.slice(0, 10)` (UTC) empurra
 * registros feitos entre ~21h e meia-noite (fuso America/Sao_Paulo) para o
 * dia seguinte.
 */
export function localDateKey(iso: string, timezone: string | null | undefined): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Intervalo [início, fim) em UTC que corresponde ao dia local `dateStr`
 * (YYYY-MM-DD) no fuso do perfil — para filtrar `recorded_at` de um dia
 * específico sem cair no mesmo problema de `localDateKey`.
 */
export function localDayRangeUTC(
  dateStr: string,
  timezone: string | null | undefined
): { startISO: string; endISO: string } {
  const tz = timezone || DEFAULT_TIMEZONE;
  const [y, m, d] = dateStr.split("-").map(Number);
  // Instante de referência dentro do próprio dia-alvo, só pra descobrir o
  // deslocamento (offset) do fuso nessa data (cobre horário de verão).
  const reference = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMin = timeZoneOffsetMinutes(tz, reference);
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60000;
  const endMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - offsetMin * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(endMs).toISOString() };
}
