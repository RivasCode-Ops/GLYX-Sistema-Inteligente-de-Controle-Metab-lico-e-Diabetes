import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { parseModelJson } from "@/lib/ai/parse-json";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import { checkSubstanceSafety } from "@/lib/queries/substance-safety";
import {
  DOCTOR_NOTE,
  blockedText,
  renderVerdictBlock,
  toSafetyPayload,
} from "@/lib/safety/present";
import { createClient } from "@/lib/supabase/server";

/**
 * Análise de rótulo de suplemento, com gate determinístico de interação.
 *
 * ARQUITETURA (mudou por causa do incidente: berberina liberada com insulina em
 * uso). Antes, uma única chamada ao modelo lia a foto E emitia o veredito —
 * inclusive o valor "seguro". Agora são duas chamadas com o motor no meio:
 *
 *   1. EXTRAÇÃO (visão): o modelo só LÊ o rótulo — nome e ingredientes. É fato
 *      observável, não juízo de segurança.
 *   2. MOTOR determinístico: cruza o que foi lido com o que o usuário usa e
 *      decide a severidade. Este é o único lugar que emite veredito.
 *   3. REDAÇÃO: o modelo recebe o veredito pronto e apenas o redige. Se o
 *      veredito for `blocked`, esta chamada NÃO acontece — as mensagens fixas da
 *      base vão direto para a tela.
 *
 * O passo 1 precisa vir antes do motor porque o nome da substância só existe
 * depois que alguém lê a foto. É a única inversão em relação à ordem geral do
 * módulo, e ela é segura porque o passo 1 não julga nada.
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 3;

/** Passo 1: extração pura. Note que não há campo de veredito aqui. */
const extractionSchema = z.object({
  productName: z.string(),
  ingredients: z.array(z.string()),
  limitations: z.string(),
});

/** Passo 3: redação. Também sem campo de veredito — ele já foi decidido. */
const proseSchema = z.object({
  summary: z.string(),
  concerningIngredients: z.array(z.object({ name: z.string(), why: z.string() })),
  crossCheck: z.array(z.string()),
  doctorNote: z.string(),
});

const EXTRACTION_PROMPT = `És um leitor de rótulos de suplemento (Português do Brasil).
As imagens mostram o RÓTULO de um produto (ingredientes, tabela nutricional).

TAREFA: apenas LER e transcrever. Não avalies segurança, não dês opinião, não recomendes nada.

REGRAS:
- ingredients: lista dos ingredientes/princípios ativos como estão impressos, um por item,
  SEM dose e SEM unidade (ex.: "Berberina", "Picolinato de cromo", "Maltodextrina").
  Inclui também açúcares e adoçantes quando aparecerem.
- Não inventes ingrediente que não esteja legível na foto.
- Se a imagem não for um rótulo legível, devolve productName vazio, ingredients [] e explica
  em limitations.
- Resposta APENAS em JSON válido, sem markdown:
{
  "productName": "nome do produto lido no rótulo (ou vazio)",
  "ingredients": ["..."],
  "limitations": "o que não deu para ler nesta foto"
}`;

