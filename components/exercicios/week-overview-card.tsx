import { Activity, Flame, Target, TrendingUp, Timer } from "lucide-react";
import type { ResumoSemanaExercicio } from "@/lib/exercicios/week-overview";

const KIND_LABEL: Record<string, string> = {
  cardio: "Cardio",
  forca: "Força",
  outro: "Outro",
};

const FAIXA_LABEL: Record<ResumoSemanaExercicio["carga"]["faixa"], string> = {
  leve: "Leve",
  moderada: "Moderada",
  alta: "Alta",
};

/** Anel de progresso em SVG. Sem biblioteca: a regra-zero proíbe dependência
 *  externa em runtime, e um círculo com `stroke-dasharray` não justifica uma. */
function Anel({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const preenchido = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-zinc-800" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${preenchido} ${c - preenchido}`}
          className="stroke-module-exercicio"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-zinc-100">
        {pct}%
      </span>
    </div>
  );
}

export function WeekOverviewCard({ resumo }: { resumo: ResumoSemanaExercicio }) {
  const { progresso, dias, diasTreinados, metaSessoes, kcal, kcalDeSessoes, carga } = resumo;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        {/* Sua semana */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-200">Sua semana</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {diasTreinados}/{metaSessoes} {metaSessoes === 1 ? "treino" : "treinos"} — meta de{" "}
                {progresso.targetMinutes} min
              </p>
            </div>
            <Anel pct={progresso.progressPct} />
          </div>

          <ul className="mt-3 flex items-end justify-between gap-1">
            {dias.map((d) => (
              <li key={d.dia} className="flex flex-col items-center gap-1.5">
                {/* Dia vazio no passado e dia que ainda não chegou são coisas
                    diferentes, e quem não distingue matiz não separa as duas
                    por cor — por isso o futuro é tracejado, não só mais claro. */}
                <span
                  className={[
                    "h-6 w-6 rounded-full border",
                    d.treinou
                      ? "border-module-exercicio bg-module-exercicio"
                      : d.futuro
                        ? "border-dashed border-zinc-700 bg-transparent"
                        : "border-zinc-700 bg-zinc-800/60",
                  ].join(" ")}
                  aria-label={`${d.sigla}: ${
                    d.treinou ? "treinou" : d.futuro ? "ainda não chegou" : "sem registro"
                  }`}
                />
                <span
                  className={`text-[10px] ${d.hoje ? "font-semibold text-zinc-200" : "text-zinc-500"}`}
                >
                  {d.sigla}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Resumo rápido */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-medium text-zinc-200">Resumo rápido</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-module-exercicio/15">
                <Timer className="h-4 w-4 text-module-exercicio" aria-hidden />
              </span>
              <div>
                <p className="font-mono text-base text-zinc-100">{progresso.minutes} min</p>
                <p className="text-[11px] text-zinc-500">tempo total</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-module-alimentacao/15">
                <Flame className="h-4 w-4 text-module-alimentacao" aria-hidden />
              </span>
              <div>
                {/* O app NÃO estima caloria de treino: sem peso, intensidade e
                    frequência cardíaca, o número seria chute com aparência de
                    medida. Só aparece o que os registros trouxeram. */}
                <p className="font-mono text-base text-zinc-100">
                  {kcal == null ? "—" : `${kcal.toLocaleString("pt-BR")} kcal`}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {kcal == null
                    ? "nenhuma sessão informou gasto"
                    : `de ${kcalDeSessoes} ${kcalDeSessoes === 1 ? "sessão" : "sessões"}`}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Ladrilhos */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <Activity className="h-4 w-4 text-module-exercicio" aria-hidden />
          <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">Sessões</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-100">
            {progresso.sessions}
            <span className="text-sm font-normal text-zinc-500"> de {metaSessoes}</span>
          </p>
          {progresso.breakdown.length > 0 ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              {progresso.breakdown
                .map((b) => `${KIND_LABEL[b.kind] ?? b.kind} ${b.minutes} min`)
                .join(" · ")}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500">sem registro esta semana</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <TrendingUp className="h-4 w-4 text-module-exercicio" aria-hidden />
          <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">Carga da semana</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-100">{FAIXA_LABEL[carga.faixa]}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {/* Sem semana anterior com minuto nenhum não há do que variar — e
                "+100%" saindo de zero seria número sem significado. */}
            {carga.deltaPct == null
              ? "sem semana anterior para comparar"
              : `${carga.deltaPct >= 0 ? "+" : ""}${carga.deltaPct}% vs. semana anterior`}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <Target className="h-4 w-4 text-module-exercicio" aria-hidden />
          <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">Meta</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-100">
            {progresso.status === "ahead"
              ? "Atingida"
              : progresso.status === "on-track"
                ? "Em dia"
                : "Atrás"}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {resumo.semanasSeguidasNaMeta > 0
              ? `${resumo.semanasSeguidasNaMeta} ${
                  resumo.semanasSeguidasNaMeta === 1 ? "semana seguida" : "semanas seguidas"
                } na meta`
              : progresso.message}
          </p>
        </div>
      </div>

      {/* A sugestão é a única linha da tela que muda com a glicemia — vem de
          `computeWeeklyExerciseProgress`, que a decide, e não de texto solto. */}
      <p className="rounded-2xl border border-module-exercicio/25 bg-module-exercicio/[0.07] px-4 py-3 text-sm text-zinc-300">
        {progresso.workoutSuggestion}
      </p>
    </div>
  );
}
