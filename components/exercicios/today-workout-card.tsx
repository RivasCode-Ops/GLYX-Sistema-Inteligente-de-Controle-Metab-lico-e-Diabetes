import Link from "next/link";
import { CheckCircle2, Clock, Dumbbell, Layers, Moon } from "lucide-react";
import { LOAD_PATTERN, type TrainingDay } from "@/lib/exercicios/training-plan";

type Props = {
  day: TrainingDay;
  /** Sessões já registradas hoje — o card muda de "iniciar" para "registrado". */
  sessoesHoje: number;
  dataLabel: string;
};

/**
 * "Treino de hoje" — o card de ação da tela de Exercícios.
 *
 * Ele mostra o que o PLANO CADASTRADO diz para hoje. Não prescreve carga, não
 * ajusta série e não decide que hoje é dia de pegar leve: nada disso é decisão
 * do app. O tempo e a intensidade exibidos saem de `LOAD_PATTERN`, que é a
 * ficha do usuário, e o card diz de onde vieram.
 */
export function TodayWorkoutCard({ day, sessoesHoje, dataLabel }: Props) {
  const descanso = day.id === "descanso";
  const feito = sessoesHoje > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-module-exercicio/[0.09] via-zinc-900/40 to-zinc-900/20">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          {descanso ? (
            <Moon className="h-4 w-4 text-module-exercicio" aria-hidden />
          ) : (
            <Dumbbell className="h-4 w-4 text-module-exercicio" aria-hidden />
          )}
          <span className="font-medium">Treino de hoje</span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-500">{dataLabel}</span>
        </div>

        {descanso ? null : feito ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {sessoesHoje === 1 ? "1 sessão registrada" : `${sessoesHoje} sessões registradas`}
          </span>
        ) : (
          <Link
            href="#registrar"
            className="inline-flex items-center gap-1.5 rounded-full bg-module-exercicio px-4 py-1.5 text-xs font-semibold text-zinc-950 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-module-exercicio"
          >
            Registrar treino
          </Link>
        )}
      </div>

      <div className="px-5 pb-5 pt-4">
        {/* A barra vertical na cor do módulo é o "ponto" que o sistema visual
            permite: identidade pinta detalhe, severidade é que pinta bloco. */}
        <div className="border-l-2 border-module-exercicio pl-3">
          <p className="text-lg font-semibold text-zinc-50">{day.label}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{day.focus}</p>
        </div>

        {descanso ? null : (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
              <Layers className="h-3.5 w-3.5 text-module-exercicio" aria-hidden />
              {day.groups.length} {day.groups.length === 1 ? "grupo" : "grupos"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
              <Clock className="h-3.5 w-3.5 text-module-exercicio" aria-hidden />
              ~{LOAD_PATTERN.sessionMinutes} min previstos no plano
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
              <Dumbbell className="h-3.5 w-3.5 text-module-exercicio" aria-hidden />
              {LOAD_PATTERN.intensity}
            </span>
          </div>
        )}

        <Link
          href="/exercicios/plano"
          className="mt-4 inline-block text-xs text-module-exercicio hover:underline"
        >
          Ver o plano da semana →
        </Link>
      </div>
    </section>
  );
}
