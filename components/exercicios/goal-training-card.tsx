import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BodyGoal } from "@/lib/health/energy";
import { GOAL_LABEL } from "@/lib/health/energy";
import Link from "next/link";

/**
 * Orientação de treino por objetivo corporal, ancorada nas diretrizes ADA
 * (Rec. 5.37: resistido 2-3x/semana em dias não consecutivos para DM1 e DM2)
 * e na fisiologia do exercício em diabetes (aeróbico tende a baixar a
 * glicose; anaeróbico intenso pode subir).
 */
const PLANS: Record<BodyGoal, { focus: string; week: string[]; glucose: string }> = {
  lose: {
    focus: "Queimar gordura preservando músculo: combinação de aeróbico + força.",
    week: [
      "3-5x aeróbico moderado (caminhada rápida, bike) 30-45 min",
      "2-3x musculação em dias não consecutivos (corpo todo)",
      "Meta ADA: 150+ min de atividade moderada por semana",
    ],
    glucose:
      "Aeróbico tende a BAIXAR a glicose: meça antes e depois; com insulina/sulfonilureia, carregue carboidrato rápido e evite treinar no pico da medicação.",
  },
  gain: {
    focus: "Construir massa muscular — o músculo é o maior aliado do controle glicêmico.",
    week: [
      "3-4x musculação progressiva em dias não consecutivos (ADA Rec. 5.37)",
      "Cargas desafiadoras: 8-12 repetições, 2-4 séries por grupo",
      "1-2x aeróbico leve para saúde cardiovascular",
    ],
    glucose:
      "Treino intenso/anaeróbico pode SUBIR a glicose temporariamente (adrenalina) — não corrija por conta própria; observe o padrão e converse com seu médico.",
  },
  maintain: {
    focus: "Constância para estabilidade glicêmica.",
    week: [
      "150 min/semana de atividade moderada (meta ADA)",
      "2-3x resistido em dias não consecutivos",
      "Evitar 2+ dias seguidos sem atividade",
    ],
    glucose: "Meça antes/depois nos primeiros treinos para aprender seu padrão de resposta.",
  },
};

export function GoalTrainingCard({ goal }: { goal: BodyGoal | null | undefined }) {
  if (!goal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Treino pelo seu objetivo</CardTitle>
          <CardDescription>
            Defina seu objetivo corporal no{" "}
            <Link href="/perfil" className="text-emerald-400 underline">
              Perfil
            </Link>{" "}
            para receber orientação de treino personalizada.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const plan = PLANS[goal];
  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="text-base">Treino para: {GOAL_LABEL[goal]}</CardTitle>
        <CardDescription>{plan.focus}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm text-zinc-300">
          {plan.week.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-zinc-300">
          <span className="font-medium text-amber-300">Glicemia e treino: </span>
          {plan.glucose}
        </div>
        <p className="text-[11px] leading-4 text-zinc-600">
          Baseado nas diretrizes ADA — inicie ou mude de treino com liberação médica.
        </p>
      </CardContent>
    </Card>
  );
}
