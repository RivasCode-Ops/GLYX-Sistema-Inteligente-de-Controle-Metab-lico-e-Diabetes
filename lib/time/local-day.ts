const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
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
