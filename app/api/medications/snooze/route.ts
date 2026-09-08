import { NextResponse } from "next/server";
import { z } from "zod";
import { MATCH_BEFORE_MS, doseWindows } from "@/lib/medications/adherence";
import type { TimingStrictness } from "@/lib/medications/adherence-status";
import { decideSnooze, MAX_SNOOZE_ATTEMPTS } from "@/lib/medications/snooze-rules";
import { localDateKey } from "@/lib/time/local-day";
import { createClient } from "@/lib/supabase/server";

// Chamado pelo service worker quando o usuário toca "Adiar" na notificação
// de alarme — agenda um novo aviso em N minutos, sem exigir abrir o app.
//
// O adiamento é sempre uma LINHA NOVA, com `attempt` incrementado. Nunca um
// UPDATE: `snoozed_until` é imutável depois de gravado, e o unique
// (user_id, medication_id, scheduled_for, attempt) faz uma regravação da mesma
// tentativa falhar em vez de deslizar o horário em silêncio.

const schema = z.object({
  medication_id: z.string().uuid(),
  minutes: z.number().int().min(1).max(120).optional(),
});

const RECUSA: Record<"livre" | "limite" | "dia_virado" | "sem_horario", string> = {
  livre: "Este item não tem horário fixo — não há alarme para adiar.",
  limite: `Você já adiou esta dose ${MAX_SNOOZE_ATTEMPTS} vezes. Registre que tomou, ou marque que pulou hoje.`,
  dia_virado: "O horário desta dose era de outro dia. Registre agora ou marque que pulou.",
  sem_horario: "Este item não tem horário cadastrado — não há alarme para adiar.",
};

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

  const { data: med } = await supabase
    .from("medications")
    .select("id, reminder_times, timing_strictness")
    .eq("id", parsed.data.medication_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!med) {
    return NextResponse.json({ error: "Medicamento não encontrado." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const tz = profile?.timezone || "America/Sao_Paulo";

  const now = new Date();
  const strictness = (med.timing_strictness as TimingStrictness | null) ?? "flexivel";
  const horarios = ((med.reminder_times as string[] | null) ?? []).filter((t) =>
    /^\d{1,2}:\d{2}$/.test(t.trim())
  );

  if (!horarios.length) {
    return NextResponse.json({ error: RECUSA.sem_horario }, { status: 409 });
  }

  // Qual dose está sendo adiada. Sem isso não há como contar tentativas POR
  // DOSE nem fazer o adiamento morrer com o dia — as duas coisas que impediam a
  // cadeia de adiamentos de se prorrogar sem fim.
  const [y, mo, d] = localDateKey(now.toISOString(), tz).split("-").map(Number);
  const janelas = doseWindows(horarios, y, mo, d, tz);
  const t = now.getTime();
  const atual =
    janelas.find(
      (w) => t >= w.scheduledUTC.getTime() - MATCH_BEFORE_MS && t <= w.windowEndUTC.getTime()
    ) ??
    // Fora de qualquer janela do dia: o alarme que tocou é da última dose já
    // vencida. Sem candidata, não há dose a adiar.
    [...janelas].reverse().find((w) => w.scheduledUTC.getTime() <= t);

  if (!atual) {
    return NextResponse.json({ error: RECUSA.sem_horario }, { status: 409 });
  }

  const scheduledFor = atual.scheduledUTC;

  const { count } = await supabase
    .from("medication_snoozes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("medication_id", med.id)
    .eq("scheduled_for", scheduledFor.toISOString());

  const decisao = decideSnooze({
    strictness,
    scheduledFor,
    attemptsUsed: count ?? 0,
    minutes: parsed.data.minutes,
    now,
    timeZone: tz,
  });

  if (!decisao.allowed) {
    // 409, não 500: é regra de negócio satisfeita, não falha. O cliente usa
    // isso para trocar as ações do card em vez de mostrar erro genérico.
    return NextResponse.json(
      { error: RECUSA[decisao.reason], reason: decisao.reason, canSnooze: false },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("medication_snoozes").insert({
    user_id: user.id,
    medication_id: med.id,
    snoozed_until: decisao.snoozedUntil.toISOString(),
    scheduled_for: scheduledFor.toISOString(),
    attempt: decisao.attempt,
  });
  if (error) {
    // Violação do unique significa que esta tentativa já existe — duplo toque
    // no botão, ou reenvio do service worker. O adiamento pedido já está
    // gravado, então isso é sucesso, não erro.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true, attempt: decisao.attempt });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    snoozedUntil: decisao.snoozedUntil.toISOString(),
    attempt: decisao.attempt,
    attemptsLeft: MAX_SNOOZE_ATTEMPTS - decisao.attempt,
  });
}

export const runtime = "nodejs";
