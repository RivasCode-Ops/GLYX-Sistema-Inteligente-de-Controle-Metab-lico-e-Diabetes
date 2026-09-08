import { NextResponse } from "next/server";
import {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_MODEL,
  KIMI_BASE_URL,
  KIMI_MODEL,
  aiApiKey,
  aiBaseUrl,
  aiModel,
  aiProvider,
  isOpenAIConfigured,
} from "@/lib/env";
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

  const provider = aiProvider();
  const baseUrl = aiBaseUrl();
  const model = aiModel();
  const key = aiApiKey() ?? "";

  const ENV_DA_CHAVE: Record<typeof provider, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    kimi: "KIMI_API_KEY",
    openai: "OPENAI_API_KEY",
  };

  const warnings: string[] = [];
  if (!isOpenAIConfigured()) {
    warnings.push(`${ENV_DA_CHAVE[provider]} ausente — funções de IA desativadas.`);
  }

  // Base URL apontando para um provedor e modelo de outro é a falha de
  // configuração que dá 404 no primeiro uso e nada antes disso.
  if (baseUrl === ANTHROPIC_BASE_URL && !model.startsWith("claude-")) {
    warnings.push(
      `A API da Anthropic está configurada, mas AI_MODEL não é um modelo Claude (padrão: ${ANTHROPIC_MODEL}).`
    );
  } else if (baseUrl === KIMI_BASE_URL && model !== KIMI_MODEL) {
    warnings.push(`A API oficial Moonshot está configurada, mas AI_MODEL não é ${KIMI_MODEL}.`);
  } else if (baseUrl.includes("openrouter") && !model.includes("/")) {
    warnings.push(
      "OpenRouter exige o modelo com prefixo do fornecedor (ex.: openai/gpt-4o-mini). Defina AI_MODEL."
    );
  }

  // A seleção explícita e a URL efetiva podem discordar quando há override de
  // base URL no ambiente. Dizer isso aqui evita depurar no escuro.
  const urlPadraoDoProvedor =
    (provider === "anthropic" && baseUrl === ANTHROPIC_BASE_URL) ||
    (provider === "kimi" && baseUrl === KIMI_BASE_URL) ||
    provider === "openai";
  if (!urlPadraoDoProvedor) {
    warnings.push(
      `AI_PROVIDER=${provider}, mas a base URL efetiva é ${baseUrl} (override de AI_BASE_URL/OPENAI_BASE_URL).`
    );
  }

  return NextResponse.json({
    keyConfigured: isOpenAIConfigured(),
    provider,
    keyProviderHint: key ? provider : null,
    baseUrl,
    model,
    warnings,
    ok: isOpenAIConfigured() && warnings.length === 0,
  });
}
