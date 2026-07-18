import { createHmac, timingSafeEqual } from "node:crypto";
import { encryptCredential, decryptCredential } from "@/lib/cgm/librelinkup";
import type { GoogleFitDailyLike } from "@/lib/health/google-fit";

// Fluxo OAuth do Google Fit (Fitness REST API). Nota: o Google anunciou a
// descontinuação gradual dessa API em favor do Health Connect (só nativo
// Android) — se `fetchGoogleFitAggregate` começar a devolver 403/404 em
// projetos novos, é sinal de que a API não aceita mais registros novos;
// nesse caso a integração precisaria migrar para Health Connect (app nativo,
// fora do escopo de um PWA web).

export type GoogleFitTokenBundle = {
  access_token: string;
  refresh_token: string;
  /** epoch ms */
  expires_at: number;
};

const SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.sleep.read",
  "https://www.googleapis.com/auth/fitness.heart_rate.read",
].join(" ");

export function isGoogleFitOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_FIT_CLIENT_ID?.trim() && process.env.GOOGLE_FIT_CLIENT_SECRET?.trim()
  );
}

export function googleFitRedirectUri(): string {
  if (process.env.GOOGLE_FIT_REDIRECT_URI?.trim()) return process.env.GOOGLE_FIT_REDIRECT_URI.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (site) return `${site}/api/health/google-fit/callback`;
  throw new Error("Defina GOOGLE_FIT_REDIRECT_URI ou NEXT_PUBLIC_SITE_URL para o OAuth Google Fit.");
}

// Mesmo esquema de state assinado (HMAC) usado pelo OAuth do Dexcom —
// duplicado aqui de propósito, pra não acoplar dois provedores distintos a
// uma única função compartilhada.
function oauthSecret(): string {
  const configured = process.env.CGM_CREDENTIALS_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CGM_CREDENTIALS_SECRET (ou CRON_SECRET legado) ausente no servidor.");
  }
  return "dev-only-google-fit-state";
}