const PROSE_PROMPT = `És um analista educativo de segurança de suplementos para pessoas com diabetes (Português do Brasil).

O bloco CHECAGEM DE INTERAÇÃO abaixo é o VEREDITO: foi decidido por regra determinística do app,
não por ti. Não o reavalies, não o relativizes, não o amplies e não concluas nada além dele.

REGRAS OBRIGATÓRIAS:
- NUNCA afirmes que o produto é seguro. Não existe esse veredito neste app.
- Se houver substâncias não reconhecidas, diz de forma explícita que o app não tem essa
  substância na base e que a ausência de alerta NÃO significa ausência de risco.
- NÃO prescreves dose, NÃO substituis nutricionista/nefrologista/endocrinologista.
- NÃO recomendas onde comprar, marca fora do que está na foto, nem preço/frete.
- Se os exames sugerirem função renal comprometida (microalbuminúria elevada, creatinina alta)
  e o produto for rico em proteína, sinaliza risco e pede confirmação profissional — cita a
  diretriz geral (KDOQI: ~0,8 g/kg/dia com sinal renal vs. 1,2-1,6 g/kg/dia sem
  comprometimento) só como referência, nunca como prescrição.
- Se o produto tiver açúcares (maltodextrina, dextrose, frutose, xarope de glicose/milho) e a
  glicemia/HbA1c estiver elevada, sinaliza como preocupação central.
- Resposta APENAS em JSON válido, sem markdown:
{
  "summary": "2-3 frases diretas, reproduzindo a severidade e a mensagem do veredito em linguagem simples",
  "concerningIngredients": [{"name":"ex.: Maltodextrina","why":"eleva glicose rapidamente"}],
  "crossCheck": ["frase curta cruzando com um dado clínico específico do usuário"],
  "doctorNote": "resumo de 3-4 frases em 1ª pessoa do paciente para mostrar ao médico, terminando com 'O senhor autoriza o uso?'"
}`;

type Usage = { prompt_tokens?: number; completion_tokens?: number };

