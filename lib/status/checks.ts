import type { SupabaseClient } from "@supabase/supabase-js";
import { isOpenAIConfigured } from "@/lib/env";

// Auditoria automática do sistema, do ponto de vista do usuário logado.
// Cada verificação consulta o estado REAL (banco, sensor, cron, push, IA)
// e devolve um veredito em português simples — a página /status existe para
// o usuário conferir com os próprios olhos o que funciona, sem depender da
// palavra de ninguém.

export type CheckStatus = "ok" | "warn" | "fail" | "off";

export type SystemCheck = {
  id: string;
  title: string;
  status: CheckStatus;
  /** Explicação em linguagem simples do que foi verificado e o resultado. */
  detail: string;
  /** Link de ação quando há algo a fazer. */
  action?: { label: string; href: string };
};

const MIN = 60 * 1000;

function ageMinutes(iso: string, now = Date.now()): number {
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / MIN));
}

function idade(min: number): string {
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h}h${String(min % 60).padStart(2, "0")}`;
  return `há ${Math.floor(h / 24)} dias`;
}

export function appVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : "desenvolvimento (local)";
}

export async function runSystemChecks(
  supabase: SupabaseClient,
  userId: string
): Promise<SystemCheck[]> {
  const checks: SystemCheck[] = [];

  // --- Banco de dados ---
  const { error: dbError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  checks.push(
    dbError
      ? {
          id: "db",
          title: "Banco de dados",
          status: "fail",
          detail: `Falha ao consultar seus dados: ${dbError.message}`,
        }
      : {
          id: "db",
          title: "Banco de dados",
          status: "ok",
          detail: "Seus dados estão acessíveis e a conexão com o servidor funciona.",
        }
  );

  const [connRes, readingRes, subsRes, dispatchRes, aiRes, snoozeRes] = await Promise.all([
    supabase
      .from("cgm_connections")
      .select(
        "provider, last_sync_at, last_error, circuit_open_until, last_error_kind, consecutive_failures"
      )
      .eq("user_id", userId)
      .order("last_sync_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("glucose_readings")
      .select("recorded_at, value_mg_dl, source")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("push_subscriptions").select("id").eq("user_id", userId).limit(1),
    supabase
      .from("push_dispatch_log")
      .select("kind, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ai_usage")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("medication_snoozes")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // --- Sensor (conexão LibreLinkUp) ---
  const conn = connRes.data;
  if (!conn) {
    checks.push({
      id: "sensor",
      title: "Sensor de glicose (LibreLinkUp)",
      status: "off",
      detail: "Nenhum sensor conectado. Conecte para receber leituras automáticas.",
      action: { label: "Conectar sensor", href: "/integracoes" },
    });
  } else if (
    conn.circuit_open_until &&
    new Date(conn.circuit_open_until).getTime() > Date.now()
  ) {
    checks.push({
      id: "sensor",
      title: "Sensor de glicose (LibreLinkUp)",
      status: "warn",
      detail: `Sync automático em pausa (proteção) até ${new Date(conn.circuit_open_until).toLocaleString("pt-BR")}${
        conn.last_error ? ` — último erro: "${conn.last_error}"` : ""
      }.`,
      action: { label: "Ver sensor", href: "/integracoes" },
    });
  } else if (conn.last_error) {
    checks.push({
      id: "sensor",
      title: "Sensor de glicose (LibreLinkUp)",
      status: "fail",
      detail: `A sincronização está falhando: "${conn.last_error}". Reconecte informando a senha de novo.`,
      action: { label: "Reconectar agora", href: "/integracoes" },
    });
  } else {
    const syncAge = conn.last_sync_at ? ageMinutes(conn.last_sync_at) : null;
    checks.push(
      syncAge != null && syncAge <= 30
        ? {
            id: "sensor",
            title: "Sensor de glicose (LibreLinkUp)",
            status: "ok",
            detail: `Conectado e sincronizando — última sincronização ${idade(syncAge)}.`,
          }
        : {
            id: "sensor",
            title: "Sensor de glicose (LibreLinkUp)",
            status: "warn",
            detail:
              syncAge == null
                ? "Conectado, mas nenhuma sincronização aconteceu ainda."
                : `Conectado, mas a última sincronização foi ${idade(syncAge)} (esperado: a cada 15 min).`,
            action: { label: "Ver sensor", href: "/integracoes" },
          }
    );
  }

  // --- Leituras chegando ---
  const reading = readingRes.data;
  if (!reading) {
    checks.push({
      id: "readings",
      title: "Leituras de glicemia",
      status: conn ? "fail" : "off",
      detail: conn
        ? "Sensor conectado, mas nenhuma leitura registrada ainda."
        : "Nenhuma leitura registrada. Registre manualmente ou conecte o sensor.",
      action: { label: "Registrar glicemia", href: "/glicemia" },
    });
  } else {
    const age = ageMinutes(reading.recorded_at);
    const fonte = reading.source === "manual" ? "manual" : "do sensor";
    checks.push(
      conn && age > 30
        ? {
            id: "readings",
            title: "Leituras de glicemia",
            status: age > 24 * 60 ? "fail" : "warn",
            detail: `Última leitura (${fonte}): ${reading.value_mg_dl} mg/dL ${idade(age)}. Com sensor ativo, o esperado é uma leitura nova a cada ~15 min.`,
            action: { label: "Ver sensor", href: "/integracoes" },
          }
        : {
            id: "readings",
            title: "Leituras de glicemia",
            status: "ok",
            detail: `Última leitura (${fonte}): ${reading.value_mg_dl} mg/dL ${idade(age)}.`,
          }
    );
  }

  // --- Robô de avisos (pg_cron → push) ---
  const lastDispatch = dispatchRes.data;
  if (!lastDispatch) {
    checks.push({
      id: "cron",
      title: "Robô de avisos (servidor)",
      status: "warn",
      detail:
        "Nenhum aviso automático foi enviado ainda para a sua conta (água, remédio, dica do dia).",
    });
  } else {
    const age = ageMinutes(lastDispatch.created_at);
    // Lembretes de água rodam a cada ~2h entre 8h e 20h — de madrugada o
    // silêncio é normal, então o limite considera a janela noturna.
    checks.push(
      age <= 13 * 60
        ? {
            id: "cron",
            title: "Robô de avisos (servidor)",
            status: "ok",
            detail: `Funcionando — último aviso automático enviado ${idade(age)} (${lastDispatch.kind}).`,
          }
        : {
            id: "cron",
            title: "Robô de avisos (servidor)",
            status: "fail",
            detail: `O último aviso automático foi ${idade(age)} — o robô do servidor pode estar parado.`,
          }
    );
  }

  // --- Notificações neste dispositivo ---
  const temSub = (subsRes.data?.length ?? 0) > 0;
  const vapidOk = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.length && process.env.VAPID_PRIVATE_KEY?.length
  );
  checks.push(
    !vapidOk
      ? {
          id: "push",
          title: "Notificações (alarmes no celular)",
          status: "fail",
          detail: "O servidor está sem as chaves de notificação (VAPID) — nenhum alarme chega.",
        }
      : temSub
        ? {
            id: "push",
            title: "Notificações (alarmes no celular)",
            status: "ok",
            detail: "Há pelo menos um dispositivo registrado para receber alarmes.",
          }
        : {
            id: "push",
            title: "Notificações (alarmes no celular)",
            status: "warn",
            detail: "Nenhum dispositivo registrado — ative as notificações para receber os alarmes.",
            action: { label: "Ativar em Medicação", href: "/medicacao" },
          }
  );

  // --- Botão "Adiar" dos alarmes ---
  const lastSnooze = snoozeRes.data;
  checks.push(
    lastSnooze
      ? {
          id: "snooze",
          title: 'Botão "Adiar" do alarme',
          status: "ok",
          detail: `Último adiamento registrado com sucesso ${idade(ageMinutes(lastSnooze.created_at))}.`,
        }
      : {
          id: "snooze",
          title: 'Botão "Adiar" do alarme',
          status: "off",
          detail: "Nunca usado — quando você tocar em Adiar numa notificação, o registro aparece aqui.",
        }
  );

  // --- IA ---
  const iaConfigured = isOpenAIConfigured();
  const lastAi = aiRes.data;
  checks.push(
    !iaConfigured
      ? {
          id: "ai",
          title: "Inteligência artificial (foto de refeição, copiloto)",
          status: "fail",
          detail: "Chave de IA não configurada no servidor — análises por foto e chat não funcionam.",
        }
      : {
          id: "ai",
          title: "Inteligência artificial (foto de refeição, copiloto)",
          status: "ok",
          detail: lastAi
            ? `Configurada — último uso ${idade(ageMinutes(lastAi.created_at))}.`
            : "Configurada e pronta (nenhum uso registrado ainda).",
        }
  );

  // --- Observabilidade (ops) ---
  const sentryOn = Boolean(
    process.env.SENTRY_DSN?.length || process.env.NEXT_PUBLIC_SENTRY_DSN?.length
  );
  const webhookOn = Boolean(process.env.OPS_ALERT_WEBHOOK_URL?.length);
  checks.push(
    sentryOn
      ? {
          id: "observability",
          title: "Monitoramento de erros (Sentry)",
          status: "ok",
          detail: webhookOn
            ? "Sentry ativo e webhook de alerta de cron configurado."
            : "Sentry ativo — falhas de CGM/push/cron são registradas. Webhook ops opcional.",
        }
      : {
          id: "observability",
          title: "Monitoramento de erros (Sentry)",
          status: "warn",
          detail:
            "Sentry não configurado (SENTRY_DSN). Erros de sync/push ficam só nos logs do servidor.",
        }
  );

  return checks;
}
