import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { parseMealJson } from "@/lib/ai/parse-meal";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Sugere horário só pros itens SEM alarme configurado (remedio ou
// suplemento cadastrado sem reminder_times) — nunca reorganiza algo que
// já tem horário fixo. Remédio (kind=med) é tratado como prioridade sobre
// suplemento na hora de distribuir os horários ao longo do dia.

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["med", "supplement"]),
  dosage: z.string().nullable().optional(),
  scheduleHint: z.string().nullable().optional(),
});

const scheduledSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["med", "supplement"]),
  times: z.array(z.string()).min(1),
});

const bodySchema = z.object({
  unscheduled: z.array(itemSchema).min(1).max(20),
  scheduled: z.array(scheduledSchema).max(30).optional(),
});

export async function POST(req: Request) {
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "KIMI_API_KEY não configurada no servidor.", demo: true },
      { status: 503 }
    );
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "medication_schedule");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const { unscheduled, scheduled = [] } = parsed.data;

  const unscheduledList = unscheduled
    .map((i) => `- id "${i.id}": ${i.name} (${i.kind === "med" ? "remédio" : "suplemento"})${i.dosage ? `, dose ${i.dosage}` : ""}${i.scheduleHint ? `, obs: ${i.scheduleHint}` : ""}`)
    .join("\n");
  const scheduledList = scheduled.length
    ? scheduled.map((s) => `- ${s.name} (${s.kind === "med" ? "remédio" : "suplemento"}) já toma às ${s.times.join(", ")}`).join("\n")
    : "Nenhum outro item com horário fixo.";

  const prompt = `Sugira UM horário (HH:MM, 24h) para cada item abaixo que ainda não tem alarme configurado, organizando a rotina do dia. Regras:
- Remédio (kind remédio) tem prioridade sobre suplemento — encaixe os remédios em horários-âncora do dia (ex.: ao acordar, com refeições) antes dos suplementos.
- Evite amontoar muitos itens no mesmo horário; distribua ao longo do dia.
- Considere os horários já fixos abaixo para não sobrepor.
- Nunca sugira horário pra um item que já tem alarme — a lista "sem horário" é só o que precisa de sugestão.

Itens sem horário:
${unscheduledList}

Já têm horário fixo (contexto, não mexer):
${scheduledList}

Responda APENAS um JSON válido com "suggestions": array de objetos, um por item da lista "sem horário", cada um com "id" (o id exato dado), "time" (HH:MM) e "rationale" (string curta em português explicando a escolha, ex.: "junto com o café da manhã").`;

  let completion;
  try {
    completion = await createAiClient().chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsedResult = parseMealJson(raw) as {
    suggestions?: { id?: string; time?: string; rationale?: string }[];
  };

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  const validIds = new Set(unscheduled.map((i) => i.id));
  const suggestions = (parsedResult.suggestions ?? [])
    .filter((s) => s.id && validIds.has(s.id) && s.time && timeRe.test(s.time))
    .map((s) => ({
      id: String(s.id),
      time: String(s.time),
      rationale: s.rationale ? String(s.rationale) : "",
    }));

  return NextResponse.json({ suggestions });
}

export const runtime = "nodejs";
export const maxDuration = 30;
