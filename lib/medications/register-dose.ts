import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey } from "@/lib/time/local-day";
import { doseWindows } from "./adherence";
import {
  DEFAULT_GRACE_MINUTES,
  resolveAdherenceStatus,
  type AdherenceResult,
  type TimingStrictness,
} from "./adherence-status";

/**
 * Registro de dose — uma regra para a tela e para a notificação.
 *
 * Três operações que NÃO se confundem (D14/P45, 15/10/2026):
 *
 *   1. REENVIO da mesma ação — duplo toque, retry da rede, formulário enviado
 *      duas vezes. Identificado pelo `pedido` (UUID gerado quando a tela ou a
 *      notificação aparece), nunca pelo horário. Não cria outra linha: devolve
 *      `reenvio`.
 *   2. CORREÇÃO de uma tomada já registrada — a pessoa diz que aquela tomada foi
 *      em outro horário. Altera a linha; o banco guarda o valor anterior em
 *      `correcoes` (gatilho `medication_logs_protege_historico`), então nada se
 *      perde.
 *   3. OUTRA TOMADA — a pessoa diz que tomou de novo. Vira linha nova com rótulo
 *      `adicional`, sem dose prevista: aparece como tomada a mais e não conta
 *      duas vezes na adesão da janela.
 *
 * Horário diferente NÃO basta para decidir entre 2 e 3. Quando já existe tomada
 * confirmada na mesma dose prevista e o pedido não diz o que fazer, a resposta
 * é `conflito`, explícita: quem registra decide. Até 14/10 o lote 1 descartava
 * esse segundo registro em silêncio (P45).
 *
 * O app continua não recusando registro: atrasado, fora da janela e item sem
 * horário são gravados como sempre.
 *
 * Banco anterior à migration `20261015101000` (implantação: código antes da
 * migration): sem as colunas novas, o pedido não é guardado e a correção fica
 * INDISPONÍVEL — corrigir sem o histórico apagaria o valor original.
 */

export type Intencao = "corrigir" | "outra";

/** Mensagens fixas, com código: voltam para a tela pela URL sem texto livre. */
export const MENSAGENS_REGISTRO = {
  sem_alvo: "Qual tomada corrigir?",
  tomada_nao_encontrada: "Tomada não encontrada.",
  medicamento_nao_encontrado: "Medicamento não encontrado.",
  correcao_indisponivel:
    "A correção de horário ainda não está disponível. Se foi outra tomada, registre como outra tomada.",
  outra_na_dose_nova:
    "Já existe outra tomada registrada para a dose desse novo horário. Corrija aquela ou registre como outra tomada.",
  falha_correcao: "Não foi possível corrigir o registro.",
  falha_gravacao: "Não foi possível gravar o registro.",
  acao_ja_resolvida:
    "Esta ação já foi resolvida antes (como correção ou como outra tomada). Nada novo foi gravado.",
} as const;
export type CodigoRegistro = keyof typeof MENSAGENS_REGISTRO;
export const codigoDoErroDeRegistro = (msg: string): CodigoRegistro | null =>
  (Object.entries(MENSAGENS_REGISTRO).find(([, m]) => m === msg)?.[0] as CodigoRegistro | undefined) ?? null;

export type EntradaRegistro = {
  medicationId: string;
  confirmed: boolean;
  /** Quando a dose aconteceu, se informado. Padrão: agora. */
  takenAt?: Date | null;
  /**
   * Qual dose a notificação anunciou (ISO UTC). Sem isto, tocar às 21:00 no
   * alarme das 08:00 casaria com a dose das 20:00. Só é aceito se for um
   * horário previsto real do item naquele dia.
   */
  doseInformada?: string | null;
  /** Identidade da AÇÃO (UUID). Reenvio com o mesmo pedido não cria outra tomada. */
  pedido?: string | null;
  /** Resposta da pessoa a um conflito. Ausente = ainda não decidiu. */
  intencao?: Intencao | null;
  /** Tomada a corrigir (obrigatória com `intencao: "corrigir"`). */
  alvoId?: string | null;
};

