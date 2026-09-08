import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildVerdict,
  resolveCanonical,
  type AliasRow,
  type InteractionFinding,
  type SafetyVerdict,
  type Severity,
} from "@/lib/safety/interaction-check";

/**
 * Leitura da base de interação e montagem do conjunto de substâncias em uso.
 *
 * As duas tabelas são globais e pequenas (dezenas de linhas), lidas inteiras a
 * cada request. Paginar ou filtrar por substância candidata seria otimização
 * prematura e abriria a porta para a consulta errada devolver "nada encontrado"
 * — que neste módulo é indistinguível, para quem lê o resultado, de "nenhuma
 * interação existe".
 */

export type SafetyBase = { aliases: AliasRow[]; interactions: InteractionFinding[] };

export async function loadSafetyBase(supabase: SupabaseClient): Promise<SafetyBase> {
  const [aliasRes, interRes] = await Promise.all([
    supabase.from("substance_aliases").select("canonical, alias"),
    supabase
      .from("substance_interactions")
      .select("substance_a, substance_b, severity, mechanism, message"),
  ]);

  const aliases = (aliasRes.data ?? []).map((r) => ({
    canonical: r.canonical as string,
    alias: r.alias as string,
  }));

  const interactions = (interRes.data ?? []).map((r) => ({
    substanceA: r.substance_a as string,
    substanceB: r.substance_b as string,
    severity: r.severity as InteractionFinding["severity"],
    mechanism: r.mechanism as string,
    message: r.message as string,
  }));

  return { aliases, interactions };
}

/** insulin_logs.insulin_kind -> slug canônico. 'outra' não vira nada: adivinhar qual insulina é seria inventar dado clínico. */
const INSULIN_KIND_TO_CANONICAL: Record<string, string | undefined> = {
  rapida: "insulina_rapida",
  basal: "insulina_basal",
  outra: undefined,
};

const INSULIN_WINDOW_DAYS = 7;

export type UserSubstances = {
  /** nomes livres do cadastro, ainda por resolver */
  names: string[];
  /** slugs que já vêm decididos por coluna tipada, sem passar por alias */
  directCanonical: string[];
};

/**
 * Substâncias em uso pelo usuário.
 *
 * Fonte: `medications` ativas + `insulin_logs` recentes.
 *
 * NÃO usa `medication_logs`: a FK `medication_id` é `on delete set null`, então
 * apagar um medicamento deixa doses órfãs sem nome. Montar o conjunto a partir
 * dali significaria perder silenciosamente substâncias em uso — e um conjunto
 * incompleto aqui vira alerta que não dispara.
 */
export async function loadUserSubstances(
  supabase: SupabaseClient,
  userId: string
): Promise<UserSubstances> {
  const desde = new Date(Date.now() - INSULIN_WINDOW_DAYS * 86_400_000).toISOString();

  const [medsRes, insulinRes] = await Promise.all([
    supabase.from("medications").select("name").eq("user_id", userId).eq("active", true),
    supabase
      .from("insulin_logs")
      .select("insulin_kind")
      .eq("user_id", userId)
      .gte("applied_at", desde),
  ]);

  const names = (medsRes.data ?? [])
    .map((m) => (m.name as string | null) ?? "")
    .filter((n) => n.trim().length > 0);

  const directCanonical = [
    ...new Set(
      (insulinRes.data ?? [])
        .map((i) => INSULIN_KIND_TO_CANONICAL[i.insulin_kind as string])
        .filter((c): c is string => Boolean(c))
    ),
  ];

  return { names, directCanonical };
}

/**
 * Checagem completa: monta o conjunto em uso, resolve os candidatos e devolve o
 * veredito. É o único ponto de entrada que as rotas usam — três rotas chamando
 * a mesma função é o que garante que elas não divirjam no que consideram risco.
 */
