"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uploadPrivatePhoto } from "@/lib/storage/upload-private-photo";
import { namesLookSimilar } from "@/lib/medications/similar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey, wallClockToUTC } from "@/lib/time/local-day";
import { publicDbError } from "@/lib/errors/public-error";
import {
  MENSAGENS_CADENCIA,
  cadenciaDoFormulario,
  configuracaoInconsistente,
  programacaoDoFormulario,
} from "@/lib/medications/cadence";
import {
  colunaInexistente,
  pedidoValido,
  registrarDose,
  type ErroBanco,
  type Intencao,
} from "@/lib/medications/register-dose";
import { doseDoPulo } from "@/lib/medications/pulo";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LABEL_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

function uploadLabelPhoto(
  supabase: SupabaseClient,
  userId: string,
  file: FormDataEntryValue | null
): Promise<string | null> {
  return uploadPrivatePhoto(supabase, "medication-labels", userId, file, LABEL_PHOTO_MAX_BYTES);
}

const medSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().optional(),
  schedule_hint: z.string().optional(),
  reminder_times: z.array(z.string().regex(TIME_RE)).optional(),
  kind: z.enum(["med", "supplement"]).default("med"),
});

/**
 * Compõe a dosagem a partir de quantidade + unidade do formulário (ex.: 10 +
 * "U" → "10 U"; 30 + "g" → "30 g") — cobre insulina em unidades, whey e
 * creatina em gramas/scoop, além de comprimidos. Sem quantidade, vale o
 * texto livre.
 */
function composeDosage(formData: FormData): string | undefined {
  const amountRaw = String(formData.get("dose_amount") ?? "").trim().replace(",", ".");
  const unit = String(formData.get("dose_unit") ?? "").trim();
  const free = String(formData.get("dosage") ?? "").trim();
  const amount = Number(amountRaw);
  if (amountRaw && Number.isFinite(amount) && amount > 0 && unit) {
    const num = Number.isInteger(amount) ? String(amount) : String(amount).replace(".", ",");
    return `${num} ${unit}`;
  }
  return free || undefined;
}

// "08:00, 20h30, 7:5, 08:00" → ["08:00", "20:30"] (inválidos e repetidos são descartados)
function parseReminderTimes(input: string): string[] {
  const times = input
    .split(/[,;]/)
    .map((t) => t.trim().replace("h", ":").replace(/^(\d):/, "0$1:"))
    .filter((t) => TIME_RE.test(t));
  return [...new Set(times)];
}

export type ActionResult = { ok?: true; error?: string };

function cadenciaDoFormularioData(formData: FormData, temHorario: boolean, modo: "cadastro" | "edicao") {
  return cadenciaDoFormulario(
    {
      cadence: formData.get("cadence") as string | null,
      cadence_weekday: formData.get("cadence_weekday") as string | null,
      cadence_interval_days: formData.get("cadence_interval_days") as string | null,
      cadence_anchor_on: formData.get("cadence_anchor_on") as string | null,
    },
    temHorario,
    modo
  );
}

const CONFIRMADA = "cadence_confirmed_at";

/**
 * Grava em `medications`; se o banco ainda não tem `cadence_confirmed_at`
 * (antes da migration 20261015103000), grava de novo sem ela. A frequência
 * escolhida é salva do mesmo jeito; só a marca de confirmação fica para
 * depois — e, sem a coluna, o aviso "a confirmar" também não aparece.
 */
async function gravarMedicamento(
  linha: Record<string, unknown>,
  gravar: (l: Record<string, unknown>) => PromiseLike<{ error: ErroBanco | null }>
): Promise<{ error: ErroBanco | null }> {
  const r = await gravar(linha);
  if (CONFIRMADA in linha && colunaInexistente(r.error, CONFIRMADA)) {
    const semConfirmacao = { ...linha };
    delete semConfirmacao[CONFIRMADA];
    return gravar(semConfirmacao);
  }
  return r;
}

