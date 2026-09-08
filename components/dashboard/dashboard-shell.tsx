import Link from "next/link";
import {
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  Plug,
  LineChart,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GlucoseHeroCard } from "@/components/dashboard/glucose-hero-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { ModuleRow } from "@/components/dashboard/module-row";
import type { MetabolicAlert } from "@/types/database";

type Props = {
  latestGlucose: number | null;
  latestGlucoseAgeLabel?: string | null;
  latestGlucoseFreshness?: import("@/lib/health/reading-freshness").Freshness | null;
  glucoseTrend?: "up" | "down" | "flat" | null;
  glucoseSeries: number[];
  carbsToday: number;
  activeMinutes: number;
  waterMl: number;
  waterGoalMl: number;
  riskLabel: string;
  /** Faixa alvo por extenso, ex. "70–140" — a régua sem a qual `riskLabel` é adjetivo. */
  targetRangeLabel?: string | null;
  /** Contagem alimenta o card de acao; a lista mora em /analise/alertas. */
  alerts: MetabolicAlert[];
  stepsToday?: number | null;
  sleepHoursToday?: number | null;
  muscleFocusLabel?: string | null;
};

export function DashboardShell({
  latestGlucose,
  latestGlucoseAgeLabel = null,
  latestGlucoseFreshness = null,
  glucoseTrend = null,
  glucoseSeries,
  carbsToday,
  activeMinutes,
  waterMl,
  waterGoalMl,
  riskLabel,
  targetRangeLabel = null,
  stepsToday = null,
  sleepHoursToday = null,
  muscleFocusLabel = null,
}: Props) {
  const glucoseLabel = latestGlucose != null ? `${latestGlucose} mg/dL` : "— sem leituras";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <GlucoseHeroCard
          latestGlucose={latestGlucose}
          latestGlucoseAgeLabel={latestGlucoseAgeLabel}
          latestGlucoseFreshness={latestGlucoseFreshness}
          glucoseTrend={glucoseTrend}
          glucoseSeries={glucoseSeries}
          riskLabel={riskLabel}
          targetRangeLabel={targetRangeLabel}
          carbsToday={carbsToday}
          activeMinutes={activeMinutes}
          waterMl={waterMl}
          waterGoalMl={waterGoalMl}
        />
        <div className="flex flex-col gap-4">
          <NextStepCard
            latestGlucose={latestGlucose}
            carbsToday={carbsToday}
            activeMinutes={activeMinutes}
          />
          {(stepsToday != null || sleepHoursToday != null) && (
            <Card>
              <CardContent className="grid grid-cols-2 gap-3 p-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Passos</p>
                  <p className="mt-0.5 font-mono text-lg text-zinc-200">
                    {stepsToday != null ? stepsToday.toLocaleString("pt-BR") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Sono (h)</p>
                  <p className="mt-0.5 font-mono text-lg text-zinc-200">
                    {sleepHoursToday ?? "—"}
                  </p>
                </div>
                <p className="col-span-2 text-[11px] text-zinc-600">
                  Fonte com prioridade: manual → Apple → Google → mock.{" "}
                  <Link href="/integracoes" className="text-emerald-500/90 hover:underline">
                    Integrações
                  </Link>
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <section>
        {/* O cabeçalho tinha "Atividade hoje: N min", que era a TERCEIRA cópia
            do mesmo número — as outras duas estão no card de glicemia e na
            linha de Exercícios logo abaixo. A coluna direita desta lista é a
            fonte única dos números do dia; repetir aqui não reforça, dilui. */}
        <div className="mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Módulos</h2>
        </div>
        <Card>
          <CardContent className="p-4">
            <ModuleRow title="Glicemia" href="/glicemia" icon={Droplets} accent="glicemia" metric={glucoseLabel} />
            <ModuleRow
              title="Alimentação"
              href="/alimentacao"
              icon={UtensilsCrossed}
              accent="alimentacao"
              metric={`${carbsToday} g carb · hoje`}
            />
            <ModuleRow
              title="Exercícios"
              // A métrica agora é o treino do dia, então o destino é o plano —
              // clicar em "Hoje: Inferior A" e cair na tela de recuperação
              // deixava a recomendação sem continuidade.
              href="/exercicios/plano"
              icon={Dumbbell}
              accent="exercicio"
              // O `??` escondia uma troca de GRANDEZA: `muscleFocusLabel` é o
              // treino PLANEJADO do dia ("Inferior A"), e `activeMinutes` é o
              // que foi medido. Com plano cadastrado, a coluna deixava de
              // mostrar o número do dia e passava a mostrar uma intenção — na
              // mesma coluna, em `font-mono`, que em Glicemia mostra leitura de
              // sensor. Era isso que fazia a tela dizer "Inferior A" enquanto o
              // card de dica dizia "nenhuma atividade hoje": as duas estavam
              // certas, sobre coisas diferentes.
              //
              // Agora as duas aparecem, e a medição nunca some.
              metric={
                muscleFocusLabel
                  ? `${muscleFocusLabel} · ${activeMinutes} min`
                  : `${activeMinutes} min · hoje`
              }
            />
            <ModuleRow title="Medicação" href="/medicacao" icon={Pill} accent="medicacao" metric="Ver agenda" />
            <ModuleRow title="Exames" href="/exames" icon={FileText} metric="Lab · ECG · Raio-X" />
            <ModuleRow title="Análise" href="/analise" icon={LineChart} metric="Risco · correlações" />
            <ModuleRow
              title="Integrações"
              href="/integracoes"
              icon={Plug}
              metric={
                stepsToday != null ? `${stepsToday.toLocaleString("pt-BR")} passos` : "Conectar fontes"
              }
            />
          </CardContent>
        </Card>
      </section>

      {/* A lista de "Alertas recentes" saiu do painel e vive em /analise/alertas,
          que já existia. Ela é histórico: o painel mostra no máximo o que ainda
          está ABERTO, e isso é papel do card de ação, não de uma lista.

          `alerts` continua na assinatura porque a contagem alimenta o card de
          ação; o que saiu foi a renderização da lista aqui. */}
    </div>
  );
}
