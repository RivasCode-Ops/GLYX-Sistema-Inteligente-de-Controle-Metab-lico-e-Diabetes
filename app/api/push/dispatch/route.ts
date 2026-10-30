import { NextResponse } from "next/server";
import { secretsMatch } from "@/lib/auth/constant-time";
import { z } from "zod";
import { reportCronOutcome, reportException } from "@/lib/observability";
import { entregarPush } from "@/lib/push/send";
import { consolidarDespachos } from "@/lib/push/dispatch-outcome";
import { createAdminClient } from "@/lib/supabase/admin";

// Chamado pelo pg_cron do Supabase a cada 5 min com os alarmes vencidos.
// O banco decide QUEM e QUANDO e reivindica cada alarme (`push_dispatch_log`,
// status 'enviando'); esta rota entrega e CONFIRMA o desfecho de cada um.
//
// Antes, o banco gravava o anti-duplicação e disparava o POST sem saber se ele
// chegou: falha aqui perdia o alarme sem registro. Agora:
//   - entregue a algum aparelho      → 'enviado'
//   - todas as assinaturas mortas    → 'sem_assinatura'
//   - falha transitória              → 'falhou' (o banco reenvia, até 3x, em 30 min)
//   - esta rota caiu antes de confirmar → fica 'enviando' e o banco reenvia
//     depois de 4 min. Um reenvio que chegue em duplicidade é fundido no
//     aparelho pela tag da notificação, que é uma por dose.
//
// Itens sem `dispatchId` (dica diária, água, sugestão) seguem como antes: só
// entrega, sem confirmação.

const itemSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  critical: z.boolean().optional(),
  medId: z.string().nullish(),
  scheduledFor: z.string().nullish(),
  tag: z.string().max(200).nullish(),
  dispatchId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  // Comparação em tempo constante: `!==` sai no primeiro byte diferente e
  // vaza, pelo tempo de resposta, quanto do segredo o atacante já acertou.
  if (!secretsMatch(req.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = z.array(itemSchema).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  let sent = 0;
  let dead = 0;
  const mortas = new Set<string>();
  const tentativas: Parameters<typeof consolidarDespachos>[0][number][] = [];

  for (const item of parsed.data) {
    const resultado = await entregarPush(
      { endpoint: item.endpoint, p256dh: item.p256dh, auth: item.auth },
      {
        title: item.title,
        body: item.body,
        url: "/medicacao",
        critical: item.critical ?? true,
        medId: item.medId ?? null,
        scheduledFor: item.scheduledFor ?? null,
        tag: item.tag ?? null,
      }
    );
    tentativas.push({ dispatchId: item.dispatchId, resultado });
    if (resultado.entregue) sent += 1;
    else if (resultado.morta) {
      dead += 1;
      mortas.add(item.endpoint);
    }
  }

  const desfechos = consolidarDespachos(tentativas);
  const falhas = desfechos.filter((d) => d.status === "falhou").length;
  const admin = desfechos.length || mortas.size ? createAdminClient() : null;

  if (desfechos.length && !admin) {
    // Sem service role não há como confirmar: os alarmes ficam 'enviando' e o
    // banco reenvia. Fica visível em vez de silencioso.
    reportException(new Error("push-dispatch sem service role: desfecho não confirmado"), {
      tags: { job: "push-dispatch" },
      extra: { pendentes: desfechos.length },
      level: "error",
    });
  }

  if (admin) {
    const agora = new Date().toISOString();
    for (const status of ["enviado", "sem_assinatura", "falhou"] as const) {
      const grupo = desfechos.filter((d) => d.status === status);
      if (!grupo.length) continue;
      // Um update por motivo: os de 'falhou' podem ter motivos diferentes.
      const porErro = new Map<string | null, string[]>();
      for (const d of grupo) porErro.set(d.erro, [...(porErro.get(d.erro) ?? []), d.id]);
      for (const [erro, ids] of porErro) {
        const { error } = await admin
          .from("push_dispatch_log")
          .update({
            status,
            last_error: erro,
            confirmed_at: status === "falhou" ? null : agora,
          })
          .in("id", ids)
          // Só confirma o que ainda está em voo: não reescreve um desfecho que
          // outra rodada já gravou.
          .eq("status", "enviando");
        if (error) {
          reportException(new Error("push-dispatch: falha ao confirmar desfecho"), {
            tags: { job: "push-dispatch" },
            extra: { status, quantidade: ids.length },
            level: "error",
          });
        }
      }
    }

    if (mortas.size) {
      await admin.from("push_subscriptions").delete().in("endpoint", [...mortas]);
    }
  }

  await reportCronOutcome("push-dispatch", {
    sent,
    dead,
    total: parsed.data.length,
    failed: falhas || (sent === 0 && dead > 0 ? dead : 0),
  });
  return NextResponse.json({ ok: true, sent, dead, confirmados: desfechos.length });
}

export const runtime = "nodejs";
export const maxDuration = 60;