export async function addMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const timesRaw = String(formData.get("reminder_times") ?? "").trim();
  const reminderTimes = timesRaw ? parseReminderTimes(timesRaw) : [];

  const parsed = medSchema.safeParse({
    name: formData.get("name"),
    dosage: composeDosage(formData),
    schedule_hint: formData.get("schedule_hint") || undefined,
    reminder_times: reminderTimes.length ? reminderTimes : undefined,
    kind: formData.get("kind") === "supplement" ? "supplement" : "med",
  });
  if (!parsed.success) return { error: "Nome do medicamento é obrigatório." };

  // D1: com horário, a frequência é escolha explícita — o app não presume mais
  // "todo dia" (até 15/10 gravava 'diaria' quando o campo vinha vazio).
  const cadencia = cadenciaDoFormularioData(formData, reminderTimes.length > 0, "cadastro");
  if (!cadencia.ok) return { error: cadencia.erro };

  const stockRaw = Number.parseInt(String(formData.get("stock_units") ?? ""), 10);
  const stock =
    Number.isFinite(stockRaw) && stockRaw > 0 && stockRaw <= 100000
      ? {
          stock_units: stockRaw,
          stock_updated_on: new Date().toISOString().slice(0, 10),
        }
      : {};

  const labelPhotoPath = await uploadLabelPhoto(supabase, user.id, formData.get("label_photo"));

  const { error } = await gravarMedicamento(
    {
      user_id: user.id,
      ...parsed.data,
      ...(cadencia.colunas ?? {}),
      ...(cadencia.explicita ? { [CONFIRMADA]: new Date().toISOString() } : {}),
      ...stock,
      ...(labelPhotoPath ? { label_photo_path: labelPhotoPath } : {}),
    },
    (l) => supabase.from("medications").insert(l)
  );

  if (error) return { error: publicDbError(error, "actions/medications") };

  revalidatePath("/medicacao");
  return { ok: true };
}

export type SimilarMedication = {
  id: string;
  name: string;
  dosage: string | null;
  stock_units: number | null;
};

/**
 * Checa se já existe um item ativo com nome parecido — usado no cadastro por
 * foto pra avisar antes de criar duplicata (ex.: fotografar a 2ª/3ª caneta
 * de um remédio que já está cadastrado, em vez de atualizar o estoque dele).
 */
export async function findSimilarActiveMedications(name: string): Promise<SimilarMedication[]> {
  const supabase = await createClient();
  if (!supabase || !name.trim()) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("medications")
    .select("id, name, dosage, stock_units")
    .eq("user_id", user.id)
    .eq("active", true);

  return (data ?? []).filter((m) => namesLookSimilar(name, m.name));
}

