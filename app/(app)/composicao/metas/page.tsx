import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBodySnapshot } from "@/lib/queries/body-composition";
import { GoalForm, DeleteGoalButton } from "@/components/composicao/goal-form";
import { projectionMessage } from "@/lib/body/goals";
import { BODY_FIELDS, measurementValue } from "@/lib/body/fields";

export const metadata = { title: "Metas corporais — GLYX" };

export default async function MetasPage() {
  const snapshot = await getBodySnapshot();
  const goals = snapshot?.goals ?? [];
  const latest = snapshot?.latest ?? null;

  const currentByMetric: Record<string, number | null> = {};
  for (const field of BODY_FIELDS) {
    currentByMetric[field.key] = measurementValue(latest, field.key);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nova meta</CardTitle>
          <CardDescription>
            Uma meta por medida. Salvar de novo a mesma medida atualiza o alvo sem perder o ponto de
            partida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm currentByMetric={currentByMetric} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Suas metas</CardTitle>
          <CardDescription>Progresso contra o ponto de partida, e projeção no ritmo observado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {goals.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Nenhuma meta cadastrada. Sem metas, o painel não consegue calcular as barras de massa
              muscular e perda de gordura.
            </p>
          ) : (
            goals.map((goal) => (
              <div key={goal.key} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {goal.label}
                      {goal.achieved ? (
                        <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                          atingida
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {goal.start ?? "?"} → {goal.current ?? "?"} {goal.unit} · meta {goal.target}{" "}
                      {goal.unit}
                      {goal.targetDate
                        ? ` até ${new Date(`${goal.targetDate}T12:00:00Z`).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <DeleteGoalButton metric={goal.key} />
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  {goal.progressPercent != null ? (
                    <div
                      className={`h-full rounded-full ${goal.achieved ? "bg-emerald-400" : "bg-sky-400"}`}
                      style={{ width: `${goal.progressPercent}%` }}
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {goal.progressPercent != null ? `${goal.progressPercent}% do caminho · ` : ""}
                  {projectionMessage(goal)}
                </p>
                {goal.onTrack === false ? (
                  <p className="mt-1 text-[11px] text-amber-300">
                    No ritmo atual a projeção passa da data escolhida.
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
