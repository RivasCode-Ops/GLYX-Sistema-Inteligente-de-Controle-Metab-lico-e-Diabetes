import OpenAI from "openai";
import { aiApiKey, aiBaseUrl, KIMI_BASE_URL } from "@/lib/env";

export function createAiClient(): OpenAI {
  return new OpenAI({
    apiKey: aiApiKey(),
    baseURL: aiBaseUrl(),
  });
}

export function aiProviderOptions() {
  return aiBaseUrl() === KIMI_BASE_URL
    ? { thinking: { type: "disabled" as const } }
    : {};
}
