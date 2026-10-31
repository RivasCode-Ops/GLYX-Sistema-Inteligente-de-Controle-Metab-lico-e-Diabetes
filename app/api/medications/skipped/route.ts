import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registrarDose } from "@/lib/medications/register-dose";
import { doseDoPulo } from "@/lib/medications/pulo";

// "Pulei hoje" pela notificação (Etapa 2, B3). Mesma regra da tela
// (`logMedicationSkipped`): grava `confirmed = false` — dose pulada é
// informação, não lacuna, e não conta como tomada (D16). `pedido` identifica a
// ação: tocar duas vezes não grava dois "pulei".

const schema = z.object({
  medication_id: z.string().uuid(),
  pedido: z.string().uuid().nullish(),
  /** Dose que a notificação anunciou: é ESSA que foi pulada, não a mais próxima do toque. */
  scheduled_for: z.string().datetime().nullish(),
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

  const dose = doseDoPulo(parsed.data.scheduled_for);
  const r = await registrarDose(supabase, user.id, {
    medicationId: parsed.data.medication_id,
    confirmed: false,
    takenAt: dose,
    doseInformada: dose ? dose.toISOString() : null,
    pedido: parsed.data.pedido ?? null,
  });

  if (!r.ok) {
    const status = "conflito" in r ? 409 : r.status;
    return NextResponse.json({ error: "conflito" in r ? "Esta dose já tem registro." : r.erro }, { status });
  }
  return NextResponse.json({ ok: true, resultado: r.resultado });
}

export const runtime = "nodejs";
