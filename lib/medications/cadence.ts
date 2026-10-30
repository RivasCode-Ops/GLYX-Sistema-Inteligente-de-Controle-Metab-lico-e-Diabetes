import { localDateKey, wallClockToUTC } from "@/lib/time/local-day";

/**
 * Cadência do medicamento: EM QUE DIAS ele é tomado.
 *
 * `reminder_times` diz a que horas; a cadência diz em que dias. Até 14/10/2026
 * nenhum código de produção lia `medications.cadence`: o alarme tocava todo dia
 * e "Doses de hoje" listava todo dia, e um remédio semanal aparecia atrasado
 * seis dias por semana. Esta é a regra única do lado TypeScript; a do banco é
 * `public.med_alarm_is_dose_day` (migration 20261015103000), e as duas são
 * presas aos mesmos casos em `cadence-casos.json`.
 *
 * Decisões D1–D3, aprovadas em 15/10/2026 (docs/DECISOES-D1-D4.md):
 *   D1 — o alarme dos itens antigos continua como sempre: cadência NULA (ou pela
 *        metade) com horário vale como diária. Mas o app não presume mais: em
 *        cadastro novo com horário a frequência é escolha explícita, e
 *        `cadence_confirmed_at` separa a escolhida da presumida — nula mostra
 *        "frequência a confirmar" até a pessoa confirmar. Nada aqui muda
 *        horário ou frequência de item antigo sozinho.
 *   D2 — intervalo conta da data de início escolhida e não dispara antes dela;
 *        início no futuro aparece como aviso.
 *   D3 — rigidez 'livre' não recebe alarme, mesmo com horário. Livre COM
 *        horário é configuração inconsistente: o app mostra, e o alarme só é
 *        ativado com escolha explícita de frequência e programação.
 */

export type CamposDeCadencia = {
  cadence?: string | null;
  cadence_weekday?: number | null;
  cadence_interval_days?: number | null;
  cadence_anchor_on?: string | null;
  timing_strictness?: string | null;
};

export type Cadencia =
  | { tipo: "diaria" }
  /** 0 = domingo … 6 = sábado, igual a `extract(dow)` e `getUTCDay()`. */
  | { tipo: "semanal"; diaDaSemana: number }
  /** A cada `dias` dias a partir de `ancora` (YYYY-MM-DD), inclusive. */
  | { tipo: "intervalo"; dias: number; ancora: string };

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Lê a cadência das colunas. Devolve null quando não há cadência declarada —
 * ou quando ela está pela metade, o que os CHECKs do banco impedem, mas um
 * dado incompleto não deve virar "nunca" por acidente: cai na regra D1.
 */
export function lerCadencia(m: CamposDeCadencia): Cadencia | null {
  switch (m.cadence) {
    case "diaria":
      return { tipo: "diaria" };
    case "semanal": {
      const d = m.cadence_weekday;
      return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6
        ? { tipo: "semanal", diaDaSemana: d }
        : null;
    }
    case "intervalo": {
      const n = m.cadence_interval_days;
      const a = m.cadence_anchor_on;
      return typeof n === "number" && Number.isInteger(n) && n >= 2 && n <= 90 && a && DATA_RE.test(a)
        ? { tipo: "intervalo", dias: n, ancora: a }
        : null;
    }
    default:
      return null;
  }
}