export async function attachMedicationLabel(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const path = await uploadLabelPhoto(supabase, user.id, formData.get("label_photo"));
  if (!path) return { error: "Selecione uma foto (JPEG/PNG/WebP, até 4 MB)." };

  // Remove a foto anterior, se houver, antes de trocar a referência.
  const { data: current } = await supabase
    .from("medications")
    .select("label_photo_path")
    .eq("id", medicationId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("medications")
    .update({ label_photo_path: path })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: publicDbError(error, "actions/medications") };

  if (current?.label_photo_path) {
    await supabase.storage.from("medication-labels").remove([current.label_photo_path]);
  }

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function removeMedicationLabel(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { data: current } = await supabase
    .from("medications")
    .select("label_photo_path")
    .eq("id", medicationId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("medications")
    .update({ label_photo_path: null })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: publicDbError(error, "actions/medications") };

  if (current?.label_photo_path) {
    await supabase.storage.from("medication-labels").remove([current.label_photo_path]);
  }

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function updateMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const timesRaw = String(formData.get("reminder_times") ?? "").trim();
  const reminderTimes = timesRaw ? parseReminderTimes(timesRaw) : [];

  const parsed = medSchema.safeParse({
    name: formData.get("name"),
    dosage: formData.get("dosage") || undefined,
    schedule_hint: formData.get("schedule_hint") || undefined,
    reminder_times: reminderTimes,
    kind: formData.get("kind") === "supplement" ? "supplement" : "med",
  });
  if (!parsed.success) return { error: "Nome do medicamento é obrigatório." };

  // D1: vazio na edição não mexe na frequência nem conta como confirmação.
  const cadencia = cadenciaDoFormularioData(formData, reminderTimes.length > 0, "edicao");
  if (!cadencia.ok) return { error: cadencia.erro };

  // D3: item "livre" com horário só ganha alarme com programação E frequência
  // escolhidas explicitamente no mesmo envio.
  const programacao = programacaoDoFormulario(formData.get("timing_strictness") as string | null);
  if (!programacao.ok) return { error: programacao.erro };
  if (programacao.rigidez && !cadencia.explicita) {
    return { error: MENSAGENS_CADENCIA.programacao_sem_frequencia };
  }

  const { error } = await gravarMedicamento(
    {
      name: parsed.data.name,
      dosage: parsed.data.dosage ?? null,
      schedule_hint: parsed.data.schedule_hint ?? null,
      reminder_times: reminderTimes.length ? reminderTimes : null,
      kind: parsed.data.kind,
      ...(cadencia.colunas ?? {}),
      ...(cadencia.explicita ? { [CONFIRMADA]: new Date().toISOString() } : {}),
      ...(programacao.rigidez ? { timing_strictness: programacao.rigidez } : {}),
    },
    (l) => supabase.from("medications").update(l).eq("id", medicationId).eq("user_id", user.id)
  );

  if (error) return { error: publicDbError(error, "actions/medications") };

  revalidatePath("/medicacao");
  return { ok: true };
}

/**
 * D1: confirmação EXPLÍCITA da frequência atual de um item antigo ("Está certo:
 * todo dia"). Não muda horário nem frequência — só registra que a pessoa
 * confirmou. Frequência nunca declarada, confirmada como "todo dia", passa a
 * constar como 'diaria', que é o que o alarme já fazia. Item "livre" com
 * horário (D3) não se confirma por aqui: precisa escolher a programação.
 */
export async function confirmarFrequencia(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { data: med } = await supabase
    .from("medications")
    .select("*")
    .eq("id", medicationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!med) return { error: "Medicamento inválido." };
  if (!(CONFIRMADA in med)) return { error: MENSAGENS_CADENCIA.confirmacao_indisponivel };
  if (configuracaoInconsistente(med)) return { error: MENSAGENS_CADENCIA.programacao_sem_frequencia };

  const { error } = await supabase
    .from("medications")
    .update({ [CONFIRMADA]: new Date().toISOString(), ...(med.cadence ? {} : { cadence: "diaria" }) })
    .eq("id", medicationId)
    .eq("user_id", user.id);
  if (error) return { error: "Falha ao salvar." };

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function updateMedicationStock(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  const stock = Number.parseInt(String(formData.get("stock_units") ?? ""), 10);
  if (!medicationId || !Number.isFinite(stock) || stock < 0 || stock > 100000) {
    return { error: "Informe a quantidade em estoque." };
  }

  const { error } = await supabase
    .from("medications")
    .update({
      stock_units: stock,
      stock_updated_on: new Date().toISOString().slice(0, 10),
    })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: publicDbError(error, "actions/medications") };

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function deactivateMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { error } = await supabase
    .from("medications")
    .update({ active: false })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: publicDbError(error, "actions/medications") };

  revalidatePath("/medicacao");
  return { ok: true };
}

/**
 * Grava um registro de dose.
 *
 * O APP NUNCA RECUSA REGISTRO. Não há, e não pode passar a haver, nenhuma
 * validação de horário aqui: recusar registro atrasado não melhora adesão,
 * apaga o dado. O usuário toma o item de qualquer forma, e o banco passa a
 * afirmar que ele não tomou — histórico falso que alimenta o checador de
 * interação, o contador de mecanismos e o relatório do médico.
 *
 * `adherence_status` é derivado e gravado junto, como RÓTULO. Falha ao derivar
 * não impede a gravação: o registro entra como avulso, porque perder o dado
 * seria pior que perder a classificação dele.
 */
/**
 * Resultado do registro pela tela. `conflito` NÃO é erro: já existe tomada na
 * mesma dose prevista e a pessoa precisa dizer se está corrigindo aquela ou
 * registrando outra (D14/P45). A página leva para a pergunta em /medicacao.
 */
export type ResultadoRegistroTela = ActionResult & {
  conflito?: { medicationId: string; scheduledFor: string; takenAtPedido: string; pedido: string | null };
};

type OpcoesRegistro = {
  pedido?: string | null;
  intencao?: Intencao | null;
  alvoId?: string | null;
  /** Dose prevista a que o registro se refere (ISO UTC), quando a tela a sabe. */
  doseInformada?: string | null;
};