export async function checkSubstanceSafety(
  supabase: SupabaseClient,
  userId: string,
  candidateNames: string[]
): Promise<SafetyVerdict> {
  const [base, user] = await Promise.all([
    loadSafetyBase(supabase),
    loadUserSubstances(supabase, userId),
  ]);

  const userResolution = resolveCanonical(user.names, base.aliases);
  const userCanonical = new Set([...userResolution.canonical, ...user.directCanonical]);

  const candidate = resolveCanonical(candidateNames, base.aliases);
  return buildVerdict(candidate, userCanonical, base.interactions);
}

/** Uma interação entre dois itens que o usuário JÁ usa, com os nomes de cada lado. */
export type InteracaoEmUso = {
  finding: InteractionFinding;
  /** Itens cadastrados que resolveram para `finding.substanceA`. */
  itensA: string[];
  itensB: string[];
};

export type PanoramaDeInteracoes = {
  interacoes: InteracaoEmUso[];
  /** Nomes cadastrados que a base não reconhece — dito em voz alta, nunca omitido. */
  naoReconhecidos: string[];
  /** Quantos itens ativos entraram na conta. */
  totalItens: number;
};

/**
 * Todas as interações ENTRE OS ITENS EM USO — o panorama, não a checagem.
 *
 * `checkSubstanceSafety` responde outra pergunta: "posso acrescentar X ao que
 * já tomo?". Ela cruza um candidato contra o conjunto. Esta responde "o que eu
 * já tomo conflita entre si?", que é o cruzamento do conjunto consigo mesmo.
 *
 * A distinção não é acadêmica: a auditoria de 08/09/2026 mediu o painel
 * mostrando UMA interação — a mais grave — enquanto o conjunto ativo tinha
 * cinco, e "Ver detalhes" levava a uma lista de medicamentos que não menciona
 * interação nenhuma. As outras quatro não existiam em tela alguma.
 *
 * Os não reconhecidos vêm junto de propósito. Um panorama que lista só o que
 * encontrou dá a impressão de cobertura total; dizer "destes onze, conheço
 * seis" é a mesma régua do checador, que distingue "conheço e não achei nada"
 * de "não conheço".
 */
export async function loadInteracoesEmUso(
  supabase: SupabaseClient,
  userId: string
): Promise<PanoramaDeInteracoes> {
  const [base, user] = await Promise.all([
    loadSafetyBase(supabase),
    loadUserSubstances(supabase, userId),
  ]);

  const resolucao = resolveCanonical(user.names, base.aliases);

  // Canônico -> nomes cadastrados que chegaram nele. É o que permite a tela
  // dizer "Berberina + Insulina Lantus" em vez de "berberina × insulina_basal".
  const nomesPorCanonical = new Map<string, string[]>();
  for (const r of resolucao.resolved) {
    for (const c of r.canonical) {
      const atual = nomesPorCanonical.get(c) ?? [];
      if (!atual.includes(r.name)) atual.push(r.name);
      nomesPorCanonical.set(c, atual);
    }
  }
  // Insulina registrada por coluna tipada não tem nome livre correspondente.
  for (const c of user.directCanonical) {
    if (!nomesPorCanonical.has(c)) nomesPorCanonical.set(c, ["Insulina registrada em aplicações"]);
  }

  const emUso = new Set(nomesPorCanonical.keys());

  const interacoes: InteracaoEmUso[] = base.interactions
    .filter((f) => emUso.has(f.substanceA) && emUso.has(f.substanceB))
    .map((finding) => ({
      finding,
      itensA: nomesPorCanonical.get(finding.substanceA) ?? [],
      itensB: nomesPorCanonical.get(finding.substanceB) ?? [],
    }))
    .sort((a, b) => severidadePeso(a.finding.severity) - severidadePeso(b.finding.severity));

  return {
    interacoes,
    naoReconhecidos: resolucao.unresolved,
    totalItens: user.names.length,
  };
}

function severidadePeso(s: Severity): number {
  return s === "grave" ? 0 : s === "moderada" ? 1 : 2;
}
