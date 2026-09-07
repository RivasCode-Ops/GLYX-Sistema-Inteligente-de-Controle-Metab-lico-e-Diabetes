/**
 * Contador de mecanismos hipoglicemiantes ativos.
 *
 * POR QUE EXISTE: o checador de interação olha PARES. Cinco substâncias que
 * baixam glicose por cinco vias diferentes podem não gerar nenhum par grave e
 * ainda assim ser o problema. Este módulo conta vias distintas.
 *
 * O QUE ELE NÃO FAZ: não estabelece causa, não prevê glicemia, não recomenda
 * suspender nada. A saída é contagem e data. Determinístico de ponta a ponta —
 * nenhuma via de LLM.
 */

/** Linha de `substance_mechanisms`, como vem do banco. */
export type MechanismRow = {
  canonical: string;
  mechanism: string;
  lowersGlucose: boolean;
  label: string;
  typicalDurationHours: number | null;
};

/** Substância em uso, já resolvida em slugs canônicos. */
export type UserSubstance = {
  /** nome livre, como o usuário cadastrou */
  name: string;
  /** slugs canônicos (mais de um em associações como Glyxambi) */
  canonical: string[];
  kind?: "med" | "supplement" | null;
  /** `medications.created_at`. Nulo para insulina vinda de insulin_logs. */
  addedAt?: string | null;
};

export type ActiveMechanism = {
  mechanism: string;
  label: string;
  /** slugs canônicos do usuário que contribuem para este mecanismo */
  contributors: string[];
  /** nomes livres, como ele cadastrou — para exibir */
  contributorNames: string[];
};

export type MechanismReport = {
  /** contagem de mecanismos DISTINTOS que reduzem glicemia */
  loweringCount: number;
  lowering: ActiveMechanism[];
  other: ActiveMechanism[];
  /** item mais recente entre os que reduzem glicemia */
  newest: { name: string; canonical: string; addedAt: string } | null;
  /** true se o mais recente é kind = 'supplement' */
  newestIsSupplement: boolean;
};

export function buildMechanismReport(
  substances: UserSubstance[],
  mechanisms: MechanismRow[]
): MechanismReport {
  const porCanonical = new Map<string, MechanismRow[]>();
  for (const m of mechanisms) {
    const lista = porCanonical.get(m.canonical) ?? [];
    lista.push(m);
    porCanonical.set(m.canonical, lista);
  }

  // Agrupa por MECANISMO, não por substância. Berberina, gymnema, cromo, ALA,
  // feno-grego, melão e canela compartilham `sensibilizador_amp`: três deles
  // juntos são UMA via, não três. Contar por substância inflaria o número com
  // sinônimos farmacológicos e faria o card gritar por causa do armário.
  const agrupado = new Map<string, ActiveMechanism & { lowers: boolean }>();

  for (const s of substances) {
    for (const slug of s.canonical) {
      for (const row of porCanonical.get(slug) ?? []) {
        const atual = agrupado.get(row.mechanism) ?? {
          mechanism: row.mechanism,
          label: row.label,
          contributors: [],
          contributorNames: [],
          lowers: row.lowersGlucose,
        };
        if (!atual.contributors.includes(slug)) atual.contributors.push(slug);
        if (!atual.contributorNames.includes(s.name)) atual.contributorNames.push(s.name);
        agrupado.set(row.mechanism, atual);
      }
    }
  }

  const todos = [...agrupado.values()];
  const separar = (lowers: boolean) =>
    todos
      .filter((m) => m.lowers === lowers)
      .map(({ mechanism, label, contributors, contributorNames }) => ({
        mechanism,
        label,
        contributors,
        contributorNames,
      }));

  const lowering = separar(true);
  const other = separar(false);

  // Quais slugs efetivamente reduzem glicemia — só eles disputam `newest`.
  const slugsQueBaixam = new Set(lowering.flatMap((m) => m.contributors));

  let newest: MechanismReport["newest"] = null;
  let newestKind: UserSubstance["kind"] = null;
  for (const s of substances) {
    if (!s.addedAt) continue;
    const slug = s.canonical.find((c) => slugsQueBaixam.has(c));
    if (!slug) continue;
    if (!newest || s.addedAt > newest.addedAt) {
      newest = { name: s.name, canonical: slug, addedAt: s.addedAt };
      newestKind = s.kind ?? null;
    }
  }

  return {
    loweringCount: lowering.length,
    lowering,
    other,
    // `newest` diz qual item entrou por último. É data, não juízo: o app não
    // afirma, em lugar nenhum, que o mais recente é a causa de coisa alguma.
    newest,
    newestIsSupplement: newestKind === "supplement",
  };
}