async function inserirRegistroDeDose(
  medicationId: string,
  confirmed: boolean,
  /**
   * Hora em que a dose REALMENTE aconteceu, quando quem registra a informa.
   *
   * Sem isto, `taken_at` é a hora do CLIQUE — e o clique acontece quando dá,
   * não quando a dose foi tomada. Medido em 06/09: quatro registros de Fiasp
   * entre 12:00 e 12:06, marcados em rajada. Isso condena qualquer cruzamento
   * dose × glicemia, que é justamente o que responderia "a basal das 07:00
   * está segurando minha madrugada?".
   *
   * Nulo mantém o comportamento antigo: registrar rápido continua sendo um
   * toque só, e o app não passa a exigir precisão que ninguém tem sempre.
   */
  takenAtInformado?: Date | null,
  opcoes: OpcoesRegistro = {}
): Promise<ResultadoRegistroTela> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  // Regra única com a notificação (`lib/medications/register-dose.ts`):
  // rótulo de adesão, dose prevista e idempotência da mesma dose.
  const r = await registrarDose(supabase, user.id, {
    medicationId,
    confirmed,
    takenAt: takenAtInformado ?? null,
    doseInformada: opcoes.doseInformada ?? null,
    pedido: opcoes.pedido ?? null,
    intencao: opcoes.intencao ?? null,
    alvoId: opcoes.alvoId ?? null,
  });
  if (!r.ok && "conflito" in r) {
    return {
      conflito: {
        medicationId,
        scheduledFor: r.conflito.scheduledFor,
        takenAtPedido: r.conflito.takenAtPedido,
        pedido: opcoes.pedido ?? null,
      },
    };
  }
  if (!r.ok) return { error: r.erro };

  revalidatePath("/medicacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Instante ISO vindo da pergunta de conflito: só passado, nunca futuro. */
function instanteInformado(valor: FormDataEntryValue | null): Date | null {
  if (typeof valor !== "string" || !valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 60_000) return null;
  return d;
}

function opcoesDoFormulario(formData: FormData): OpcoesRegistro {
  const intencao = formData.get("intencao");
  const alvo = formData.get("alvo_id");
  return {
    pedido: pedidoValido(formData.get("pedido")) ? (formData.get("pedido") as string) : null,
    intencao: intencao === "corrigir" || intencao === "outra" ? intencao : null,
    alvoId: typeof alvo === "string" && alvo ? alvo : null,
  };
}

/**
 * "HH:MM" do dia local → instante UTC, ou null.
 *
 * Hora no futuro é rejeitada (volta null, não erro): registrar às 14:00 que
 * tomou às 22:00 é engano de digitação, e gravar produziria uma dose que ainda
 * não aconteceu. Dose de ontem registrada hoje continua sendo caso do campo
 * de data, que não existe — aqui o dia é sempre o de hoje.
 */
async function horaInformadaParaUTC(valor: FormDataEntryValue | null): Promise<Date | null> {
  const texto = typeof valor === "string" ? valor.trim() : "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;

  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const tz = p?.timezone || "America/Sao_Paulo";
  const agora = new Date();
  const [y, mo, d] = localDateKey(agora.toISOString(), tz).split("-").map(Number);
  const quando = wallClockToUTC(y, mo, d, h, mi, 0, tz);
  return quando.getTime() > agora.getTime() ? null : quando;
}

export async function logMedicationTaken(formData: FormData): Promise<ResultadoRegistroTela> {
  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  // Campo opcional "tomei às", em HH:MM do dia local. Ausente ou inválido, o
  // registro segue com a hora do clique — o app NUNCA recusa um registro por
  // causa do formato de um campo acessório. Na resposta a um conflito, vem o
  // instante exato do pedido original (`taken_at_iso`).
  const informado =
    instanteInformado(formData.get("taken_at_iso")) ??
    (await horaInformadaParaUTC(formData.get("taken_at_local")));
  return inserirRegistroDeDose(medicationId, true, informado, opcoesDoFormulario(formData));
}

/**
 * "Pulei hoje" — ação distinta de adiar e de registrar.
 *
 * Grava `confirmed = false`. Dose pulada e dose não registrada são coisas
 * diferentes: a primeira é informação, a segunda é lacuna, e contá-las juntas
 * é o que faz o relatório do médico mentir nas duas direções.
 */
export async function logMedicationSkipped(formData: FormData): Promise<ActionResult> {
  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };
  // Dose pulada = a dose prevista da linha, não a hora do clique (lib/medications/pulo.ts).
  const dose = doseDoPulo(formData.get("scheduled_for"));
  return inserirRegistroDeDose(medicationId, false, dose, {
    pedido: opcoesDoFormulario(formData).pedido,
    doseInformada: dose ? dose.toISOString() : null,
  });
}
