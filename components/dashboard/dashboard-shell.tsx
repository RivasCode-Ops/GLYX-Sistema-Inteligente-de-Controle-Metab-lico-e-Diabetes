import Link from "next/link";
import {
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  BellRing,
  Plug,
  LineChart,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlucoseHeroCard } from "@/components/dashboard/glucose-hero-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { ModuleRow } from "@/components/dashboard/module-row";
import type { MetabolicAlert } from "@/types/database";

type Props = {
  latestGlucose: number | null;
  glucoseSeries: number[];
  carbsToday: number;
  activeMinutes: number;
  waterMl: number;
  waterGoalMl: number;
  riskLabel: string;
  alerts: MetabolicAlert[];
  stepsToday?: number | null;
  sleepHoursToday?: number | null;
  muscleFocusLabel?: string | null;
};

export function DashboardShell({
  latestGlucose,
  glucoseSeries,
  carbsToday,
  activeMinutes,
  waterMl,
  waterGoalMl,
  riskLabel,
  alerts,
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
          glucoseSeries={glucoseSeries}
          riskLabel={riskLabel}
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
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Módulos</h2>
          <p className="text-xs text-zinc-600">
            Atividade hoje: <span className="font-mono text-zinc-400">{activeMinutes} min</span>
          </p>
        </div>
        <Card>
          <CardContent className="p-4">
            <ModuleRow title="Glicemia" href="/glicemia" icon={Droplets} metric={glucoseLabel} />
            <ModuleRow
              title="Alimentação"
              href="/alimentacao"
              icon={UtensilsCrossed}
              metric={`${carbsToday} g carb · hoje`}
            />
            <ModuleRow
              title="Exercícios"
              // A métrica agora é o treino do dia, então o destino é o plano —
              // clicar em "Hoje: Inferior A" e cair na tela de recuperação
              // deixava a recomendação sem continuidade.
              href="/exercicios/plano"
              icon={Dumbbell}
              metric={muscleFocusLabel ?? `${activeMinutes} min · hoje`}
            />
            <ModuleRow title="Medicação" href="/medicacao" icon={Pill} metric="Ver agenda" />
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

      <Card className="transition hover:border-sky-600/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-base">Alertas recentes</CardTitle>
          </div>
          <CardDescription>
            <Link href="/analise/alertas" className="text-emerald-400 hover:underline">
              Ver todos os alertas →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          {alerts.length === 0 ? (
            <p>Nenhum alerta não lido.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 3).map((a) => (
                <li key={a.id} className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
                  <span className="text-xs uppercase text-amber-500/90">{a.severity}</span>
                  <p className="text-zinc-200">{a.title}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