function diaUTC(dataLocal: string): number {
  const [y, m, d] = dataLocal.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Dia da semana de uma data de calendário, sem fuso envolvido. */
export function diaDaSemana(dataLocal: string): number {
  const [y, m, d] = dataLocal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** `b − a` em dias de calendário. Data − data não sofre horário de verão. */
export function diasEntre(a: string, b: string): number {
  return Math.round(diaUTC(b) - diaUTC(a));
}

/** Esta data local (YYYY-MM-DD) é dia de dose para o item? */
export function ehDiaDeDose(m: CamposDeCadencia, dataLocal: string): boolean {
  const c = lerCadencia(m);
  if (!c) return true; // D1
  switch (c.tipo) {
    case "diaria":
      return true;
    case "semanal":
      return diaDaSemana(dataLocal) === c.diaDaSemana;
    case "intervalo": {
      const delta = diasEntre(c.ancora, dataLocal);
      return delta >= 0 && delta % c.dias === 0; // D2
    }
  }
}

/**
 * Mensagens de recusa da frequência. Têm código porque voltam para a tela pela
 * URL (`?erro=semanal_sem_dia`): mostrar texto livre vindo da URL deixaria
 * qualquer link escrever frase na tela do app.
 */
export const MENSAGENS_CADENCIA = {
  semanal_sem_dia: "Escolha o dia da semana da dose semanal.",
  intervalo_invalido: "O intervalo precisa ser de 2 a 90 dias.",
  intervalo_sem_inicio: "Informe a data da primeira dose do intervalo.",
  frequencia_invalida: "Frequência inválida.",
  frequencia_obrigatoria:
    "Escolha a frequência dos alarmes: todo dia, uma vez por semana ou a cada N dias.",
  programacao_sem_frequencia: "Para ativar o alarme deste item, escolha também a frequência.",
  programacao_invalida: "Programação inválida.",
  confirmacao_indisponivel: "A confirmação da frequência ainda não está disponível. Tente mais tarde.",
} as const;
export type CodigoErroCadencia = keyof typeof MENSAGENS_CADENCIA;

export function codigoDoErroDeCadencia(mensagem: string): CodigoErroCadencia | null {
  const par = Object.entries(MENSAGENS_CADENCIA).find(([, m]) => m === mensagem);
  return par ? (par[0] as CodigoErroCadencia) : null;
}

export type CadenciaColunas = {
  cadence: "diaria" | "semanal" | "intervalo" | null;
  cadence_weekday: number | null;
  cadence_interval_days: number | null;
  cadence_anchor_on: string | null;
};

type CamposDoFormulario = {
  cadence: string | null;
  cadence_weekday?: string | null;
  cadence_interval_days?: string | null;
  cadence_anchor_on?: string | null;
};

function dataValida(s: string): boolean {
  if (!DATA_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Cadência vinda do formulário → colunas do banco, com as mesmas regras dos
 * CHECKs de `20260907150000_medication_cadence.sql` (semanal exige dia; intervalo
 * exige 2–90 dias e data de início). Cadência pela metade é recusada com frase,
 * em vez de deixar o banco recusar com nome de constraint.
 *
 * D1 (15/10/2026): o app não presume mais "todo dia".
 * - CADASTRO: com horário, a frequência é obrigatória (vazio ou campo ausente
 *   são recusados com frase); sem horário, não há alarme e fica não declarada.
 * - EDIÇÃO: vazio ou campo ausente = não mexer na frequência (e não conta como
 *   confirmação).
 * `explicita` diz se a pessoa ESCOLHEU uma frequência neste envio — só então
 * quem chama grava `cadence_confirmed_at`.
 */
export function cadenciaDoFormulario(
  campos: CamposDoFormulario,
  temHorario: boolean,
  modo: "cadastro" | "edicao"
):
  | { ok: true; colunas: CadenciaColunas | null; explicita: boolean }
  | { ok: false; erro: string } {
  const vazio: CadenciaColunas = {
    cadence: null,
    cadence_weekday: null,
    cadence_interval_days: null,
    cadence_anchor_on: null,
  };
  const tipo = (campos.cadence ?? "").trim();
  if (tipo === "") {
    if (modo === "edicao") return { ok: true, colunas: null, explicita: false };
    if (temHorario) return { ok: false, erro: MENSAGENS_CADENCIA.frequencia_obrigatoria };
    return { ok: true, colunas: vazio, explicita: false };
  }
  if (tipo === "diaria") return { ok: true, colunas: { ...vazio, cadence: "diaria" }, explicita: true };

  if (tipo === "semanal") {
    const d = Number(campos.cadence_weekday ?? "");
    if (!Number.isInteger(d) || d < 0 || d > 6 || (campos.cadence_weekday ?? "").trim() === "") {
      return { ok: false, erro: MENSAGENS_CADENCIA.semanal_sem_dia };
    }
    return { ok: true, colunas: { ...vazio, cadence: "semanal", cadence_weekday: d }, explicita: true };
  }

  if (tipo === "intervalo") {
    const n = Number(campos.cadence_interval_days ?? "");
    if (!Number.isInteger(n) || n < 2 || n > 90) {
      return { ok: false, erro: MENSAGENS_CADENCIA.intervalo_invalido };
    }
    const ancora = (campos.cadence_anchor_on ?? "").trim();
    if (!dataValida(ancora)) {
      return { ok: false, erro: MENSAGENS_CADENCIA.intervalo_sem_inicio };
    }
    return {
      ok: true,
      colunas: { ...vazio, cadence: "intervalo", cadence_interval_days: n, cadence_anchor_on: ancora },
      explicita: true,
    };
  }

  return { ok: false, erro: MENSAGENS_CADENCIA.frequencia_invalida };
}

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "diária", "semanal (quarta)", "a cada 3 dias desde 2026-10-01" ou "frequência não declarada". */
export function descreverCadencia(m: CamposDeCadencia): string {
  const c = lerCadencia(m);
  if (!c) return "frequência não declarada";
  switch (c.tipo) {
    case "diaria":
      return "diária";
    case "semanal":
      return `semanal (${DIAS_DA_SEMANA[c.diaDaSemana]})`;
    case "intervalo":
      return `a cada ${c.dias} dias desde ${c.ancora}`;
  }
}

/** O item tem alarme push? (D3) */
export function alarmeHabilitado(m: CamposDeCadencia): boolean {
  return m.timing_strictness !== "livre";
}

type ItemComHorario = CamposDeCadencia & {
  reminder_times?: readonly string[] | null;
  cadence_confirmed_at?: string | null;
};

/**
 * D3: "livre" (sem hora certa) COM horário cadastrado é configuração
 * inconsistente. Não recebe alarme; o app mostra e pede escolha explícita.
 */
export function configuracaoInconsistente(m: ItemComHorario): boolean {
  return m.timing_strictness === "livre" && horariosValidos(m.reminder_times).length > 0;
}

/**
 * D1: item com horário cuja frequência nunca foi escolhida nem confirmada.
 * `cadence_confirmed_at` AUSENTE (banco antes da migration) não conta: sem a
 * coluna não há como distinguir, e o aviso apareceria até para quem escolheu.
 */
export function frequenciaAConfirmar(m: ItemComHorario): boolean {
  return (
    m.cadence_confirmed_at === null &&
    horariosValidos(m.reminder_times).length > 0 &&
    !configuracaoInconsistente(m)
  );
}

/**
 * Frequência que a EDIÇÃO mostra já escolhida. Item a confirmar (D1) ou "livre"
 * com horário (D3) vem VAZIO: o valor gravado foi presumido, e mostrá-lo
 * selecionado faria "salvar" virar confirmação — ou ativação de alarme — sem
 * escolha de verdade.
 */
export function frequenciaNaEdicao(m: ItemComHorario): string | null {
  return frequenciaAConfirmar(m) || configuracaoInconsistente(m) ? null : (m.cadence ?? null);
}

/** D2: data de início do intervalo, se ainda não chegou (`hoje` é a data local). */
export function inicioNoFuturo(m: CamposDeCadencia, hoje: string): string | null {
  const c = lerCadencia(m);
  return c?.tipo === "intervalo" && diasEntre(hoje, c.ancora) > 0 ? c.ancora : null;
}

/**
 * D3: programação do alarme vinda da edição de um item "livre" com horário.
 * Vazio = não mexer (continua sem alarme). Só rígido ou flexível ativam, e só
 * junto de uma frequência escolhida no mesmo envio.
 */
export function programacaoDoFormulario(
  valor: string | null
): { ok: true; rigidez: "rigido" | "flexivel" | null } | { ok: false; erro: string } {
  const v = (valor ?? "").trim();
  if (v === "") return { ok: true, rigidez: null };
  if (v === "rigido" || v === "flexivel") return { ok: true, rigidez: v };
  return { ok: false, erro: MENSAGENS_CADENCIA.programacao_invalida };
}

/** Horários válidos, no mesmo filtro que o banco usa antes de converter. */
export function horariosValidos(times: readonly string[] | null | undefined): string[] {
  return (times ?? []).filter((t) => {
    const r = HORA_RE.exec(t);
    return r !== null && Number(r[1]) <= 23 && Number(r[2]) <= 59;
  });
}

function somarDias(dataLocal: string, n: number): string {
  const [y, m, d] = dataLocal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type MedicamentoParaAlarme = CamposDeCadencia & {
  id: string;
  reminder_times?: string[] | null;
  active?: boolean | null;
};

export type DoseVencida = {
  medId: string;
  /** HH:MM como cadastrado */
  horario: string;
  /** Data local da DOSE — não a de "agora". É ela que decide a cadência. */
  dataDaDose: string;
  previstaUTC: Date;
};

/** Janela do despachante: o cron roda a cada 5 min; 10 min garante duas passagens. */
export const JANELA_ALARME_MIN = 10;

/**
 * Espelho de `public.med_alarms_due(p_now)`. A função SQL é a que roda em
 * produção; esta existe para fixar o contrato em teste local, com os mesmos
 * casos de `cadence-casos.json` que `supabase/tests/med_alarms_due.sql` usa.
 *
 * Considera as doses de hoje E de ontem no fuso do usuário: uma dose das 23:55
 * vence às 00:02 do dia seguinte, e a cadência dela é a do dia em que foi
 * prevista. A versão antiga comparava `time` com `time + 10 min`, que dá a volta
 * à meia-noite — horários de 23:51 a 23:59 nunca casavam.
 */
export function dosesVencidasParaAlarme(
  meds: readonly MedicamentoParaAlarme[],
  agora: Date,
  timezone: string,
  janelaMin: number = JANELA_ALARME_MIN
): DoseVencida[] {
  const hoje = localDateKey(agora.toISOString(), timezone);
  const datas = [somarDias(hoje, -1), hoje];
  const out: DoseVencida[] = [];

  for (const m of meds) {
    if (m.active === false || !alarmeHabilitado(m)) continue;
    for (const horario of horariosValidos(m.reminder_times)) {
      const [h, mi] = horario.split(":").map(Number);
      for (const data of datas) {
        const [y, mo, d] = data.split("-").map(Number);
        const prevista = wallClockToUTC(y, mo, d, h, mi, 0, timezone);
        const delta = agora.getTime() - prevista.getTime();
        if (delta < 0 || delta >= janelaMin * 60_000) continue;
        if (!ehDiaDeDose(m, data)) continue;
        out.push({ medId: m.id, horario, dataDaDose: data, previstaUTC: prevista });
      }
    }
  }
  return out;
}
