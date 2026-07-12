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
  // Abbott rejeita clientes abaixo desta versão (HTTP 403, status 920).
  version: "4.16.0",
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

  // Só a resposta ORIGINAL do login indica credencial errada. Falhas nos
  // passos seguintes (termos/privacidade) não podem virar esse mesmo erro,
  // senão uma senha certa aparenta estar errada numa conta nova.
  if (json.status === 2) {
    throw new Error("E-mail ou senha do LibreLinkUp incorretos.");
  }
  if (json.data?.redirect && json.data.region) {
    return lluLogin(email, password, `https://api-${json.data.region}.libreview.io`, depth + 1);
  }

  // Conta nova costuma exigir aceitar termos/privacidade — às vezes em mais
  // de um passo em sequência. Confirmamos automaticamente, como o app faria.
  let stepGuard = 0;
  while (json?.data?.step?.type && json.data.authTicket?.token && stepGuard < 3) {
    const stepType = json.data.step.type;
    const cont = await fetch(`${baseUrl}/auth/continue/${stepType}`, {
      method: "POST",
      headers: { ...LLU_HEADERS, authorization: `Bearer ${json.data.authTicket.token}` },
      body: JSON.stringify({}),
    });
    json = (await cont.json().catch(() => null)) as LluLoginResponse | null;
    if (!json) {
      throw new Error(
        `Falha ao confirmar automaticamente o passo "${stepType}" do LibreLinkUp. Abra o app LibreLinkUp no celular, aceite qualquer termo/aviso pendente, e tente de novo no GLYX.`
      );
    }
    stepGuard++;
  }

  if (json?.status !== 0 || !json.data?.authTicket?.token || !json.data.user?.id) {
    throw new Error(
      json?.error?.message
        ? `LibreLinkUp: ${json.error.message}`
        : `LibreLinkUp recusou o login depois da senha ser aceita (código ${json?.status ?? "?"}). Abra o app LibreLinkUp no celular, confirme que não há avisos pendentes, e tente de novo.`
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

/**
 * Paciente (conexão) desta conta seguidora. A lista pode conter mais de
 * uma entrada — inclusive "fantasmas" sem sensor vinculado, sem leitura
 * (visto em contas com convites duplicados). Preferimos sempre a que já
 * tem leitura de glicose de verdade.
 */
export async function lluFirstPatientId(session: LluSession): Promise<string> {
  const res = await fetch(`${session.baseUrl}/llu/connections`, {
    headers: authHeaders(session),
  });
  const rawText = await res.text();
  let json: { data?: unknown } | null = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    /* json permanece null; rawText vai para o diagnóstico abaixo */
  }

  // Defensivo: a Abbott já foi vista devolvendo `data` como objeto vazio
  // (não array) quando não há conexão utilizável — nunca assumir array.
  const rawList = Array.isArray(json?.data)
    ? (json.data as { patientId?: string; glucoseMeasurement?: unknown; glucoseItem?: unknown }[])
    : [];
  const list = rawList.filter((c) => c.patientId);
  const withReading = list.find((c) => c.glucoseMeasurement != null || c.glucoseItem != null);
  const id = (withReading ?? list[0])?.patientId;

  if (!id) {
    let parsed: { status?: number; data?: { minimumVersion?: string } } | null = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      /* ignora */
    }
    if (parsed?.status === 920) {
      const min = parsed.data?.minimumVersion ?? "mais recente";
      throw new Error(
        `A Abbott exige uma versão mais nova do cliente LibreLinkUp (mínimo ${min}). ` +
          "O GLYX foi atualizado — tente conectar de novo. Se o erro persistir após o deploy, avise o suporte."
      );
    }
    // Diagnóstico: mostra região/status/corpo bruto para localizar por que a
    // conta some da lista aqui mas aparece no app LibreLinkUp no celular.
    throw new Error(
      `Esta conta não segue nenhum sensor (diagnóstico: baseUrl=${session.baseUrl} ` +
        `httpStatus=${res.status} corpo=${rawText.slice(0, 500)}). ` +
        "Causa comum: usar o MESMO e-mail do app LibreLink também no LibreLinkUp. " +
        "Use uma conta LibreLinkUp separada (convidada pelo app LibreLink) e tente de novo."
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
