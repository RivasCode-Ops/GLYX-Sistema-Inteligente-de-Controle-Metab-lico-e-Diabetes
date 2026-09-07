import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBodyContextLines } from "@/lib/ai/body-context";
import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import { checkSubstanceSafety } from "@/lib/queries/substance-safety";
import { renderVerdictBlock } from "@/lib/safety/present";
import {
  buildContextReceipt,
  divergenciaAlimentacao,
  divergenciaExercicio,
  divergenciaInsulina,
  divergenciaMedicacao,
  renderContextReceipt,
} from "@/lib/ai/context-receipt";
import { BEVERAGE_META, isBeverageKind } from "@/lib/health/beverages";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import { computeHourlyPattern, worstHours } from "@/lib/insights/hourly-pattern";
import { startOfLocalDayISO } from "@/lib/time/local-day";

// Contexto compacto dos dados recentes do usuário para o copiloto de IA:
// glicemia, refeições, insulina extra, bebidas, água e exercício. Sem isso o
// chat conversa "às cegas". Montado no servidor (sessão do usuário, RLS) e
// injetado como mensagem de sistema — o modelo lê, mas nunca prescreve dose.

const HORA = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export async function buildUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, primary_focus, body_goal, target_glucose_min, target_glucose_max")
    .eq("id", userId)
    .maybeSingle();
  const tz = profile?.timezone || "America/Sao_Paulo";
  const startOfDay = startOfLocalDayISO(profile?.timezone);
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const fiveDaysAgoDate = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

  const [
    glucoseRes,
    mealsRes,
    insulinRes,
    beveragesRes,
    exerciseRes,
    weightRes,
    spikesRes,
    historyRes,
    medsRes,
    sleepRes,
    auditRes,
    alertsRes,
    supplementsRes,
  ] = await Promise.all([
      supabase
        .from("glucose_readings")
        .select("value_mg_dl, recorded_at, source")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(8),
      supabase
        .from("meals")
        .select("name, calories, carbs_g, eaten_at")
        .eq("user_id", userId)
        .gte("eaten_at", startOfDay)
        .order("eaten_at", { ascending: true }),
      supabase
        .from("insulin_logs")
        .select("units, insulin_kind, reason, glucose_mg_dl, applied_at")
        .eq("user_id", userId)
        .gte("applied_at", twoDaysAgo)
        .order("applied_at", { ascending: false })
        .limit(10),
      supabase
        .from("water_logs")
        .select("amount_ml, kind")
        .eq("user_id", userId)
        .gte("logged_at", startOfDay),
      supabase
        .from("exercise_sessions")
        .select("label, duration_min, started_at")
        .eq("user_id", userId)
        .gte("started_at", twoDaysAgo)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("user_id", userId)
        .order("logged_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("meals")
        .select("name, carbs_g, eaten_at")
        .eq("user_id", userId)
        .eq("glucose_spike", true)
        .gte("eaten_at", new Date(Date.now() - 72 * 3600_000).toISOString())
        .order("eaten_at", { ascending: false })
        .limit(5),
      supabase
        .from("glucose_readings")
        .select("value_mg_dl, recorded_at")
        .eq("user_id", userId)
        .gte("recorded_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order("recorded_at", { ascending: false })
        .limit(2000),
      supabase
        .from("medications")
        .select("id, name, dosage, reminder_times, kind")
        .eq("user_id", userId)
        .eq("active", true)
        .eq("kind", "med"),
      supabase
        .from("health_snapshots")
        .select("snapshot_date, source, sleep_hours")
        .eq("user_id", userId)
        .gte("snapshot_date", fiveDaysAgoDate)
        .not("sleep_hours", "is", null),
      supabase
        .from("metabolic_audits")
        .select("score, label, factors, computed_at")
        .eq("user_id", userId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("metabolic_alerts")
        .select("severity, title, created_at")
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5),
      // Suplementos ativos: são os candidatos da checagem de interação. Ficam
      // fora de `medsRes` (que filtra kind='med') justamente porque o papel
      // deles aqui é outro — não é adesão, é o que pode interagir.
      supabase
        .from("medications")
        .select("name")
        .eq("user_id", userId)
        .eq("active", true)
        .eq("kind", "supplement"),
    ]);

  const meds = medsRes.data ?? [];
  const medIds = meds.map((m) => m.id as string);
  const medLogCounts = new Map<string, number>();
  if (medIds.length) {
    const { data: medLogs } = await supabase
      .from("medication_logs")
      .select("medication_id")
      .eq("user_id", userId)
      .in("medication_id", medIds)
      .gte("taken_at", sevenDaysAgo);
    for (const l of medLogs ?? []) {
      const id = l.medication_id as string;
      medLogCounts.set(id, (medLogCounts.get(id) ?? 0) + 1);
    }
  }

  const linhas: string[] = [];

  if (profile?.primary_focus) {
    const foco = { diabetes: "controle do diabetes", lose: "emagrecer", gain: "ganhar massa" }[
      profile.primary_focus as "diabetes" | "lose" | "gain"
    ];
    if (foco) linhas.push(`Foco do usuário: ${foco}.`);
  }
  if (weightRes.data?.weight_kg) linhas.push(`Peso atual: ${weightRes.data.weight_kg} kg.`);
  const targets = resolveGlucoseTargets(profile);
  linhas.push(
    `Faixa alvo de glicemia definida no app: ${targets.targetMin}–${targets.targetMax} mg/dL (ajustes de meta são decisão médica).`
  );

  const audit = auditRes.data as { score: number; label: string; factors: unknown; computed_at: string } | null;
  if (audit) {
    const factors = (Array.isArray(audit.factors) ? audit.factors : []) as {
      label?: string;
      severity?: string;
    }[];
    const topFactors = factors
      .slice(0, 3)
      .map((f) => `${sanitizeForPrompt(f.label ?? "fator", 60)}${f.severity ? ` (${f.severity})` : ""}`)
      .join(", ");
    linhas.push(
      `Mapa de risco (auditoria longitudinal mais recente, ${new Date(audit.computed_at).toLocaleDateString("pt-BR")}): score ${audit.score}/100, classificação "${audit.label}"${topFactors ? `. Principais fatores: ${topFactors}` : ""}.`
    );
  }

  const alerts = alertsRes.data ?? [];
  if (alerts.length) {
    linhas.push(
      `Alertas metabólicos recentes (48h, já notificados ao usuário no app): ${alerts
        .map((a) => `${sanitizeForPrompt(a.title, 80)} (${a.severity}) às ${HORA(a.created_at, tz)}`)
        .join("; ")}.`
    );
  }

  if (meds.length) {
    linhas.push(
      `Medicação/insulina com horário programado (últimos 7 dias, doses REGISTRADAS no app — pode não refletir 100% da adesão real se o usuário esquecer de registrar): ${meds
        .map((m) => {
          const times = (m.reminder_times as string[] | null) ?? [];
          const expected = times.length * 7;
          const logged = medLogCounts.get(m.id as string) ?? 0;
          return `${sanitizeForPrompt(m.name, 60)}${m.dosage ? ` (${sanitizeForPrompt(m.dosage, 30)})` : ""} — ${times.length}×/dia, ${logged}/${expected} doses registradas`;
        })
        .join("; ")}.`
    );
  }

  const gl = glucoseRes.data ?? [];
  if (gl.length) {
    linhas.push(
      `Glicemia recente (mg/dL): ${gl
        .map((g) => `${g.value_mg_dl} às ${HORA(g.recorded_at, tz)}${g.source === "manual" ? " (manual)" : ""}`)
        .join("; ")}.`
    );
  }

  const meals = mealsRes.data ?? [];
  if (meals.length) {
    linhas.push(
      `Refeições de hoje: ${meals
        .map((m) => `${sanitizeForPrompt(m.name ?? "refeição", 80)} (${m.carbs_g ?? "?"} g carb) às ${HORA(m.eaten_at, tz)}`)
        .join("; ")}.`
    );
  }

  const ins = insulinRes.data ?? [];
  if (ins.length) {
    const motivo: Record<string, string> = { correcao: "correção", refeicao: "refeição", outra: "outro" };
    linhas.push(
      `Insulina extra registrada (últimas 48h): ${ins
        .map(
          (i) =>
            `${i.units} U ${i.insulin_kind} (${motivo[i.reason] ?? i.reason}) às ${HORA(i.applied_at, tz)}${
              i.glucose_mg_dl ? ` com glicemia ${i.glucose_mg_dl}` : ""
            }`
        )
        .join("; ")}.`
    );
  }

  const bev = beveragesRes.data ?? [];
  if (bev.length) {
    const porTipo = new Map<string, { count: number; ml: number }>();
    for (const b of bev) {
      const kind = b.kind ?? "agua";
      const cur = porTipo.get(kind) ?? { count: 0, ml: 0 };
      cur.count += 1;
      cur.ml += b.amount_ml ?? 0;
      porTipo.set(kind, cur);
    }
    linhas.push(
      `Bebidas de hoje: ${[...porTipo.entries()]
        .map(([kind, v]) => {
          const label = isBeverageKind(kind) ? BEVERAGE_META[kind].label : kind;
          return `${v.count}× ${label} (${v.ml} ml)`;
        })
        .join("; ")}.`
    );
  }

  const history = historyRes.data ?? [];
  if (history.length >= 20) {
    const piores = worstHours(computeHourlyPattern(history, tz, targets.targetMax));
    if (piores.length) {
      linhas.push(
        `Padrão por hora do dia (14 dias, fuso do usuário) — janelas com mais leituras ACIMA da meta: ${piores
          .map((b) => `${b.hour}h (média ${b.avg} mg/dL, ${b.pctAbove}% acima da meta em ${b.count} leituras)`)
          .join("; ")}.`
      );
    } else {
      linhas.push("Padrão por hora do dia (14 dias): nenhuma janela concentra leituras acima da meta.");
    }
  }

  const spikes = spikesRes.data ?? [];
  if (spikes.length) {
    linhas.push(
      `Refeições que causaram PICO glicêmico (72h, subida ≥50 mg/dL ou acima de 180 em até 2h): ${spikes
        .map((s) => `${sanitizeForPrompt(s.name ?? "refeição", 80)} (${s.carbs_g ?? "?"} g carb) às ${HORA(s.eaten_at, tz)}`)
        .join("; ")}.`
    );
  }

  const ex = exerciseRes.data ?? [];
  if (ex.length) {
    linhas.push(
      `Exercício (48h): ${ex
        .map((e) => `${sanitizeForPrompt(e.label, 60)}${e.duration_min ? ` ${e.duration_min} min` : ""} em ${HORA(e.started_at, tz)}`)
        .join("; ")}.`
    );
  }

  // Composição corporal: sem isso o chat responde "estou ganhando músculo ou
  // gordura?" no chute, enquanto o app já tem a resposta calculada.
  linhas.push(...(await buildBodyContextLines(supabase, userId)));

  const SLEEP_SRC_PRIORITY = ["manual", "apple_health", "google_fit"];
  const sleepByDate = new Map<string, { hours: number; rank: number }>();
  for (const row of sleepRes.data ?? []) {
    const day = row.snapshot_date as string;
    const rank = SLEEP_SRC_PRIORITY.indexOf(row.source as string);
    if (rank === -1) continue;
    const existing = sleepByDate.get(day);
    if (!existing || rank < existing.rank) {
      sleepByDate.set(day, { hours: Number(row.sleep_hours), rank });
    }
  }
  if (sleepByDate.size) {
    const dias = [...sleepByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    linhas.push(
      `Sono (últimos dias com registro): ${dias
        .map(([day, v]) => `${new Date(day + "T12:00:00").toLocaleDateString("pt-BR")} — ${v.hours}h`)
        .join("; ")}.`
    );
  }

  if (!linhas.length) return "";

  // A data de hoje vem dita, não deduzida. Sem ela o modelo inferia "hoje" da
  // leitura mais recente — e com o sensor parado desde ontem ele anunciou
  // "seus dados de hoje (13/08)" num dia 14/08. Num app de glicemia, analisar
  // o dia errado com convicção é pior que não saber a data.
  const hoje = new Date().toLocaleDateString("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const resumo =
    `DADOS RECENTES DO USUÁRIO (somente leitura, use para contextualizar as respostas; ` +
    `horários no fuso do usuário). HOJE é ${hoje} — use esta data, nunca deduza o dia atual ` +
    `a partir do registro mais recente: se o último dado for de dias atrás, isso significa que ` +
    `não há registro recente, e vale dizer isso ao usuário.\n- ` +
    linhas.join("\n- ");

  // Checagem de interação dos suplementos que o usuário já tem cadastrados
  // contra a medicação/insulina em uso. Entra no contexto — não no SYSTEM —
  // porque é dado do usuário, calculado a cada conversa. O SYSTEM é que diz ao
  // modelo como tratá-lo: veredito já decidido, não reavaliável.
  //
  // Vem DEPOIS do resumo por ser conteúdo derivado dele; e a regra
  // anti-injeção do SYSTEM continua valendo sobre os dois, já que os nomes aqui
  // também passam por sanitizeForPrompt.
  const suplementos = (supplementsRes.data ?? [])
    .map((s) => (s.name as string | null) ?? "")
    .filter((n) => n.trim().length > 0);

  // -------------------------------------------------------------------------
  // Recibo de contexto — vai no TOPO, antes dos dados
  // -------------------------------------------------------------------------
  // O modelo precisa saber o que FALTA antes de ler o que existe. Sem isso,
  // "0 refeições" e "nenhuma refeição registrada" chegam iguais, e a segunda
  // vira conclusão de jejum.
  //
  // Duas contagens extras para as divergências: dose órfã (medication_id nulo,
  // consequência do `on delete set null`) e insulina sem tipo (que some do
  // checador de interação).
  const [orfasRes, insulinaOutraRes] = await Promise.all([
    supabase
      .from("medication_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("medication_id", null)
      .gte("taken_at", sevenDaysAgo),
    supabase
      .from("insulin_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("insulin_kind", "outra")
      .gte("applied_at", sevenDaysAgo),
  ]);

  const agora = new Date().toISOString();
  const janela = (from: string) => ({ from, to: agora });
  const minutosDeExercicio = ex.reduce((s, e) => s + (e.duration_min ?? 0), 0);

  // NOTA sobre `zero_confirmado`: nenhum campo o usa hoje, e não é esquecimento.
  // O schema não tem registro EXPLÍCITO de ausência em fonte nenhuma — não
  // existe "declaro que não comi". Marcar zero_confirmado sem esse registro
  // seria transformar lacuna em fato, que é o defeito que este recibo existe
  // para impedir. O estado fica disponível para quando o schema o suportar.
  const receipt = buildContextReceipt(userId, {
    glicemia: {
      count: gl.length,
      summary: gl.length ? `última ${gl[0].value_mg_dl} mg/dL` : null,
      window: janela(new Date(Date.now() - 14 * 86_400_000).toISOString()),
    },
    alimentacao: {
      count: meals.length,
      summary: meals.length ? `${meals.length} refeição(ões) hoje` : null,
      window: janela(startOfDay),
      divergence: divergenciaAlimentacao({
        spikeMeals: spikes.length,
        glucoseReadingsAfterSpike: history.length,
      }),
    },
    exercicio: {
      count: ex.length,
      summary: ex.length ? `${ex.length} sessão(ões), ${minutosDeExercicio} min` : null,
      window: janela(twoDaysAgo),
      divergence: divergenciaExercicio({
        sessions: ex.length,
        totalMinutes: minutosDeExercicio,
      }),
    },
    medicacao: {
      count: meds.length + suplementos.length,
      summary: `${meds.length} med, ${suplementos.length} suplemento(s)`,
      window: janela(sevenDaysAgo),
      divergence: divergenciaMedicacao({ orphanLogs: orfasRes.count ?? 0 }),
    },
    insulina: {
      count: ins.length,
      summary: ins.length ? `${ins.length} registro(s) em 48h` : null,
      window: janela(twoDaysAgo),
      divergence: divergenciaInsulina({ kindOther: insulinaOutraRes.count ?? 0 }),
    },
    sono: {
      count: sleepByDate.size,
      summary: sleepByDate.size ? `${sleepByDate.size} noite(s) com registro` : null,
      window: janela(new Date(`${fiveDaysAgoDate}T00:00:00Z`).toISOString()),
    },
    alertas_48h: {
      count: alerts.length,
      summary: alerts.length ? `${alerts.length} alerta(s)` : null,
      window: janela(twoDaysAgo),
    },
    mapa_risco: {
      count: audit ? 1 : 0,
      summary: audit ? `score ${audit.score}/100` : null,
      window: janela(sevenDaysAgo),
    },
  });

  const comRecibo = `${renderContextReceipt(receipt)}\n\n${resumo}`;

  if (!suplementos.length) return comRecibo;

  try {
    const verdict = await checkSubstanceSafety(supabase, userId, suplementos);
    return `${comRecibo}\n\n${renderVerdictBlock(verdict)}`;
  } catch {
    // Falha na checagem não pode derrubar o contexto inteiro. Mas também não
    // pode virar silêncio: sem o bloco, o SYSTEM manda o modelo dizer que a
    // checagem não foi executada, em vez de opinar sobre risco.
    return comRecibo;
  }
}
