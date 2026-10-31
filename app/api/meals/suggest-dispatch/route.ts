import { NextResponse } from "next/server";
import { secretsMatch } from "@/lib/auth/constant-time";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { reportCronOutcome, reportException } from "@/lib/observability";
import { sendToSubscription } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarTetoGlobal } from "@/lib/ai/budget";
import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import { guardarTextoDaIA } from "@/lib/safety/ai-output-guard";

// Quantas sugestões processamos ao mesmo tempo. Sequencial (1 por vez)
// arrisca estourar o timeout de 60s da function quando muitos usuários
// vencem a janela do mesmo horário de refeição; concorrência alta demais
// arrisca rate limit do provedor de IA. 5 é um meio-termo seguro para o volume
// atual de usuários.
const CONCURRENCY = 5;

// Chamado pelo pg_cron do Supabase (dispatch_meal_suggestions, a cada
// 15 min) com a lista de usuários que não registraram a refeição do
// horário. O banco já decidiu QUEM está devendo e QUANDO (dedupe,
// janela de horário); esta rota só faz o que o Postgres não pode:
// gerar a sugestão por IA e disparar o push.

const MEAL_LABEL: Record<string, string> = {
  breakfast: "café da manhã",
  lunch: "almoço",
  dinner: "jantar",
};

const itemSchema = z.object({
  userId: z.string().uuid(),
  mealType: z.enum(["breakfast", "lunch", "dinner"]),
  bodyGoal: z.string().nullable().optional(),
  diabetesType: z.string().nullable().optional(),
  latestGlucose: z.number().nullable().optional(),
  caloriesToday: z.number().optional(),
  carbsToday: z.number().optional(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

type SuggestItem = z.infer<typeof itemSchema>;

export async function POST(req: Request) {
  // Comparação em tempo constante: `!==` sai no primeiro byte diferente e
  // vaza, pelo tempo de resposta, quanto do segredo o atacante já acertou.
  const secret = process.env.CRON_SECRET;
  if (!secretsMatch(req.headers.get("x-cron-secret"), secret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z.array(itemSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  if (!isOpenAIConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "IA não configurada." });
  }

  const openai = createAiClient();
  // Service role: o cron chega sem sessão, e com o cliente anon a RPC de custo
  // passou a ser recusada depois de 20260908180000 (EXECUTE revogado de anon)
  // — e o erro era ignorado, então o gasto sumia do painel sem aviso.
  const supabase = createAdminClient();
  if (!supabase) {
    // Sem service role não dá para conferir consentimento nem registrar custo:
    // nada sai para o provedor.
    reportException(new Error("meal-suggest sem service role: nenhuma sugestão enviada"), {
      tags: { job: "meal-suggest", surface: "cron" },
      level: "error",
    });
    return NextResponse.json({ ok: true, sent: 0, skipped: "sem service role" });
  }
  const db = supabase;

  // CONSENTIMENTO (Etapa 1, A1; P06). O job do banco já filtra por
  // `profiles.ia_sugestao_automatica` depois da migration 20261031102000; esta
  // segunda conferência vale mesmo antes dela — sem a coluna, a consulta falha e
  // ninguém conta como consentido. Dado clínico só vai ao provedor com opt-in.
  const ids = [...new Set(parsed.data.map((i) => i.userId))];
  const { data: consentidos, error: erroConsentimento } = ids.length
    ? await supabase.from("profiles").select("id").in("id", ids).eq("ia_sugestao_automatica", true)
    : { data: [], error: null };
  const comConsentimento = new Set(
    erroConsentimento ? [] : ((consentidos ?? []) as { id: string }[]).map((p) => p.id)
  );
  const itens = parsed.data.filter((i) => comConsentimento.has(i.userId));
  if (!itens.length) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "sem consentimento" });
  }

  // TETO GLOBAL (Etapa 1, C7): o job não tinha cota nenhuma.
  const teto = await verificarTetoGlobal(supabase);
  if (!teto.permitido) {
    return NextResponse.json({ ok: true, sent: 0, skipped: teto.motivo });
  }

  async function processItem(item: SuggestItem): Promise<boolean> {
    const mealLabel = MEAL_LABEL[item.mealType];
    const goalLine =
      item.bodyGoal === "lose"
        ? "Objetivo: emagrecer — priorize proteína e vegetais, carboidrato moderado."
        : item.bodyGoal === "gain"
          ? "Objetivo: ganhar massa muscular — proteína generosa, carboidrato de qualidade."
          : "Objetivo: manter/controlar a glicemia.";

    const prompt = `Sugira em UMA frase curta (máx. 25 palavras, português do Brasil) o que comer agora no ${mealLabel}, para uma pessoa com diabetes que ainda não registrou essa refeição hoje.
${goalLine}
${item.diabetesType ? `Contexto: ${sanitizeForPrompt(item.diabetesType, 40)}.` : ""}
${item.latestGlucose != null ? `Última glicemia: ${item.latestGlucose} mg/dL.` : ""}
${item.caloriesToday ? `Já consumiu ${item.caloriesToday} kcal e ${item.carbsToday ?? 0}g de carboidrato hoje.` : "Ainda não registrou nada hoje."}
Seja prático e direto (ex.: "Prefira proteína magra com salada e pouco arroz"). Sem markdown, sem aspas, só a frase.`;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        ...aiProviderOptions(),
        model: aiModel(),
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
      });
    } catch (e) {
      reportException(e, {
        tags: { job: "meal-suggest", surface: "cron" },
        extra: { userIdPrefix: item.userId.slice(0, 8), mealType: item.mealType },
        level: "warning",
      });
      return false; // um usuário falhar não deve travar os demais
    }

    const bruta = completion.choices[0]?.message?.content?.trim();
    if (!bruta) return false;
    // Guarda de saída (A6): o push saía direto do modelo para a tela de bloqueio
    // do celular. Frase barrada = nenhum push (melhor nada que uma conduta).
    const guardada = guardarTextoDaIA(bruta, "");
    if (guardada.bloqueado) {
      reportException(new Error("meal-suggest: sugestão barrada por linguagem proibida"), {
        tags: { job: "meal-suggest", surface: "cron" },
        extra: { frases: guardada.frases.join(", ") },
        level: "warning",
      });
      return false;
    }
    const suggestion = guardada.texto;

    const alive = await sendToSubscription(
      { endpoint: item.endpoint, p256dh: item.p256dh, auth: item.auth },
      {
        title: `🍽️ Hora do ${mealLabel}`,
        body: suggestion,
        url: "/alimentacao/foto",
        critical: false,
      }
    );

    if (completion.usage) {
      const { error: usoErro } = await db.rpc("record_system_ai_usage", {
        p_user_id: item.userId,
        p_kind: "meal_suggest",
        p_prompt_tokens: completion.usage.prompt_tokens ?? null,
        p_completion_tokens: completion.usage.completion_tokens ?? null,
        p_model: aiModel(),
        p_secret: secret,
      });
      if (usoErro) {
        reportException(new Error("meal-suggest: falha ao registrar custo de IA"), {
          tags: { job: "meal-suggest", surface: "cron" },
          extra: { codigo: usoErro.code ?? null },
          level: "error",
        });
      }
    }

    return alive;
  }

  const results = await mapWithConcurrency(itens, CONCURRENCY, processItem);
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = itens.length - sent;

  await reportCronOutcome("meal-suggest", {
    sent,
    failed: itens.length > 0 && sent === 0 ? failed : 0,
    total: itens.length,
  });
  return NextResponse.json({ ok: true, sent });
}

export const runtime = "nodejs";
export const maxDuration = 60;
