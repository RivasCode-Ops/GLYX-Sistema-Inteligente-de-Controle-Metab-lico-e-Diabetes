import Link from "next/link";
import { getExamSeries } from "@/lib/queries/exam-series";
import { formatarDiaISO } from "@/lib/time/format";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Resultados ao longo do tempo — GLYX" };

/**
 * Série por analito — a tela que separa "arquivar exame" de "acompanhar exame".
 *
 * Ela NÃO classifica resultado como normal ou alterado. A faixa exibida é a
 * impressa no próprio laudo, e num dos exames o LDL vem com "<70" anotado à mão
 * pelo médico — meta individual, não referência de laboratório. Uma régua
 * própria do app criaria a segunda opinião, e o app passaria a contradizer o
 * papel que o usuário levou à consulta.
 */
export default async function ExamesSeriesPage() {
  const series = await getExamSeries();
  const comHistorico = series.filter((s) => s.pontos.length > 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm text-zinc-400">
        Cada analito ao longo das coletas. Ordenado pela data da COLETA, não pela do cadastro —{" "}
        <Link href="/exames" className="text-emerald-400 hover:underline">
          nos exames
        </Link>{" "}
        você informa a data e extrai os valores.
      </p>

      {series.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhum valor extraído ainda</CardTitle>
            <CardDescription>
              Cadastre um exame com o texto do laudo e use &quot;Extrair valores&quot;. A leitura é
              feita por regra, sem IA: o que ela reconhece vira série, e o que não reconhece
              continua guardado com o rótulo do laudo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {comHistorico.length === 0 && series.length > 0 ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
          Ainda há uma coleta só de cada analito. A comparação aparece a partir da segunda — é o que
          torna qualquer mudança avaliável.
        </p>
      ) : null}

      <ul className="space-y-2">
        {series.map((s) => (
          <li key={s.analyte} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-zinc-100">{s.label}</h2>
              {s.delta != null ? (
                <span className="font-mono text-xs text-zinc-400">
                  {s.delta > 0 ? "+" : ""}
                  {s.delta} entre a primeira e a última
                </span>
              ) : null}
            </div>

            <ul className="mt-2 space-y-1">
              {s.pontos.map((p, i) => (
                <li
                  key={`${s.analyte}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs"
                >
                  <span className="w-24 shrink-0 text-zinc-500">
                    {/* Sem data, a posição na série não significa nada — e a
                        tela diz isso em vez de fingir ordem. */}
                    {p.collectedOn ? formatarDiaISO(p.collectedOn) : "sem data"}
                  </span>
                  <span className="text-zinc-100">
                    {p.valueNum ?? p.valueText}
                    {p.unit ? <span className="text-zinc-500"> {p.unit}</span> : null}
                  </span>
                  {p.refText ? (
                    <span className="text-[11px] text-zinc-600">ref. {p.refText}</span>
                  ) : null}
                </li>
              ))}
            </ul>

            {s.semData > 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                {s.semData} {s.semData === 1 ? "coleta sem data" : "coletas sem data"} — informe a
                data no exame para a série ficar em ordem.
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
        As faixas mostradas são as impressas nos próprios laudos — inclusive metas anotadas à mão
        pelo seu médico. O app transcreve e organiza: não classifica gravidade, não diz o que é
        normal e não sugere conduta.
      </p>
    </div>
  );
}