export type TomadaExistente = { id: string; takenAt: string };

export type ResultadoRegistro =
  | { ok: true; resultado: "registrado" | "reenvio" | "corrigido" | "adicional" }
  | {
      ok: false;
      conflito: { existentes: TomadaExistente[]; scheduledFor: string; takenAtPedido: string };
    }
  | { ok: false; erro: string; status: 400 | 404 | 409 | 500 };

type MedParaRegistro = {
  id: string;
  reminder_times: string[] | null;
  timing_strictness: TimingStrictness | null;
  grace_minutes: number | null;
};

export type ErroBanco = { code?: string; message?: string; details?: string | null; hint?: string | null } | null;

/**
 * Qual restrição o banco recusou. O PostgREST devolve `code` (SQLSTATE do Postgres),
 * `message`, `details` e `hint` — não há campo com o nome da restrição. O
 * identificador estável que existe é o NOME da restrição, que nós definimos e o
 * Postgres põe entre aspas na `message`; a lista de colunas em `details`
 * ("Key (…)=") confirma. Só conta com o código certo E o nome (ou as colunas)
 * certos: outra violação nunca vira conflito de dose.
 */
const RESTRICOES = {
  pedido: { codigo: "23505", nome: "medication_logs_pedido_unico", colunas: "(user_id, client_request_id)" },
  dose: { codigo: "23505", nome: "medication_logs_dose_confirmada_unica", colunas: "(user_id, medication_id, scheduled_for)" },
  rotulo: { codigo: "23514", nome: "medication_logs_adherence_status_check", colunas: null },
} as const;
export type Restricao = keyof typeof RESTRICOES;

export function restricaoViolada(erro: ErroBanco): Restricao | null {
  if (!erro?.code) return null;
  for (const [chave, r] of Object.entries(RESTRICOES) as [Restricao, (typeof RESTRICOES)[Restricao]][]) {
    if (erro.code !== r.codigo) continue;
    if ((erro.message ?? "").includes(`"${r.nome}"`)) return chave;
    if (r.colunas && (erro.details ?? "").startsWith(`Key ${r.colunas}=`)) return chave;
  }
  return null;
}

