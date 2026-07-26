import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeeklySummary } from "@/lib/queries/weekly-summary";
import { weeklySummaryText, type WeeklyDelta, type WeeklyHighlight } from "@/lib/audit/weekly-summary";
import { WeeklySummaryExport } from "@/components/analise/weekly-summary-export";

export const metadata = { title: "Resumo da semana — GLYX" };

const HIGHLIGHT_CLASS: Record<WeeklyHighlight["tone"], string> = {
  bom: "border-emerald-900/60 bg-emerald-950/30 text-emerald-100",
  atencao: "border-amber-900/60 bg-amber-950/30 text-amber-100",
  info: "border-zinc-800 bg-zinc-950/60 text-zinc-300",
};

function fmtDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Seta de variação. A cor segue o SIGNIFICADO, não o sinal: menos hipoglicemia
 * é verde mesmo sendo um número negativo.
 */
function DeltaBadge({ d, unit = "" }: { d: WeeklyDelta; unit?: string }) {
  if (d.delta == null) return null;
  if (d.delta === 0) return <span className="text-[11px] text-zinc-500">igual</span>;

  const improved = d.lowerIsBetter ? d.delta < 0 : d.delta > 0;
  const arrow = d.delta > 0 ? "▲" : "▼";
  return (
    <span className={`text-[11px] ${improved ? "text-emerald-300" : "text-amber-300"}`}>
      {arrow} {Math.abs(d.delta)}
      {unit}
    </span>
  );
}

function Tile({
  label,
  d,
  unit = "",
  suffix,
}: {
  label: string;
  d: WeeklyDelta;
  unit?: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-zinc-100">
          {d.current != null ? `${d.current}${unit}` : "—"}
        </span>
        <DeltaBadge d={d} unit={unit} />
      </div>
      {suffix ? <div className="mt-0.5 text-[11px] text-zinc-500">{suffix}</div> : null}
    </div>
  );
}

export default async function ResumoSemanalPage() {
  const summary = await getWeeklySummary();

  if (!summary) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-sm text-zinc-400">Entre na sua conta para ver o resumo da semana.</p>
      </div>
    );
  }

  const { metrics } = summary;
  const text = weeklySummaryText(summary);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-zinc-400">
        Sua semana ({fmtDate(summary.periodStart)} a {fmtDate(summary.periodEnd)}) comparada com a
        anterior. Faixa alvo {summary.targetMin}–{summary.targetMax} mg/dL, definida no{" "}
        <Link href="/perfil" className="underline">
          perfil
        </Link>
        .
      </p>

      {!summary.hasData ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ainda não dá para resumir a semana</CardTitle>
            <CardDescription>
              {metrics.readingCount} leitura(s) em {metrics.daysWithGlucose} dia(s) — pouco para
              descrever uma semana sem enganar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/glicemia"
              className="inline-block rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-zinc-950"
            >
              Registrar glicemia
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Glicemia</CardTitle>
              <CardDescription>
                {summary.comparable
                  ? "Comparado com a semana anterior."
                  : "Sem semana anterior comparável — os números são só desta semana."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile label="Tempo no alvo" d={summary.tirPercent} unit="%" />
                <Tile label="Média" d={summary.avgGlucose} unit=" mg/dL" />
                <Tile label="Abaixo da meta" d={summary.hypoCount} />
                <Tile label="Acima da meta" d={summary.hyperCount} />
                <Tile label="≥ 250 mg/dL" d={summary.severeHyperCount} />
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">Cobertura</div>
                  <div className="mt-0.5 text-lg font-semibold text-zinc-100">
                    {metrics.daysWithGlucose}/{metrics.windowDays}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    dias com leitura ({metrics.readingCount} no total)
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                Tempo no alvo é o percentual de <strong>leituras</strong> dentro da faixa, não de
                tempo — com sensor as duas coisas se aproximam, com registro manual não. Variação é
                mostrada em pontos percentuais.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hábitos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile label="Dias ativos" d={summary.activeDays} suffix="≥ 15 min" />
                <Tile label="Carboidrato/dia" d={summary.avgCarbsPerDay} unit=" g" />
                <Tile label="Dias com água" d={summary.waterDays} suffix="≥ 500 ml" />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {summary.highlights.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Destaques</CardTitle>
            <CardDescription>Calculados dos seus dados — sem IA no meio.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.highlights.map((h) => (
                <li key={h.id} className={`rounded-xl border p-3 text-xs leading-snug ${HIGHLIGHT_CLASS[h.tone]}`}>
                  {h.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Levar para fora do app</CardTitle>
          <CardDescription>
            Texto puro para colar em conversa, e-mail ou bloco de notas. Para consulta médica, o{" "}
            <Link href="/relatorio-medico" className="underline">
              relatório para o médico
            </Link>{" "}
            é mais completo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklySummaryExport text={text} />
        </CardContent>
      </Card>

      <p className="text-[11px] leading-snug text-zinc-500">
        Resumo educativo de autocuidado. Não é AGP nem laudo, não substitui avaliação médica e não
        deve orientar mudança de dose por conta própria.
      </p>
    </div>
  );
}
