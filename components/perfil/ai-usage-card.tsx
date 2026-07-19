import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const KIND_LABEL: Record<string, string> = {
  chat: "Chat copiloto",
  meal_photo: "Foto de refeição",
  meal_text: "Estimativa de refeição por texto",
  meal_suggest: "Sugestão de refeição",
  exam: "Interpretação de exame",
  supplement: "Análise de suplemento",
  workout_suggestion: "Sugestão de treino",
};

type UsageRow = {
  kind: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
};

// Uso de IA do próprio usuário nos últimos 30 dias (RLS limita ao dono).
export async function AiUsageCard() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("ai_usage")
    .select("kind, prompt_tokens, completion_tokens")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .limit(2000);

  const rows = (data ?? []) as UsageRow[];

  const byKind = new Map<string, { calls: number; input: number; output: number }>();
  for (const r of rows) {
    const agg = byKind.get(r.kind) ?? { calls: 0, input: 0, output: 0 };
    agg.calls += 1;
    agg.input += r.prompt_tokens ?? 0;
    agg.output += r.completion_tokens ?? 0;
    byKind.set(r.kind, agg);
  }
  const totalInput = [...byKind.values()].reduce((s, a) => s + a.input, 0);
  const totalOutput = [...byKind.values()].reduce((s, a) => s + a.output, 0);
  const totalCalls = [...byKind.values()].reduce((s, a) => s + a.calls, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Uso de IA (últimos 30 dias)</CardTitle>
        <CardDescription>
          Tokens consumidos pelas funções de IA — base do controle de gastos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalCalls === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma chamada de IA no período.</p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm">
              {[...byKind.entries()].map(([kind, agg]) => (
                <li key={kind} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-zinc-300">{KIND_LABEL[kind] ?? kind}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {agg.calls} chamadas · {agg.input.toLocaleString("pt-BR")} entrada /{" "}
                    {agg.output.toLocaleString("pt-BR")} saída
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500">
              Total: {totalCalls} chamadas ·{" "}
              <span className="font-mono">
                {totalInput.toLocaleString("pt-BR")} tokens de entrada +{" "}
                {totalOutput.toLocaleString("pt-BR")} de saída
              </span>
              . O custo em US$ aparece no painel da Moonshot.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
