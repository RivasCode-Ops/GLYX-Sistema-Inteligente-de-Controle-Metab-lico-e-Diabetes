import { CalendarDays, Dumbbell, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { getWeekPlan, LOAD_PATTERN, suggestFromPlan } from "@/lib/exercicios/training-plan";
import type { MuscleRecoveryStatus, TimeBudgetMinutes } from "@/lib/exercicios/muscle-recovery";

const WEEKDAY_LABEL: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
};

type Props = {
  statuses: MuscleRecoveryStatus[];
  /** Tempo disponível hoje — o plano é de 50 min/sessão, que cabe na faixa de 60. */
  minutes?: TimeBudgetMinutes;
  /** Injetável para teste/preview; em produção é o dia de hoje. */
  today?: Date;
};

export function TrainingPlanCard({ statuses, minutes = 60, today = new Date() }: Props) {
  const plan = suggestFromPlan(statuses, today, minutes);
  const week = getWeekPlan();
  const day = plan.suggested;
  const hasTraining = plan.included.length > 0;
  // Destaca o treino que vai acontecer, não o dia do calendário — senão, num dia
  // trocado, o topo do card diz "Superior B" e a grade acende "Inferior A".
  const highlighted = week.find((w) => w.day.id === plan.suggested.id)?.weekday ?? today.getDay();

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="text-base">Hoje: {day.label}</CardTitle>
        <CardDescription>{day.focus}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.swapped ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-zinc-300">
            <StatusPill tone="amber" className="mb-1.5">
              Dia trocado
            </StatusPill>
            <p>{plan.reason}</p>
          </div>
        ) : null}

        {hasTraining ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {plan.included.map((s) => (
                <StatusPill key={s.id} tone="emerald">
                  {s.label}
                </StatusPill>
              ))}
              {plan.resting.map((s) => (
                <StatusPill key={s.id} tone="amber">
                  {s.label} · {s.status === "paused" ? "pausado" : `${s.hoursRemaining}h`}
                </StatusPill>
              ))}
              {plan.deferred.map((s) => (
                <StatusPill key={s.id} tone="zinc">
                  {s.label} · fora do tempo
                </StatusPill>
              ))}
            </div>

            {!plan.swapped ? <p className="text-xs text-zinc-500">{plan.reason}</p> : null}

            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2.5">
                <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <span>
                  {LOAD_PATTERN.intensity} · {LOAD_PATTERN.effort}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Timer className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <span>
                  {LOAD_PATTERN.rest} · sessão de {LOAD_PATTERN.sessionMinutes} min
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <span>{LOAD_PATTERN.progression}</span>
              </li>
            </ul>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">{plan.reason}</p>
            {plan.resting.length ? (
              <div className="flex flex-wrap gap-1.5">
                {plan.resting.map((s) => (
                  <StatusPill key={s.id} tone="amber">
                    {s.label} · {s.status === "paused" ? "pausado" : `${s.hoursRemaining}h`}
                  </StatusPill>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-zinc-500">
              Uma caminhada leve ainda ajuda a glicemia mesmo em dia sem musculação.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">Semana</p>
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {week.map(({ weekday: wd, day: d }) => (
              <li
                key={wd}
                className={`flex items-center justify-between px-3 py-2 text-sm ${
                  wd === highlighted ? "bg-emerald-500/5" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-8 font-mono text-xs text-zinc-500">{WEEKDAY_LABEL[wd]}</span>
                  <span className={wd === highlighted ? "text-emerald-300" : "text-zinc-300"}>
                    {d.label}
                  </span>
                </span>
                <span className="text-xs text-zinc-500">{d.focus}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] leading-4 text-zinc-600">
          Plano individual — valide com seu médico/endocrinologista antes de iniciar, e ajuste as
          cargas com acompanhamento profissional.
        </p>
      </CardContent>
    </Card>
  );
}
