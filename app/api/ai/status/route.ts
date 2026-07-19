import { NextResponse } from "next/server";
import { aiApiKey, aiBaseUrl, aiModel, isOpenAIConfigured, KIMI_BASE_URL } from "@/lib/env";
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

  const baseUrl = aiBaseUrl();
  const key = aiApiKey() ?? "";
  const usesKimi = baseUrl === KIMI_BASE_URL;

  const warnings: string[] = [];
  if (!isOpenAIConfigured()) {
    warnings.push("KIMI_API_KEY ausente — funções de IA desativadas.");
  }
  if (usesKimi && aiModel() !== "kimi-k2.6") {
    warnings.push("A API oficial Moonshot está configurada, mas AI_MODEL não é kimi-k2.6.");
  } else if (baseUrl.includes("openrouter") && !aiModel().includes("/")) {
    warnings.push(
      "OpenRouter exige o modelo com prefixo do fornecedor (ex.: openai/gpt-4o-mini). Defina AI_MODEL."
    );
  }

  return NextResponse.json({
    keyConfigured: isOpenAIConfigured(),
    keyProviderHint: key ? (usesKimi ? "kimi-moonshot" : "openai-compatible") : null,
    baseUrl,
    model: aiModel(),
    warnings,
    ok: isOpenAIConfigured() && warnings.length === 0,
  });
}
