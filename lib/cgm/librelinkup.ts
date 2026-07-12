import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cliente da API do LibreLinkUp — o mesmo canal que o app de
 * acompanhamento (médico/família) usa para ver o FreeStyle Libre em
 * tempo quase real. API não documentada oficialmente pela Abbott, mas
 * estável e amplamente usada (Nightscout). Pode quebrar sem aviso; todo
 * erro é registrado em cgm_connections.last_error.
 */

const LLU_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  product: "llu.android",
  version: "4.12.0",
};

export type LluSession = {
  token: string;
  accountId: string;
  baseUrl: string;
};

type LluMeasurement = {
  ValueInMgPerDl?: number;
  Value?: number;
  Timestamp?: string;
  FactoryTimestamp?: string;
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

type LluLoginResponse = {
  status?: number;
  error?: { message?: string };
  data?: {
    redirect?: boolean;
    region?: string;
    authTicket?: { token?: string };
    user?: { id?: string };
    step?: { type?: string };
  };
};

export async function lluLogin(
  email: string,
  password: string,
  baseUrl = "https://api.libreview.io",
  depth = 0
): Promise<LluSession> {
  if (depth > 2) throw new Error("Muitos redirecionamentos de região.");

  const res = await fetch(`${baseUrl}/llu/auth/login`, {
    method: "POST",
    headers: LLU_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  let json = (await res.json().catch(() => null)) as LluLoginResponse | null;

  if (res.status === 429) {
    throw new Error("A Abbott limitou as tentativas por alguns minutos. Aguarde e tente de novo.");
  }
  if (!res.ok || !json) throw new Error(`LibreLinkUp indisponível (HTTP ${res.status}).`);
  if (json.data?.redirect && json.data.region) {
    return lluLogin(email, password, `https://api-${json.data.region}.libreview.io`, depth + 1);
  }

  // Primeiro acesso via API pode exigir aceite de termos/privacidade
  // (passo "tou"/"pp"): confirmamos automaticamente, como o app faria.
  if (json.data?.step?.type && json.data.authTicket?.token) {
    const cont = await fetch(`${baseUrl}/auth/continue/${json.data.step.type}`, {
      method: "POST",
      headers: { ...LLU_HEADERS, authorization: `Bearer ${json.data.authTicket.token}` },
    });
    json = (await cont.json().catch(() => null)) as LluLoginResponse | null;
    if (!json) throw new Error("Falha ao confirmar os termos no LibreLinkUp.");
  }

  if (json.status === 2) {
    throw new Error("E-mail ou senha do LibreLinkUp incorretos.");
  }
  if (json.status !== 0 || !json.data?.authTicket?.token || !json.data.user?.id) {
    throw new Error(
      json.error?.message
        ? `LibreLinkUp: ${json.error.message}`
        : `LibreLinkUp recusou o login (código ${json.status ?? "?"}). Abra o app LibreLinkUp no celular, confirme que ele mostra sua glicemia, e tente de novo.`
    );
  }

  return {
    token: json.data.authTicket.token,
    accountId: sha256Hex(json.data.user.id),
    baseUrl,
  };
}

function authHeaders(session: LluSession): Record<string, string> {
  return {
    ...LLU_HEADERS,
    authorization: `Bearer ${session.token}`,
    "account-id": session.accountId,
  };
}

/** Primeira conexão (paciente) visível para esta conta seguidora. */
export async function lluFirstPatientId(session: LluSession): Promise<string> {
  const res = await fetch(`${session.baseUrl}/llu/connections`, {
    headers: authHeaders(session),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { patientId?: string }[];
  } | null;
  const id = json?.data?.[0]?.patientId;
  if (!id) {
    throw new Error(
      "Nenhum sensor conectado a esta conta LibreLinkUp. Aceite o convite no app LibreLinkUp primeiro."
    );
  }
  return id;
}

/** Leituras das últimas ~12h (gráfico) + a leitura atual. */
export async function lluFetchMeasurements(
  session: LluSession,
  patientId: string
): Promise<LluMeasurement[]> {
  const res = await fetch(`${session.baseUrl}/llu/connections/${patientId}/graph`, {
    headers: authHeaders(session),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: {
      graphData?: LluMeasurement[];
      connection?: { glucoseMeasurement?: LluMeasurement };
    };
  } | null;
  if (!json?.data) throw new Error("Falha ao ler o gráfico do sensor.");

  const out = [...(json.data.graphData ?? [])];
  if (json.data.connection?.glucoseMeasurement) out.push(json.data.connection.glucoseMeasurement);
  return out;
}

// ---------- criptografia das credenciais (AES-256-GCM) ----------

function credKey(): Buffer {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET ausente no servidor.");
  return createHash("sha256").update(`${secret}:libre-cred-v1`).digest();
}

export function encryptCredential(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptCredential(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", credKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