export function signGoogleFitOAuthState(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}`;
  const sig = createHmac("sha256", oauthSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyGoogleFitOAuthState(
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

export function buildGoogleFitAuthorizeUrl(userId: string): string {
  const clientId = process.env.GOOGLE_FIT_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleFitRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // "consent" força o Google a devolver refresh_token mesmo se o usuário
    // já tiver autorizado antes (senão só vem na primeira vez).
    prompt: "consent",
    state: signGoogleFitOAuthState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type RawTokenResponse = { access_token: string; refresh_token: string | undefined; expires_at: number };

async function tokenRequest(body: Record<string, string>): Promise<RawTokenResponse> {
  const clientId = process.env.GOOGLE_FIT_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(
      json?.error_description ||
        json?.error ||
        `Google Fit token falhou (HTTP ${res.status}) — se persistir, a Fitness API pode ter sido descontinuada para projetos novos.`
    );
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + Math.max(60, json.expires_in ?? 3600) * 1000,
  };
}

export async function exchangeGoogleFitCode(code: string): Promise<GoogleFitTokenBundle> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: googleFitRedirectUri(),
  });
  if (!tokens.refresh_token) {
    throw new Error(
      "O Google não devolveu refresh_token — desconecte o acesso do GLYX em myaccount.google.com/permissions e tente conectar de novo."
    );
  }
  return { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at };
}

/** Refresh não devolve um novo refresh_token — preserva o antigo. */
export async function refreshGoogleFitToken(refreshToken: string): Promise<GoogleFitTokenBundle> {
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return { access_token: tokens.access_token, refresh_token: refreshToken, expires_at: tokens.expires_at };
}

export function encryptGoogleFitTokens(tokens: GoogleFitTokenBundle): string {
  return encryptCredential(JSON.stringify(tokens));
}

export function decryptGoogleFitTokens(payload: string): GoogleFitTokenBundle {
  const parsed = JSON.parse(decryptCredential(payload)) as GoogleFitTokenBundle;
  if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) {
    throw new Error("Tokens Google Fit inválidos — reconecte a conta.");
  }
  return parsed;
}

type AggregatePoint = { startTimeNanos?: string; endTimeNanos?: string; value?: { intVal?: number; fpVal?: number }[] };
type AggregateBucket = {
  startTimeMillis?: string;
  dataset?: { dataSourceId?: string; point?: AggregatePoint[] }[];
};

/**
 * Agrega passos, sono e frequência cardíaca por dia (bucket de 24h) via
 * Fitness REST API. Valores ausentes viram null — não falha por faltar um
 * tipo de dado (ex.: relógio sem sensor de sono).
 */
export async function fetchGoogleFitAggregate(
  accessToken: string,
  start: Date,
  end: Date
): Promise<GoogleFitDailyLike[]> {
  const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aggregateBy: [
        { dataTypeName: "com.google.step_count.delta" },
        { dataTypeName: "com.google.heart_rate.bpm" },
        { dataTypeName: "com.google.calories.expended" },
        { dataTypeName: "com.google.sleep.segment" },
      ],
      bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
      startTimeMillis: start.getTime(),
      endTimeMillis: end.getTime(),
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (res.status === 401) {
    throw new Error("Token Google Fit expirado ou revogado — reconecte a conta.");
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error(
      "Google Fit API indisponível para este projeto (HTTP " +
        res.status +
        ") — a Fitness API pode ter sido descontinuada. Veja docs/PRODUCAO.md."
    );
  }
  if (!res.ok) {
    throw new Error(`Google Fit aggregate falhou (HTTP ${res.status}).`);
  }

  const json = (await res.json().catch(() => null)) as { bucket?: AggregateBucket[] } | null;
  const buckets = json?.bucket ?? [];

  return buckets.map((bucket) => {
    const date = new Date(Number(bucket.startTimeMillis ?? 0)).toISOString().slice(0, 10);
    let steps: number | null = null;
    const heartRates: number[] = [];
    let activeCalories: number | null = null;
    let sleepMillis = 0;

    for (const ds of bucket.dataset ?? []) {
      const points = ds.point ?? [];
      if (ds.dataSourceId?.includes("step_count")) {
        const sum = points.reduce((s, p) => s + (p.value?.[0]?.intVal ?? 0), 0);
        if (points.length) steps = (steps ?? 0) + sum;
      } else if (ds.dataSourceId?.includes("heart_rate")) {
        for (const p of points) {
          const v = p.value?.[0]?.fpVal;
          if (typeof v === "number") heartRates.push(v);
        }
      } else if (ds.dataSourceId?.includes("calories")) {
        const sum = points.reduce((s, p) => s + (p.value?.[0]?.fpVal ?? 0), 0);
        if (points.length) activeCalories = Math.round((activeCalories ?? 0) + sum);
      } else if (ds.dataSourceId?.includes("sleep")) {
        for (const p of points) {
          // Estágio de sono: 1=acordado, 3=fora da cama — não conta como sono.
          const stage = p.value?.[0]?.intVal;
          if (stage === 1 || stage === 3) continue;
          const startNanos = Number(p.startTimeNanos ?? 0);
          const endNanos = Number(p.endTimeNanos ?? 0);
          if (endNanos > startNanos) sleepMillis += (endNanos - startNanos) / 1e6;
        }
      }
    }

    // "FC de repouso" aproximada pela mínima observada no dia — a API de
    // agregação não expõe um resting-heart-rate dedicado.
    const restingHr = heartRates.length ? Math.round(Math.min(...heartRates)) : undefined;

    return {
      date,
      steps: steps ?? undefined,
      sleepHours: sleepMillis > 0 ? Math.round((sleepMillis / 3_600_000) * 10) / 10 : undefined,
      heartRateResting: restingHr,
      activeCalories: activeCalories ?? undefined,
    };
  });
}
