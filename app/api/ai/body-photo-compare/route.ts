import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Comparação de duas fotos de progresso da MESMA pose.
 *
 * Só roda por ação explícita do usuário, nunca automaticamente: foto de corpo é
 * o dado mais sensível do app, e sair do servidor rumo ao provedor de IA é uma
 * decisão que tem que ser tomada por quem está na foto, a cada vez. A tela diz
 * isso antes do botão, e nenhum job de fundo chama esta rota.
 */

const bodySchema = z.object({
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
});

const resultSchema = z.object({
  summary: z.string(),
  changes: z.array(z.string()),
  uncertain: z.array(z.string()),
});

const POSE_LABEL: Record<string, string> = {
  frente: "de frente",
  costas: "de costas",
  perfil_esq: "de perfil esquerdo",
  perfil_dir: "de perfil direito",
};

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

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Escolha duas fotos para comparar." }, { status: 400 });
  }
  const { fromId, toId } = parsedBody.data;
  if (fromId === toId) {
    return NextResponse.json({ error: "Escolha duas fotos diferentes." }, { status: 400 });
  }

  const { data: photos } = await supabase
    .from("body_photos")
    .select("id, taken_on, pose, photo_path")
    .eq("user_id", user.id)
    .in("id", [fromId, toId]);

  const rows = (photos ?? []) as { id: string; taken_on: string; pose: string; photo_path: string }[];
  if (rows.length !== 2) {
    return NextResponse.json({ error: "Fotos não encontradas." }, { status: 404 });
  }
  if (rows[0].pose !== rows[1].pose) {
    return NextResponse.json(
      { error: "Compare fotos da mesma pose — ângulos diferentes não são comparáveis." },
      { status: 400 }
    );
  }

  const ordered = [...rows].sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "Chave de IA não configurada.", demo: true }, { status: 503 });
  }

  const images: string[] = [];
  for (const row of ordered) {
    const { data, error } = await supabase.storage.from("body-photos").download(row.photo_path);
    if (error || !data) {
      return NextResponse.json({ error: "Não foi possível ler uma das fotos." }, { status: 502 });
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    images.push(`data:${data.type || "image/jpeg"};base64,${buffer.toString("base64")}`);
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "body_photo");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const poseLabel = POSE_LABEL[ordered[0].pose] ?? ordered[0].pose;
  const openai = createAiClient();

  let completion;
  try {
    completion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Duas fotos de progresso físico da MESMA pessoa, ${poseLabel}. A primeira é de ${ordered[0].taken_on}, a segunda de ${ordered[1].taken_on}.

Compara as duas e descreve APENAS o que é visualmente observável de mudança física: definição muscular, volume de grupos musculares, contorno da cintura, postura.

REGRAS RÍGIDAS:
- NÃO estimes percentual de gordura, peso ou medidas a partir de foto. Isso não é possível com honestidade e o app já calcula esses números a partir de medidas reais.
- Iluminação, ângulo, distância da câmera, horário e roupa mudam a aparência mais que semanas de treino. Quando a diferença puder ser explicada por isso, diz explicitamente no campo "uncertain".
- Nenhum comentário sobre aparência, estética ou beleza. Nenhum julgamento sobre o corpo. Descrição técnica de mudança, só.
- Se as fotos forem muito parecidas, diz que não há mudança visualmente distinguível — é uma resposta legítima.

Responde APENAS com JSON válido:
{"summary":"2-3 frases sobre o que mudou entre as duas","changes":["mudanças observáveis, uma por item"],"uncertain":["o que pode ser efeito de foto e não do corpo"]}`,
            },
            { type: "image_url", image_url: { url: images[0] } },
            { type: "image_url", image_url: { url: images[1] } },
          ],
        },
      ],
      max_tokens: 700,
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
    from: { id: ordered[0].id, takenOn: ordered[0].taken_on },
    to: { id: ordered[1].id, takenOn: ordered[1].taken_on },
    pose: ordered[0].pose,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
