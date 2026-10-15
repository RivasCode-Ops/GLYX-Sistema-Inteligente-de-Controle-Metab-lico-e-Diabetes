import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registrarDose } from "@/lib/medications/register-dose";
import { urlDoConflito } from "@/lib/medications/conflito-registro";
import { formatarHora } from "@/lib/time/format";

// Chamado pelo service worker quando o usuário toca "Já tomei" na
// notificação de alarme — registra a dose sem abrir o app.
//
// Mesma regra da tela (`lib/medications/register-dose.ts`). `pedido` identifica
// a AÇÃO (gerado quando a notificação aparece): tocar duas vezes, ou o navegador
// repetir o envio, não cria outra tomada. Se já houver OUTRA tomada nessa dose,
// a resposta é 409 com o link para a pessoa decidir no app — uma notificação
// não tem como perguntar "corrigir ou outra tomada?". `scheduled_for` é a dose
// que a notificação anunciou; notificação antiga não manda nem um nem outro.

const schema = z.object({
  medication_id: z.string().uuid(),
  scheduled_for: z.string().datetime().nullish(),
  pedido: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
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

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const r = await registrarDose(supabase, user.id, {
    medicationId: parsed.data.medication_id,
    confirmed: true,
    doseInformada: parsed.data.scheduled_for ?? null,
    pedido: parsed.data.pedido ?? null,
  });

  if (!r.ok && "conflito" in r) {
    const { data: p } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
    const tz = (p?.timezone as string | null) ?? null;
    return NextResponse.json(
      {
        conflito: true,
        registradaAs: r.conflito.existentes.map((e) => formatarHora(e.takenAt, tz)),
        url: urlDoConflito({
          medicationId: parsed.data.medication_id,
          scheduledFor: r.conflito.scheduledFor,
          takenAtPedido: r.conflito.takenAtPedido,
          pedido: parsed.data.pedido ?? null,
        }),
      },
      { status: 409 }
    );
  }
  if (!r.ok) {
    return NextResponse.json({ error: r.erro }, { status: r.status });
  }

  return NextResponse.json({ ok: true, resultado: r.resultado, duplicado: r.resultado === "reenvio" });
}

export const runtime = "nodejs";
