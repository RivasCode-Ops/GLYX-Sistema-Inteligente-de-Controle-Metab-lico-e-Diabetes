import Link from "next/link";
import { Dumbbell, HeartPulse, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { BodyGoal } from "@/lib/health/energy";
import { GOAL_LABEL } from "@/lib/health/energy";

type WeekItemType = "aerobico" | "forca" | "geral";
type WeekItem = { text: string; type: WeekItemType };

const TYPE_ICON: Record<WeekItemType, typeof Dumbbell> = {
  aerobico: HeartPulse,
  forca: Dumbbell,
  geral: Target,
};

/**
 * Orientação de treino por objetivo corporal, ancorada nas diretrizes ADA
 * (Rec. 5.37: resistido 2-3x/semana em dias não consecutivos para DM1 e DM2)
 * e na fisiologia do exercício em diabetes (aeróbico tende a baixar a
 * glicose; anaeróbico intenso pode subir).
 */
const PLANS: Record<BodyGoal, { focus: string; week: WeekItem[]; glucose: string }> = {
  lose: {
    focus: "Queimar gordura preservando músculo: combinação de aeróbico + força.",
    week: [
      { text: "3-5x aeróbico moderado (caminhada rápida, bike) 30-45 min", type: "aerobico" },
      { text: "2-3x musculação em dias não consecutivos (corpo todo)", type: "forca" },
      { text: "Meta ADA: 150+ min de atividade moderada por semana", type: "geral" },
    ],
    glucose:
      "Aeróbico tende a BAIXAR a glicose: meça antes e depois; com insulina/sulfonilureia, carregue carboidrato rápido e evite treinar no pico da medicação.",
  },
  gain: {
    focus: "Construir massa muscular — o músculo é o maior aliado do controle glicêmico.",
    week: [
      { text: "3-4x musculação progressiva em dias não consecutivos (ADA Rec. 5.37)", type: "forca" },
      { text: "Cargas desafiadoras: 8-12 repetições, 2-4 séries por grupo", type: "forca" },
      { text: "1-2x aeróbico leve para saúde cardiovascular", type: "aerobico" },
    ],
    glucose:
      "Treino intenso/anaeróbico pode SUBIR a glicose temporariamente (adrenalina) — não corrija por conta própria; observe o padrão e converse com seu médico.",
  },
  maintain: {
    focus: "Constância para estabilidade glicêmica.",
    week: [
      { text: "150 min/semana de atividade moderada (meta ADA)", type: "geral" },
      { text: "2-3x resistido em dias não consecutivos", type: "forca" },
      { text: "Evitar 2+ dias seguidos sem atividade", type: "geral" },
    ],
    glucose: "Meça antes/depois nos primeiros treinos para aprender seu padrão de resposta.",
  },
  recomp: {
    focus: "Ganhar músculo e perder gordura ao mesmo tempo: força é prioridade, cardio é complemento.",
    week: [
      { text: "3-4x musculação progressiva em dias não consecutivos (ADA Rec. 5.37)", type: "forca" },
      {
        text: "Cargas desafiadoras: 8-12 repetições, 2-4 séries por grupo — priorize progressão de carga",
        type: "forca",
      },
      {
        text: "2-3x aeróbico moderado, sem exagerar (déficit já vem da alimentação, não do cardio)",
        type: "aerobico",
      },
    ],
    glucose:
      "Combina os dois efeitos: força pode SUBIR a glicemia temporariamente, aeróbico tende a BAIXAR — meça nos dois tipos até aprender seu padrão.",
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
        <ul className="space-y-2">
          {plan.week.map((w) => {
            const Icon = TYPE_ICON[w.type];
            return (
              <li key={w.text} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <span>{w.text}</span>
              </li>
            );
          })}
        </ul>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-zinc-300">
          <StatusPill tone="amber" className="mb-1.5">
            Glicemia e treino
          </StatusPill>
          <p>{plan.glucose}</p>
        </div>
        <p className="text-[11px] leading-4 text-zinc-600">
          Baseado nas diretrizes ADA — inicie ou mude de treino com liberação médica.
        </p>
      </CardContent>
    </Card>
  );
}
