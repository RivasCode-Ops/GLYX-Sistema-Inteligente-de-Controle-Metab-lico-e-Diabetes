import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  critical?: boolean;
  /** ID do medicamento — habilita a ação "Já tomei" na notificação */
  medId?: string | null;
};

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.length && process.env.VAPID_PRIVATE_KEY?.length
  );
}

function configure(): boolean {
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@glyx.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return true;
}

/** Envia para uma assinatura; devolve false se ela expirou (para limpeza). */
export async function sendToSubscription(
  sub: StoredSubscription,
  payload: PushPayload
): Promise<boolean> {
  if (!configure()) return true;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: payload.critical ? "high" : "normal" }
    );
    return true;
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "statusCode" in e
        ? Number((e as { statusCode?: number }).statusCode)
        : null;
    // 404/410 = assinatura morta (app desinstalado, permissão revogada)
    return !(status === 404 || status === 410);
  }
}

/** Envia para todas as assinaturas do usuário da sessão atual (RLS restringe ao dono). */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!isPushConfigured()) return;
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  for (const sub of (data ?? []) as StoredSubscription[]) {
    const alive = await sendToSubscription(sub, payload);
    if (!alive) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
  }
}