/** Soma o uso dos dois passes: recordAiTokens faz UPDATE, então gravar duas vezes perderia o primeiro. */
function somaUso(a: Usage | undefined, b: Usage | undefined): Usage | undefined {
  if (!a && !b) return undefined;
  return {
    prompt_tokens: (a?.prompt_tokens ?? 0) + (b?.prompt_tokens ?? 0),
    completion_tokens: (a?.completion_tokens ?? 0) + (b?.completion_tokens ?? 0),
  };
}

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

  const openai = createAiClient();

  const imageParts = await Promise.all(
    files.map(async (f) => {
      const buffer = Buffer.from(await f.arrayBuffer());
      return {
        type: "image_url" as const,
        image_url: { url: `data:${f.type || "image/jpeg"};base64,${buffer.toString("base64")}` },
      };
    })
  );

  // -------------------------------------------------------------------------
  // Passo 1 — extração. O modelo lê o rótulo; não julga.
  // -------------------------------------------------------------------------
  let extractionCompletion;
  try {
    extractionCompletion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: EXTRACTION_PROMPT }, ...imageParts],
        },
      ],
      max_tokens: 900,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  const extracted = extractionSchema.safeParse(
    parseModelJson(extractionCompletion.choices[0]?.message?.content)
  );
  if (!extracted.success) {
    await recordAiTokens(supabase, rate.usageId, extractionCompletion.usage, aiModel());
    return NextResponse.json(
      { error: "Formato inesperado do modelo ao ler o rótulo. Tente novamente." },
      { status: 502 }
    );
  }

  const { productName, ingredients, limitations } = extracted.data;
  if (!productName.trim() && !ingredients.length) {
    await recordAiTokens(supabase, rate.usageId, extractionCompletion.usage, aiModel());
    return NextResponse.json(
      {
        error:
          `Não consegui ler um rótulo de suplemento nesta foto. ${limitations} ` +
          "Dica: fotografe de perto, só o painel de ingredientes/tabela nutricional, com boa luz e sem reflexo.",
      },
      { status: 422 }
    );
  }

  // -------------------------------------------------------------------------
  // Passo 2 — motor determinístico. Único emissor de veredito.
  // -------------------------------------------------------------------------
  // Nome do produto E ingredientes entram como candidatos: "Berberine Complex"
  // casa pelo nome, e um multivitamínico genérico só casa pela lista.
  const candidatos = [productName, ...ingredients].filter((n) => n.trim().length > 0);
  const verdict = await checkSubstanceSafety(supabase, user.id, candidatos);

  // O payload de segurança é montado aqui e vai na resposta em qualquer
  // caminho: a tela nunca depende do texto do modelo para mostrar o alerta.
  const safety = toSafetyPayload(verdict);

  // -------------------------------------------------------------------------
  // Passo 3 — redação, só quando não há achado grave.
  // -------------------------------------------------------------------------
  if (verdict.blocked) {
    await recordAiTokens(supabase, rate.usageId, extractionCompletion.usage, aiModel());
    return NextResponse.json({
      productName,
      safety,
      summary: blockedText(verdict),
      concerningIngredients: [],
      crossCheck: [],
      doctorNote: DOCTOR_NOTE,
      limitations,
      llmSkipped: true,
    });
  }

  const contexto = await contextoClinico(supabase, user.id);

  let proseCompletion;
  try {
    proseCompletion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content:
            `${PROSE_PROMPT}\n\n${renderVerdictBlock(verdict)}\n\n` +
            `PRODUTO LIDO NO RÓTULO: ${sanitizeForPrompt(productName, 120)}\n` +
            `INGREDIENTES LIDOS: ${ingredients.map((i) => sanitizeForPrompt(i, 60)).join(", ")}\n\n` +
            `CONTEXTO CLÍNICO DO USUÁRIO:\n${contexto}`,
        },
      ],
      max_tokens: 1200,
    });
  } catch (e) {
    // O veredito já existe e não depende do modelo: entrega o alerta mesmo com
    // o provedor fora do ar, em vez de devolver 502 e esconder o achado.
    await recordAiTokens(supabase, rate.usageId, extractionCompletion.usage, aiModel());
    return NextResponse.json({
      productName,
      safety,
      summary: [safety.unknownNote, safety.noFindingNote, DOCTOR_NOTE].filter(Boolean).join("\n\n"),
      concerningIngredients: [],
      crossCheck: [],
      doctorNote: DOCTOR_NOTE,
      limitations: `${limitations} (A análise em texto não pôde ser gerada agora: ${providerErrorMessage(e)})`,
      llmSkipped: true,
    });
  }

  await recordAiTokens(
    supabase,
    rate.usageId,
    somaUso(extractionCompletion.usage, proseCompletion.usage),
    aiModel()
  );

  const prose = proseSchema.safeParse(
    parseModelJson(proseCompletion.choices[0]?.message?.content)
  );

  return NextResponse.json({
    productName,
    safety,
    summary: prose.success
      ? prose.data.summary
      : [safety.unknownNote, safety.noFindingNote, DOCTOR_NOTE].filter(Boolean).join("\n\n"),
    concerningIngredients: prose.success ? prose.data.concerningIngredients : [],
    crossCheck: prose.success ? prose.data.crossCheck : [],
    doctorNote: prose.success ? prose.data.doctorNote : DOCTOR_NOTE,
    limitations,
    llmSkipped: false,
  });
}

/** Contexto clínico para a redação. Mesma fonte de antes; só saiu de dentro do POST. */
async function contextoClinico(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string
): Promise<string> {
  const [profileRes, glucoseRes, medsRes, examsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("diabetes_type, target_glucose_min, target_glucose_max, body_goal")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("glucose_readings")
      .select("value_mg_dl")
      .eq("user_id", userId)
      .gte("recorded_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
    supabase.from("medications").select("name, dosage, kind").eq("user_id", userId).eq("active", true),
    supabase
      .from("exams")
      .select("title, raw_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const profile = profileRes.data;
  const glucose = glucoseRes.data;
  const meds = medsRes.data;
  const exams = examsRes.data;

  const glucoseAvg = glucose?.length
    ? Math.round(glucose.reduce((s, g) => s + g.value_mg_dl, 0) / glucose.length)
    : null;

  return [
    profile?.diabetes_type ? `Diagnóstico: ${profile.diabetes_type}.` : "",
    glucoseAvg
      ? `Glicemia média (14 dias): ${glucoseAvg} mg/dL.`
      : "Sem leituras recentes de glicemia.",
    profile
      ? `Meta glicêmica: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL.`
      : "",
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
}

export const runtime = "nodejs";
export const maxDuration = 60;
