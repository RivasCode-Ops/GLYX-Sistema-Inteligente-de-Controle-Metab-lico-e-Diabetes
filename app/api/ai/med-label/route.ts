import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { DOSE_UNITS } from "@/lib/medications/dose-units";

// Lê o RÓTULO de um remédio/suplemento e devolve os campos do cadastro
// pré-preenchidos (nome, tipo, dose por vez, estoque) — o usuário revisa e
// salva. Nunca inventa posologia: dose por vez só quando impressa no rótulo.

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 2;

const resultSchema = z.object({
  name: z.string(),
  kind: z.enum(["med", "supplement"]),
  dose_amount: z.number().positive().nullable(),
  dose_unit: z.enum(DOSE_UNITS).nullable(),
  dosage_text: z.string(),
  schedule_hint: z.string(),
  stock_units: z.number().int().positive().nullable(),
  notes: z.string(),
  limitations: z.string(),
});

export type MedLabelResult = z.infer<typeof resultSchema>;

const PROMPT = `És um leitor de rótulos de medicamentos e suplementos (Português do Brasil).
As imagens mostram a embalagem/rótulo de UM produto. Extrai os dados para pré-preencher um cadastro.

REGRAS OBRIGATÓRIAS:
- NÃO inventes posologia: dose_amount/dose_unit só quando a posologia estiver IMPRESSA no rótulo
  (ex.: "tomar 1 comprimido", "dose: 30 g (2 scoops)"). Concentração (ex.: "500 mg por comprimido")
  vai em dosage_text, não em dose_amount.
- kind: "med" para medicamento (tarja, princípio ativo farmacêutico), "supplement" para suplemento
  (whey, creatina, vitamina, mineral).
- stock_units: quantidade da embalagem se visível (ex.: "30 comprimidos" → 30; "900 g" de whey com
  dose de 30 g → 30 doses). Senão, null.
- Se a imagem não for um rótulo legível, devolve name vazio e explica em limitations.
- Resposta APENAS em JSON válido, sem markdown:
{
  "name": "nome do produto + princípio ativo se visível (ex.: Metformina 850 mg — Glifage)",
  "kind": "med" | "supplement",
  "dose_amount": 1,
  "dose_unit": "mg" | "g" | "mcg" | "ml" | "U" | "comprimido(s)" | "cápsula(s)" | "scoop" | "gota(s)" | null,
  "dosage_text": "concentração/posologia lida do rótulo, texto curto",
  "schedule_hint": "orientação de horário impressa (ex.: após as refeições) ou vazio",
  "stock_units": 30,
  "notes": "observações úteis curtas (ex.: manter refrigerado) ou vazio",
  "limitations": "o que não deu para ler nesta foto"
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
    return NextResponse.json({ error: "Envie a foto do rótulo." }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Máximo de ${MAX_PHOTOS} fotos.` }, { status: 400 });
  }
  if (files.reduce((s, f) => s + f.size, 0) > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Fotos muito grandes (máx. 4 MB no total)." }, { status: 413 });
  }
  if (files.some((f) => !f.type.startsWith("image/"))) {
    return NextResponse.json({ error: "Os arquivos precisam ser imagens." }, { status: 415 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "Chave de IA não configurada.", demo: true }, { status: 503 });
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "supplement");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const imageParts = await Promise.all(
    files.map(async (f) => ({
      type: "image_url" as const,
      image_url: { url: `data:${f.type || "image/jpeg"};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}` },
    }))
  );

  const openai = createAiClient();
  let completion;
  try {
    completion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, ...imageParts] }],
      max_tokens: 500,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: MedLabelResult;
  try {
    const json = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    const result = resultSchema.safeParse(json);
    if (!result.success) throw new Error("schema");
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { error: "Não consegui ler este rótulo — tente uma foto mais nítida e de frente." },
      { status: 422 }
    );
  }

  if (!parsed.name.trim()) {
    return NextResponse.json(
      { error: parsed.limitations || "A foto não parece um rótulo legível." },
      { status: 422 }
    );
  }

  return NextResponse.json({ result: parsed });
}

export const runtime = "nodejs";
export const maxDuration = 60;