/** O banco ainda não tem a coluna (migration não aplicada): PostgREST 204 ou Postgres 42703. */
export function colunaInexistente(erro: ErroBanco, coluna: string): boolean {
  if (!erro) return false;
  const texto = `${erro.message ?? ""} ${erro.details ?? ""}`;
  return (erro.code === "PGRST204" || erro.code === "42703") && texto.includes(coluna);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const pedidoValido = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A dose informada é um horário previsto do item no dia dela? Se sim, rotula contra ela. */
export function resolverComDoseInformada(
  med: MedParaRegistro,
  takenAt: Date,
  timeZone: string,
  doseInformada: string | null | undefined
): AdherenceResult | null {
  if (!doseInformada) return null;
  const prevista = new Date(doseInformada);
  if (Number.isNaN(prevista.getTime())) return null;
  const strictness = med.timing_strictness ?? "flexivel";
  if (strictness === "livre") return null;

  const horarios = (med.reminder_times ?? []).filter((t) => /^\d{1,2}:\d{2}$/.test(t.trim()));
  const [y, mo, d] = localDateKey(prevista.toISOString(), timeZone).split("-").map(Number);
  const existe = doseWindows(horarios, y, mo, d, timeZone).some(
    (w) => w.scheduledUTC.getTime() === prevista.getTime()
  );
  if (!existe) return null;

  const tolerancia = (med.grace_minutes ?? DEFAULT_GRACE_MINUTES[strictness] ?? 0) * 60_000;
  const distancia = Math.abs(takenAt.getTime() - prevista.getTime());
  return { status: distancia <= tolerancia ? "no_horario" : "atrasado", scheduledFor: prevista };
}

/** Tomadas confirmadas que já ocupam a dose prevista (exceto a própria, na correção). */
async function tomadasNaDose(
  supabase: SupabaseClient,
  userId: string,
  medicationId: string,
  scheduledFor: Date,
  exceto?: string
): Promise<TomadaExistente[]> {
  const { data } = await supabase
    .from("medication_logs")
    .select("id, taken_at")
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .eq("scheduled_for", scheduledFor.toISOString())
    .eq("confirmed", true)
    .order("taken_at", { ascending: true })
    .limit(10);
  return ((data ?? []) as { id: string; taken_at: string }[])
    .filter((l) => l.id !== exceto)
    .map((l) => ({ id: l.id, takenAt: l.taken_at }));
}

export async function registrarDose(
  supabase: SupabaseClient,
  userId: string,
  entrada: EntradaRegistro
): Promise<ResultadoRegistro> {
  const takenAt = entrada.takenAt ?? new Date();
  const pedido = pedidoValido(entrada.pedido) ? entrada.pedido : null;
  let rotulo: AdherenceResult = { status: "avulso", scheduledFor: null };

  const [medRes, profileRes] = await Promise.all([
    supabase
      .from("medications")
      .select("id, reminder_times, timing_strictness, grace_minutes")
      .eq("id", entrada.medicationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
  ]);

  if (!medRes.error && !medRes.data) {
    return { ok: false, erro: MENSAGENS_REGISTRO.medicamento_nao_encontrado, status: 404 };
  }

  // Falha ao LER o medicamento não impede o registro: segue como avulso, como
  // sempre foi — o registro importa mais que o rótulo dele.
  if (medRes.data) {
    const med = medRes.data as MedParaRegistro;
    const tz = (profileRes.data?.timezone as string | null) || "America/Sao_Paulo";
    rotulo =
      resolverComDoseInformada(med, takenAt, tz, entrada.doseInformada) ??
      resolveAdherenceStatus({
        reminderTimes: med.reminder_times,
        strictness: med.timing_strictness ?? "flexivel",
        graceMinutes: med.grace_minutes,
        takenAt,
        timeZone: tz,
      });
  }

  // 1. O pedido já foi usado? Um pedido é UMA ação: criou uma linha (registro ou
  //    outra tomada) OU corrigiu uma. Repetir a mesma ação é reenvio; usar o mesmo
  //    pedido para a OUTRA decisão (voltar à pergunta e escolher a outra opção) é
  //    recusado com motivo — senão as duas coisas aconteceriam.
  let bancoComPedido = true;
  if (pedido) {
    const { data: criou, error } = await supabase
      .from("medication_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("client_request_id", pedido)
      .limit(1)
      .maybeSingle();
    if (colunaInexistente(error as ErroBanco, "client_request_id")) bancoComPedido = false;
    else if (criou) {
      return entrada.intencao === "corrigir"
        ? { ok: false, erro: MENSAGENS_REGISTRO.acao_ja_resolvida, status: 409 }
        : { ok: true, resultado: "reenvio" };
    }
    if (bancoComPedido) {
      const { data: corrigiu } = await supabase
        .from("medication_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("correcao_pedido", pedido)
        .limit(1)
        .maybeSingle();
      if (corrigiu) {
        return entrada.intencao === "corrigir" && (corrigiu as { id: string }).id === entrada.alvoId
          ? { ok: true, resultado: "reenvio" }
          : { ok: false, erro: MENSAGENS_REGISTRO.acao_ja_resolvida, status: 409 };
      }
    }
  }

  // 2. CORREÇÃO de uma tomada existente.
  if (entrada.intencao === "corrigir") {
    if (!entrada.alvoId) return { ok: false, erro: MENSAGENS_REGISTRO.sem_alvo, status: 400 };
    const { data: alvo, error: erroAlvo } = await supabase
      .from("medication_logs")
      .select("id, taken_at, correcao_pedido")
      .eq("id", entrada.alvoId)
      .eq("user_id", userId)
      .eq("medication_id", entrada.medicationId)
      .eq("confirmed", true)
      .maybeSingle();
    if (colunaInexistente(erroAlvo as ErroBanco, "correcao_pedido")) {
      return { ok: false, erro: MENSAGENS_REGISTRO.correcao_indisponivel, status: 409 };
    }
    if (!alvo) return { ok: false, erro: MENSAGENS_REGISTRO.tomada_nao_encontrada, status: 404 };
    if (entrada.confirmed && rotulo.scheduledFor) {
      const outras = await tomadasNaDose(supabase, userId, entrada.medicationId, rotulo.scheduledFor, entrada.alvoId);
      if (outras.length) {
        return { ok: false, erro: MENSAGENS_REGISTRO.outra_na_dose_nova, status: 409 };
      }
    }
    const { error } = await supabase
      .from("medication_logs")
      .update({
        taken_at: takenAt.toISOString(),
        scheduled_for: rotulo.scheduledFor?.toISOString() ?? null,
        adherence_status: rotulo.status,
        correcao_pedido: pedido,
      })
      .eq("id", entrada.alvoId)
      .eq("user_id", userId);
    if (colunaInexistente(error as ErroBanco, "correcao_pedido")) {
      return { ok: false, erro: MENSAGENS_REGISTRO.correcao_indisponivel, status: 409 };
    }
    if (error) return { ok: false, erro: MENSAGENS_REGISTRO.falha_correcao, status: 500 };
    return { ok: true, resultado: "corrigido" };
  }

  // 3. Conflito: já existe tomada na mesma dose prevista e ninguém disse o que fazer.
  const outraTomada = entrada.intencao === "outra";
  if (entrada.confirmed && rotulo.scheduledFor && !outraTomada) {
    const existentes = await tomadasNaDose(supabase, userId, entrada.medicationId, rotulo.scheduledFor);
    if (existentes.length) {
      return {
        ok: false,
        conflito: { existentes, scheduledFor: rotulo.scheduledFor.toISOString(), takenAtPedido: takenAt.toISOString() },
      };
    }
  }

  // "Pulei hoje" é sempre fora_janela: preserva a diferença entre "não tomei" e
  // "não registrei". Outra tomada não ocupa a dose prevista: é a mais.
  const linha: Record<string, unknown> = {
    user_id: userId,
    medication_id: entrada.medicationId,
    confirmed: entrada.confirmed,
    taken_at: takenAt.toISOString(),
    scheduled_for: outraTomada ? null : rotulo.scheduledFor?.toISOString() ?? null,
    adherence_status: !entrada.confirmed ? "fora_janela" : outraTomada ? "adicional" : rotulo.status,
  };
  if (pedido && bancoComPedido) linha.client_request_id = pedido;

  let { error } = await supabase.from("medication_logs").insert(linha);
  if (colunaInexistente(error as ErroBanco, "client_request_id")) {
    delete linha.client_request_id;
    ({ error } = await supabase.from("medication_logs").insert(linha));
  }
  // Banco anterior à migration não aceita o rótulo `adicional`: grava a tomada
  // (sem dose prevista, então ela continua a mais) com o rótulo antigo.
  if (outraTomada && restricaoViolada(error as ErroBanco) === "rotulo") {
    linha.adherence_status = "fora_janela";
    ({ error } = await supabase.from("medication_logs").insert(linha));
  }

  if (error) {
    const violada = restricaoViolada(error as ErroBanco);
    // Corrida da MESMA ação: o outro pedido idêntico gravou primeiro.
    if (violada === "pedido") return { ok: true, resultado: "reenvio" };
    // Corrida de AÇÕES diferentes na mesma dose: vira conflito explícito.
    // Qualquer OUTRA violação é falha genérica — nunca "conflito de dose".
    if (violada === "dose") {
      if (rotulo.scheduledFor) {
        const existentes = await tomadasNaDose(supabase, userId, entrada.medicationId, rotulo.scheduledFor);
        return {
          ok: false,
          conflito: { existentes, scheduledFor: rotulo.scheduledFor.toISOString(), takenAtPedido: takenAt.toISOString() },
        };
      }
    }
    return { ok: false, erro: MENSAGENS_REGISTRO.falha_gravacao, status: 500 };
  }
  return { ok: true, resultado: outraTomada ? "adicional" : "registrado" };
}
