import { NextResponse } from "next/server";
import { z } from "zod";
import { reportCronOutcome } from "@/lib/observability";
import { sendToSubscription } from "@/lib/push/send";

// Chamado pelo pg_cron do Supabase a cada 5 min com os alarmes vencidos.
// O banco faz a consulta e o dedupe; esta rota só entrega os pushes —
// assim o servidor web não precisa da service role key.

const itemSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  critical: z.boolean().optional(),
  medId: z.string().nullish(),
});

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json();
  const parsed = z.array(itemSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  let sent = 0;
  let dead = 0;
  for (const item of parsed.data) {
    const alive = await sendToSubscription(
      { endpoint: item.endpoint, p256dh: item.p256dh, auth: item.auth },
      {
        title: item.title,
        body: item.body,
        url: "/medicacao",
        critical: item.critical ?? true,
        medId: item.medId ?? null,
      }
    );
    if (alive) sent += 1;
    else dead += 1;
  }

  await reportCronOutcome("push-dispatch", {
    sent,
    dead,
    total: parsed.data.length,
    failed: sent === 0 && dead > 0 ? dead : 0,
  });
  return NextResponse.json({ ok: true, sent, dead });
}

export const runtime = "nodejs";
export const maxDuration = 60;
