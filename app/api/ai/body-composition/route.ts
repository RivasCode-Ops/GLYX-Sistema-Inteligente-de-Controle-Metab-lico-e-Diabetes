import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import { createClient } from "@/lib/supabase/server";
import { loadBodySnapshot, PROGRESSION_WINDOW_WEEKS, VOLUME_WINDOW_WEEKS } from "@/lib/queries/body-composition";
import { METHOD_LABEL } from "@/lib/body/composition";
import { progressSummary } from "@/lib/body/progress";
import { projectionMessage } from "@/lib/body/goals";
import { dailyTargets, GOAL_LABEL } from "@/lib/health/energy";

const resultSchema = z.object({
  headline: z.string(),
  reading: z.string(),
  muscle: z.string(),
  fat: z.string(),
  training: z.string(),
  metabolic: z.string(),
  priorities: z.array(z.object({ title: z.string(), why: z.string(), action: z.string() })),
  caveats: z.array(z.string()),
});

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const snapshot = await loadBodySnapshot(supabase, user.id);

  if (snapshot.history.length < 2) {
    return NextResponse.json(
      {
        error:
          "São necessárias pelo menos duas medições para analisar evolução. Registre uma nova medição em algumas semanas.",
      },
      { status: 400 }
    );
  }

  // Contexto metabólico: o diferencial deste app é ler composição corporal
  // JUNTO com glicemia, sono e alimentação — não como um app de academia
  // qualquer que só olha a fita.
  const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [glucoseRes, sleepRes, mealsRes] = await Promise.all([
    supabase
      .from("glucose_readings")
      .select("value_mg_dl")
      .eq("user_id", user.id)
      .gte("recorded_at", since14d),
    supabase
      .from("health_snapshots")
      .select("sleep_hours")
      .eq("user_id", user.id)
      .gte("snapshot_date", since14d.slice(0, 10))
      .not("sleep_hours", "is", null),
    supabase
      .from("meals")
      .select("calories, protein_g, carbs_g, eaten_at")
      .eq("user_id", user.id)
      .gte("eaten_at", since14d),
  ]);

  const glucose = (glucoseRes.data ?? []) as { value_mg_dl: number }[];
  const glucoseAvg = glucose.length
    ? Math.round(glucose.reduce((s, g) => s + Number(g.value_mg_dl), 0) / glucose.length)
    : null;

  const sleep = (sleepRes.data ?? []) as { sleep_hours: number | null }[];
  const sleepAvg = sleep.length
    ? Math.round((sleep.reduce((s, r) => s + Number(r.sleep_hours ?? 0), 0) / sleep.length) * 10) / 10
    : null;

  const meals = (mealsRes.data ?? []) as {
    calories: number | null;
    protein_g: number | null;
    eaten_at: string;
  }[];
  const mealDays = new Set(meals.map((m) => m.eaten_at.slice(0, 10))).size;
  const proteinPerDay =
    mealDays > 0
      ? Math.round(meals.reduce((s, m) => s + Number(m.protein_g ?? 0), 0) / mealDays)
      : null;
  const caloriesPerDay =
    mealDays > 0
      ? Math.round(meals.reduce((s, m) => s + Number(m.calories ?? 0), 0) / mealDays)
      : null;

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "Chave de IA não configurada.", demo: true }, { status: 503 });
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "body_composition");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const { profile, latestComposition, progress, goals, volume, progressions, weekly } = snapshot;

  const energyTargets =
    profile.sex && profile.ageYears && profile.heightCm && latestComposition?.weightKg
      ? dailyTargets(
          {
            sex: profile.sex,
            age: profile.ageYears,
            heightCm: profile.heightCm,
            weightKg: latestComposition.weightKg,
            activity: "moderate",
          },
          profile.bodyGoal ?? "maintain"
        )
      : null;

  const deltaLines = progress
    ? progress.deltas
        .filter((d) => !d.withinNoise)
        .map((d) => `  - ${d.label}: ${d.from} → ${d.to} ${d.unit} (${d.delta > 0 ? "+" : ""}${d.delta})`)
        .join("\n") || "  - nenhuma medida variou além da margem de erro"
    : "  - sem período comparável";

  const goalLines = goals.length
    ? goals
        .map((g) => `  - ${g.label}: ${g.start ?? "?"} → ${g.current ?? "?"} (meta ${g.target} ${g.unit}); ${projectionMessage(g)}`)
        .join("\n")
    : "  - nenhuma meta cadastrada";

  const volumeLines = volume
    .filter((v) => v.status !== "sem_registro" || v.minTarget > 0)
    .map((v) => `  - ${v.label}: ${v.setsPerWeek} séries/semana (referência ${v.minTarget}-${v.optimalTarget}) — ${v.status}`)
    .join("\n");

  const progressionLines = progressions.length
    ? progressions
        .slice(0, 10)
        .map(
          (p) =>
            `  - ${sanitizeForPrompt(p.exercise, 40)}: 1RM estimado ${p.firstOneRm} → ${p.lastOneRm} kg (${p.deltaPercent > 0 ? "+" : ""}${p.deltaPercent}%)`
        )
        .join("\n")
    : "  - sem registro de carga na janela";

  const PROMPT = `És um analista de composição corporal (PT-BR) para uma pessoa que também acompanha diabetes neste app. És direto, técnico e honesto — não motivacional vazio, não alarmista.

TODOS OS NÚMEROS ABAIXO JÁ FORAM CALCULADOS. Usa-os como âncora e NUNCA recalcules, reestimes ou contradigas nenhum deles.

PERFIL
- Sexo: ${profile.sex === "m" ? "masculino" : profile.sex === "f" ? "feminino" : "não informado"} | Idade: ${profile.ageYears ?? "?"} | Altura: ${profile.heightCm ?? "?"} cm
- Objetivo declarado: ${profile.bodyGoal ? GOAL_LABEL[profile.bodyGoal] : "não definido"}${profile.targetWeightKg ? ` | Peso-meta: ${profile.targetWeightKg} kg` : ""}
- Usa medicação que baixa glicemia (insulina/secretagogo): ${snapshot.glucoseLoweringMeds ? "SIM" : "não"}

COMPOSIÇÃO ATUAL (medição de ${snapshot.latest?.measured_on})
- Peso ${latestComposition?.weightKg ?? "?"} kg | IMC ${latestComposition?.bmi ?? "?"} | cintura/altura ${latestComposition?.waistToHeight ?? "?"}
- Gordura estimada ${latestComposition?.bodyFatPercent ?? "?"}%${latestComposition?.bodyFatMethod ? ` (método: ${METHOD_LABEL[latestComposition.bodyFatMethod]})` : ""}
- Massa magra ${latestComposition?.leanMassKg ?? "?"} kg | FFMI ${latestComposition?.ffmi ?? "?"}

EVOLUÇÃO NO PERÍODO (${progress?.fromDate} → ${progress?.toDate}, ${progress?.days} dias)
- Leitura já classificada pelo sistema: ${progress?.verdict.headline} — ${progress?.verdict.detail}
- Resumo: ${progress ? progressSummary(progress) : "—"}
- Split massa magra/gordura: ${progress?.splitIsEstimated ? `massa magra ${progress.leanDeltaKg} kg, gordura ${progress.fatDeltaKg} kg` : "não calculável (falta % de gordura pelo mesmo método nas duas datas)"}
- Medidas que mudaram além da margem de erro (0,5 kg / 1 cm):
${deltaLines}

METAS
${goalLines}

TREINO (volume: ${VOLUME_WINDOW_WEEKS} semanas | progressão: ${PROGRESSION_WINDOW_WEEKS} semanas)
- Minutos nesta semana: ${weekly.minutes} de ${weekly.targetMinutes} planejados
- Volume semanal por grupo:
${volumeLines}
- Progressão de carga:
${progressionLines}

CONTEXTO METABÓLICO (14 dias)
- Glicemia média: ${glucoseAvg ?? "sem registro"} mg/dL
- Sono médio: ${sleepAvg ?? "sem registro"} h/noite
- Alimentação registrada: ${caloriesPerDay ?? "sem registro"} kcal/dia, ${proteinPerDay ?? "?"} g de proteína/dia (${mealDays} dias com registro)${
    energyTargets
      ? `\n- Referência calculada para o objetivo: ${energyTargets.calories} kcal/dia e ${energyTargets.protein_g} g de proteína/dia`
      : ""
  }

REGRAS
- Diferença dentro da margem de erro é ESTABILIDADE, não evolução. Nunca comemore ruído.
- Se o registro alimentar cobre poucos dias, diz que a leitura de dieta é frágil em vez de concluir sobre ela.
- Podes sugerir volume, frequência e progressão de treino. NÃO prescrevas dieta específica nem dose de medicamento.
- Se a pessoa usa insulina ou secretagogo, qualquer sugestão que envolva comer menos vem acompanhada de "ajuste com seu médico antes" — risco de hipoglicemia é real.
- Percentual de gordura por fita/dobra é estimativa com erro de 3-4 pontos: fala de tendência, nunca do valor absoluto como se fosse exame.
- No máximo 3 prioridades, cada uma acionável nesta semana.

Responde APENAS com JSON válido:
{"headline":"uma frase que resume o momento","reading":"2-4 frases interpretando a evolução, no estilo 'você ganhou X kg, destes ~Y parecem massa magra, cintura -Z cm'","muscle":"leitura de ganho de massa","fat":"leitura de gordura","training":"leitura do treino: volume, progressão e o que ajustar","metabolic":"como glicemia, sono e alimentação se relacionam com o resultado","priorities":[{"title":"...","why":"...","action":"..."}],"caveats":["limitações desta análise"]}`;

  const openai = createAiClient();
  let completion;
  try {
    completion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 1400,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  let json: unknown;
  try {
    json = JSON.parse(completion.choices[0]?.message?.content ?? "");
  } catch {
    return NextResponse.json({ error: "Resposta inválida do modelo. Tente novamente." }, { status: 502 });
  }
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Formato inesperado do modelo. Tente novamente." }, { status: 502 });
  }

  return NextResponse.json({
    ...parsed.data,
    computed: {
      progress: progress
        ? {
            fromDate: progress.fromDate,
            toDate: progress.toDate,
            days: progress.days,
            verdict: progress.verdict,
            leanDeltaKg: progress.leanDeltaKg,
            fatDeltaKg: progress.fatDeltaKg,
            weightDeltaKg: progress.weightDeltaKg,
            waistDeltaCm: progress.waistDeltaCm,
          }
        : null,
      composition: latestComposition,
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
