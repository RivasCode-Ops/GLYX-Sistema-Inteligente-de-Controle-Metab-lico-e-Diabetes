import { NextResponse } from "next/server";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Diagnóstico da configuração de IA (sem expor segredos).
export async function GET() {
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

  const baseUrl = process.env.OPENAI_BASE_URL ?? null;
  const key = process.env.OPENAI_API_KEY ?? "";
  const looksLikeOpenRouterKey = key.startsWith("sk-or-");

  const warnings: string[] = [];
  if (!isOpenAIConfigured()) {
    warnings.push("OPENAI_API_KEY ausente — funções de IA desativadas.");
  }
  if (looksLikeOpenRouterKey && !baseUrl) {
    warnings.push(
      "A chave parece ser do OpenRouter (sk-or-…), mas OPENAI_BASE_URL não está definida — as chamadas irão para api.openai.com e falharão com 401. Defina OPENAI_BASE_URL=https://openrouter.ai/api/v1."
    );
  }
  if (baseUrl?.includes("openrouter") && !aiModel().includes("/")) {
    warnings.push(
      "OpenRouter exige o modelo com prefixo do fornecedor (ex.: openai/gpt-4o-mini). Defina AI_MODEL."
    );
  }

  return NextResponse.json({
    keyConfigured: isOpenAIConfigured(),
    keyProviderHint: looksLikeOpenRouterKey ? "openrouter" : key ? "openai-ou-outro" : null,
    baseUrl,
    model: aiModel(),
    warnings,
    ok: isOpenAIConfigured() && warnings.length === 0,
  });
}
