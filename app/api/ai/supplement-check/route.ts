import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 3;

const resultSchema = z.object({
  productName: z.string(),
  verdict: z.enum(["seguro", "atencao", "evitar"]),
  summary: z.string(),
  concerningIngredients: z.array(z.object({ name: z.string(), why: z.string() })),
  crossCheck: z.array(z.string()),
  doctorNote: z.string(),
  limitations: z.string(),
});

const PROMPT_HEADER = `És um analista educativo de segurança de suplementos para pessoas com diabetes (Português do Brasil).
As imagens mostram o RÓTULO de um suplemento (ingredientes, tabela nutricional).

TAREFA: ler os ingredientes e a tabela nutricional, e avaliar a segurança do produto CRUZANDO com o
contexto clínico do usuário abaixo (glicemia, função renal pelos exames, medicações em uso).

REGRAS OBRIGATÓRIAS (segue à risca):
- NÃO prescreve dose, NÃO substitui nutricionista/nefrologista/endocrinologista.
- NÃO recomenda onde comprar, marca específica fora do que está na foto, nem preço/frete — isso está
  fora do teu papel.
- Se os exames do usuário sugerirem função renal comprometida (ex.: microalbuminúria elevada,
  creatinina alta) e o produto for rico em proteína, sinaliza risco e pede confirmação profissional
  antes de qualquer suplementação proteica — cita a diretriz geral (KDOQI: ~0,8 g/kg/dia com sinal
  renal vs. 1,2-1,6 g/kg/dia sem comprometimento) só como referência, nunca como prescrição.
- Se o produto tiver açúcares (maltodextrina, dextrose, frutose, xarope de glicose/milho) e a
  glicemia/HbA1c do usuário estiver elevada, sinaliza como preocupação central.
- Se a imagem não for um rótulo de suplemento legível, devolve productName vazio e explica em
  limitations.
- Resposta APENAS em JSON válido, sem markdown:
{
  "productName": "nome do produto lido no rótulo (ou vazio)",
  "verdict": "seguro" | "atencao" | "evitar",
  "summary": "2-3 frases diretas com o veredito e o porquê",
  "concerningIngredients": [{"name":"ex.: Maltodextrina","why":"eleva glicose rapidamente"}],
  "crossCheck": ["frase curta cruzando com um dado clínico específico do usuário, ex.: Sua microalbuminúria de 72 mg/g sugere função renal já comprometida — proteína em excesso pode sobrecarregar os rins"],
  "doctorNote": "resumo de 3-4 frases em 1ª pessoa do paciente para mostrar ao médico, terminando com 'O senhor autoriza o uso?'",
  "limitations": "o que não dá para avaliar só com esta foto (ex.: dose exata usada, outros suplementos concomitantes)"
}`;

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

  const formData = await req.formData();
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!files.length) {
    return NextResponse.json({ error: "Envie ao menos uma foto do rótulo." }, { status: 400 });
  }
  if (files.length > MAX_PAGES) {
    return NextResponse.json({ error: `Máximo de ${MAX_PAGES} fotos.` }, { status: 400 });
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Fotos muito grandes no total (máx. 4 MB)." }, { status: 413 });
  }
  if (files.some((f) => !f.type.startsWith("image/"))) {
    return NextResponse.json({ error: "Todos os arquivos precisam ser imagens." }, { status: 415 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "Chave de IA não configurada.", demo: true }, { status: 503 });
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "supplement");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  // Contexto clínico real: perfil, últimas glicemias, medicações ativas e
  // trechos dos exames já analisados (a mesma fonte que já temos no app).
  const { data: profile } = await supabase
    .from("profiles")
    .select("diabetes_type, target_glucose_min, target_glucose_max, body_goal")
    .eq("id", user.id)
    .maybeSingle();

  const { data: glucose } = await supabase
    .from("glucose_readings")
    .select("value_mg_dl")
    .eq("user_id", user.id)
    .gte("recorded_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
  const glucoseAvg = glucose?.length
    ? Math.round(glucose.reduce((s, g) => s + g.value_mg_dl, 0) / glucose.length)
    : null;

  const { data: meds } = await supabase
    .from("medications")
    .select("name, dosage, kind")
    .eq("user_id", user.id)
    .eq("active", true);

  const { data: exams } = await supabase
    .from("exams")
    .select("title, raw_text, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const usesInsulinOrSulfonylurea = (meds ?? []).some((m) =>
    /insulina|glibenclamida|glimepirida|gliclazida/i.test(m.name)
  );

  const contextLines = [
    profile?.diabetes_type ? `Diagnóstico: ${profile.diabetes_type}.` : "",
    glucoseAvg ? `Glicemia média (14 dias): ${glucoseAvg} mg/dL.` : "Sem leituras recentes de glicemia.",
    profile ? `Meta glicêmica: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL.` : "",
    usesInsulinOrSulfonylurea ? "USA insulina ou sulfonilureia (risco de hipoglicemia)." : "",
    meds?.length
      ? `Medicações/suplementos ativos: ${meds
          .map((m) => {
            const name = sanitizeForPrompt(m.name, 60);
            const dosage = m.dosage ? ` ${sanitizeForPrompt(m.dosage, 30)}` : "";
            return `${name}${dosage} (${m.kind})`;
          })
          .join(", ")}.`
      : "Nenhuma medicação ativa cadastrada.",
    exams?.length
      ? `Trechos de exames recentes do usuário (para identificar HbA1c, microalbuminúria, creatinina etc. se citados):\n${exams
          .map((e) => `- ${sanitizeForPrompt(e.title, 80)}: ${sanitizeForPrompt(e.raw_text, 600)}`)
          .join("\n")}`
      : "Nenhum exame cadastrado no app ainda — avaliação sem dados renais/HbA1c específicos.",
  ]
    .filter(Boolean)
    .join("\n");

  const imageParts = await Promise.all(
    files.map(async (f) => {
      const buffer = Buffer.from(await f.arrayBuffer());
      return {
        type: "image_url" as const,
        image_url: { url: `data:${f.type || "image/jpeg"};base64,${buffer.toString("base64")}` },
      };
    })
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${PROMPT_HEADER}\n\nCONTEXTO CLÍNICO DO USUÁRIO:\n${contextLines}` },
            ...imageParts,
          ],
        },
      ],
      max_tokens: 1400,
      temperature: 0.3,
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
  if (!parsed.data.productName.trim()) {
    return NextResponse.json(
      {
        error:
          `Não consegui ler um rótulo de suplemento nesta foto. ${parsed.data.limitations} ` +
          "Dica: fotografe de perto, só o painel de ingredientes/tabela nutricional, com boa luz e sem reflexo.",
      },
      { status: 422 }
    );
  }

  return NextResponse.json(parsed.data);
}

export const runtime = "nodejs";
export const maxDuration = 60;
