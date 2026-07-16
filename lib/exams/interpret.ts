import OpenAI from "openai";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { parsedExamSummarySchema, type ParsedExamSummary } from "@/lib/exams/types";

const SYSTEM = `És um assistente clínico-educativo para leigos (Português do Brasil).

REGRAS OBRIGATÓRIAS:
- NÃO faças diagnóstico nem conclusões médicas definitivas.
- NÃO alteres doses nem recomendes medicamentos.
- Explica termos em linguagem acessível e indica sempre limitações (texto incompleto, falta contexto clínico).
- Se houver valores numéricos com faixa de referência no texto, classifica cada um como "normal" (dentro da
  faixa), "atencao" (borderline / levemente fora) ou "alterado" (claramente fora) — só quando a faixa de
  referência estiver explícita no texto ou for um valor amplamente padronizado; senão, omite esse item.
- Produz perguntas úteis para levar à consulta médica.
- Em lifestyleTopics, sugere TEMAS de hábitos/suplementação para o usuário CONVERSAR com o médico
  quando o exame indicar (ex.: vitamina D baixa → "suplementação de vitamina D costuma ser indicada
  nesses casos; leve este resultado ao seu médico"). NUNCA doses, marcas nem conduta — apenas o
  assunto da conversa e o porquê. Se nada se aplicar, devolve lista vazia.
- Resposta APENAS em JSON válido, sem markdown, seguindo o schema pedido.

Schema JSON esperado:
{
  "summary": "parágrafo curto sobre o que o texto parece reportar (factual, sem diagnosticar)",
  "values": [{"parameter":"ex.: Glicose em jejum","value":"126 mg/dL","referenceRange":"70-99 mg/dL","status":"alterado"}],
  "terms": [{"term":"...", "plainLanguage":"..."}],
  "questionsForDoctor": ["..."],
  "lifestyleTopics": [{"topic":"ex.: Vitamina D baixa","whyItMatters":"por que este achado importa, em linguagem simples","discussWithDoctor":"o que vale perguntar/conversar com o médico"}],
  "limitations": "o que não podes concluir com este texto"
}`;

const MAX_CHARS = 14000;

export type InterpretResult =
  | {
      ok: true;
      data: ParsedExamSummary;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }
  | { ok: false; error: string; demo?: boolean };

export async function interpretExamText(rawText: string): Promise<InterpretResult> {
  const trimmed = rawText.length > MAX_CHARS ? rawText.slice(0, MAX_CHARS) : rawText;

  if (!isOpenAIConfigured()) {
    return {
      ok: false,
      error:
        "Configure OPENAI_API_KEY no servidor para interpretação assistida. O texto continua disponível para revisão manual.",
      demo: true,
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let raw: string;
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  try {
    const completion = await openai.chat.completions.create({
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Texto de laboratório ou laudo (pode estar incompleto):\n\n${trimmed}`,
        },
      ],
      max_tokens: 1200,
      temperature: 0.3,
    });
    raw = completion.choices[0]?.message?.content ?? "";
    usage = completion.usage ?? undefined;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao contactar o modelo.";
    return { ok: false, error: msg };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Resposta do modelo não era JSON válido." };
  }

  const parsed = parsedExamSummarySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "JSON do modelo não corresponde ao formato esperado." };
  }

  return { ok: true, data: parsed.data, usage };
}
