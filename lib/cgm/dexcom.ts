import { createHmac, timingSafeEqual } from "node:crypto";
import { encryptCredential, decryptCredential } from "@/lib/cgm/librelinkup";
import { normalizeDexcomEgvs, type DexcomEgvsLike } from "@/lib/cgm/normalize/dexcom";
import type { UnifiedCgmReading } from "@/lib/cgm/types";

export type DexcomTokenBundle = {
  access_token: string;
  refresh_token: string;
  /** epoch ms */
  expires_at: number;
};

function dexcomBaseUrl(): string {
  if (process.env.DEXCOM_USE_SANDBOX === "1" || process.env.DEXCOM_USE_SANDBOX === "true") {
    return "https://sandbox-api.dexcom.com";
  }
  return process.env.DEXCOM_API_BASE?.trim() || "https://api.dexcom.com";
}

export function isDexcomOAuthConfigured(): boolean {
  return Boolean(
    process.env.DEXCOM_CLIENT_ID?.trim() && process.env.DEXCOM_CLIENT_SECRET?.trim()
  );
}

export function dexcomRedirectUri(): string {
  if (process.env.DEXCOM_REDIRECT_URI?.trim()) return process.env.DEXCOM_REDIRECT_URI.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (site) return `${site}/api/cgm/dexcom/callback`;
  throw new Error("Defina DEXCOM_REDIRECT_URI ou NEXT_PUBLIC_SITE_URL para o OAuth Dexcom.");
}

function oauthSecret(): string {
  const configured = process.env.CGM_CREDENTIALS_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (configured) return configured;
  // Falha explícita em produção — sem isso, o state OAuth do Dexcom seria
  // assinado com um segredo fixo e público (visível no código-fonte),
  // permitindo forjar/adulterar o state.
  if (process.env.NODE_ENV === "production") {
    throw new Error("CGM_CREDENTIALS_SECRET (ou CRON_SECRET legado) ausente no servidor.");
  }
  return "dev-only-dexcom-state";
}

export function signDexcomOAuthState(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}`;
  const sig = createHmac("sha256", oauthSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyDexcomOAuthState(
  state: string,
  maxAgeMs = 15 * 60 * 1000
): { userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, tsStr, sig] = parts;
  if (!userId || !tsStr || !sig) return null;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) return null;
  const payload = `${userId}.${tsStr}`;
  const expected = createHmac("sha256", oauthSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId };
}

export function buildDexcomAuthorizeUrl(userId: string): string {
  const clientId = process.env.DEXCOM_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: dexcomRedirectUri(),
    response_type: "code",
    scope: "offline_access",
    state: signDexcomOAuthState(userId),
  });
  return `${dexcomBaseUrl()}/v2/oauth2/login?${params.toString()}`;
}

async function exchangeToken(body: Record<string, string>): Promise<DexcomTokenBundle> {
  const clientId = process.env.DEXCOM_CLIENT_ID!;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET!;
  const res = await fetch(`${dexcomBaseUrl()}/v2/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...body,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token || !json.refresh_token) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        `Dexcom token falhou (HTTP ${res.status}).`
    );
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + Math.max(60, json.expires_in ?? 7200) * 1000,
  };
}

export async function exchangeDexcomCode(code: string): Promise<DexcomTokenBundle> {
  return exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: dexcomRedirectUri(),
  });
}

export async function refreshDexcomToken(refreshToken: string): Promise<DexcomTokenBundle> {
  return exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export function encryptDexcomTokens(tokens: DexcomTokenBundle): string {
  return encryptCredential(JSON.stringify(tokens));
}

export function decryptDexcomTokens(payload: string): DexcomTokenBundle {
  const parsed = JSON.parse(decryptCredential(payload)) as DexcomTokenBundle;
  if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) {
    throw new Error("Tokens Dexcom inválidos — reconecte a conta.");
  }
  return parsed;
}

/** Busca EGVs das últimas ~24h (ou janela informada). */
export async function fetchDexcomEgvs(
  accessToken: string,
  start: Date,
  end: Date
): Promise<UnifiedCgmReading[]> {
  const params = new URLSearchParams({
    startDate: toDexcomDate(start),
    endDate: toDexcomDate(end),
  });
  const res = await fetch(`${dexcomBaseUrl()}/v3/users/self/egvs?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 401) {
    throw new Error("Token Dexcom expirado ou revogado — reconecte a conta.");
  }
  if (res.status === 429) {
    throw new Error("A Dexcom limitou as tentativas. Aguarde e tente de novo.");
  }
  if (!res.ok) {
    throw new Error(`Dexcom EGV indisponível (HTTP ${res.status}).`);
  }
  const json = (await res.json().catch(() => null)) as { egvs?: DexcomEgvsLike[] } | null;
  return normalizeDexcomEgvs(json?.egvs ?? []);
}

function toDexcomDate(d: Date): string {
  // Dexcom tipicamente espera local-like sem Z; usamos ISO sem ms.
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}
