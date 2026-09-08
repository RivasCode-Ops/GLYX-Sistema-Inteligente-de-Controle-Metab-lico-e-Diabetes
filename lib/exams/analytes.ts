/**
 * Vocabulário canônico de analitos — o que permite série entre laboratórios.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O SLUG, E NÃO O TEXTO DO LAUDO
 * ---------------------------------------------------------------------------
 * "Hemoglobina glicada (HbA1c)", "HbA1c", "Hemoglobina Glicosilada A1c" e
 * "Glico-hemoglobina" são o mesmo exame. Agrupar pelo texto impresso produz uma
 * série por grafia — e o usuário troca de laboratório justamente entre uma
 * coleta e outra, que é quando a série importa.
 *
 * O `label` original fica gravado ao lado do slug em `exam_values`: o slug é
 * INTERPRETAÇÃO do app, e quem confere precisa ver o que o laudo dizia.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE MÓDULO NÃO FAZ
 * ---------------------------------------------------------------------------
 * Não guarda faixa de referência. Poderia — as faixas "normais" de HbA1c e LDL
 * são públicas — e seria errado: a faixa que vale é a IMPRESSA NO LAUDO, e às
 * vezes a anotada à mão pelo médico. No laudo de 24/06 o LDL vem com "<70"
 * escrito à mão, que é meta individual e não a referência do laboratório.
 * Guardar uma tabela própria criaria a segunda régua, e o app passaria a
 * contradizer o papel.
 */

export type AnalyteGroup =
  | "glicemia"
  | "lipides"
  | "renal"
  | "hepatico"
  | "hematologia"
  | "hormonal"
  | "vitaminas"
  | "urina"
  | "outro";

export type AnalyteDef = {
  slug: string;
  label: string;
  group: AnalyteGroup;
  /** Grafias que aparecem em laudo, já normalizadas (minúsculo, sem acento). */
  aliases: string[];
};

/**
 * Curadoria mínima: os analitos que aparecem no acompanhamento de diabetes,
 * lípides, função renal e o painel que o usuário já tem em mãos. Não pretende
 * cobrir laboratório inteiro — o que não está aqui entra como `outro` com o
 * label do laudo, e continua sendo guardado.
 */
export const ANALYTES: AnalyteDef[] = [
  {
    slug: "hba1c",
    label: "Hemoglobina glicada (HbA1c)",
    group: "glicemia",
    aliases: ["hba1c", "hemoglobina glicada", "hemoglobina glicosilada", "glico-hemoglobina", "a1c"],
  },
  {
    slug: "glicemia_jejum",
    label: "Glicose de jejum",
    group: "glicemia",
    aliases: ["glicose", "glicose de jejum", "glicemia de jejum", "glicemia em jejum"],
  },
  {
    slug: "glicose_media_estimada",
    label: "Glicose média estimada",
    group: "glicemia",
    aliases: ["glicose media estimada", "gme", "glicemia media estimada"],
  },
  {
    slug: "peptideo_c",
    label: "Peptídeo C",
    group: "glicemia",
    aliases: ["peptideo c", "peptidio c", "c-peptideo"],
  },
  {
    slug: "anti_gad",
    label: "Anticorpo anti-GAD",
    group: "glicemia",
    aliases: ["anti-gad", "anticorpo anti-gad", "gad65", "anti gad"],
  },
  {
    slug: "colesterol_total",
    label: "Colesterol total",
    group: "lipides",
    aliases: ["colesterol total", "colesterol"],
  },
  { slug: "hdl", label: "HDL", group: "lipides", aliases: ["hdl", "colesterol hdl", "hdl-c"] },
  { slug: "ldl", label: "LDL", group: "lipides", aliases: ["ldl", "colesterol ldl", "ldl-c"] },
  { slug: "vldl", label: "VLDL", group: "lipides", aliases: ["vldl", "colesterol vldl"] },
  {
    slug: "nao_hdl",
    label: "Colesterol não-HDL",
    group: "lipides",
    aliases: ["nao-hdl", "nao hdl", "colesterol nao-hdl"],
  },
  {
    slug: "triglicerides",
    label: "Triglicérides",
    group: "lipides",
    aliases: ["triglicerides", "triglicerideos", "trigliceridios"],
  },
  {
    slug: "creatinina",
    label: "Creatinina",
    group: "renal",
    aliases: ["creatinina", "creatinina serica"],
  },
  {
    slug: "egfr",
    label: "Taxa de filtração glomerular (eGFR)",
    group: "renal",
    aliases: ["egfr", "tfg", "ckd-epi", "filtracao glomerular", "taxa de filtracao glomerular"],
  },
  { slug: "ureia", label: "Ureia", group: "renal", aliases: ["ureia"] },
  {
    slug: "microalbuminuria",
    label: "Microalbuminúria",
    group: "renal",
    aliases: [
      "microalbuminuria",
      "albuminuria",
      "relacao albumina creatinina",
      "racu",
      "albumina/creatinina",
    ],
  },
  { slug: "tgo", label: "TGO (AST)", group: "hepatico", aliases: ["tgo", "ast", "aspartato"] },
  { slug: "tgp", label: "TGP (ALT)", group: "hepatico", aliases: ["tgp", "alt", "alanina"] },
  { slug: "cpk", label: "CPK", group: "hepatico", aliases: ["cpk", "ck", "creatinoquinase"] },
  {
    slug: "vitamina_d",
    label: "Vitamina D (25-OH)",
    group: "vitaminas",
    aliases: ["vitamina d", "vitamina d 25-oh", "25-oh", "25 hidroxivitamina d", "calcidiol"],
  },
  {
    slug: "vitamina_b12",
    label: "Vitamina B12",
    group: "vitaminas",
    aliases: ["vitamina b12", "b12", "cobalamina"],
  },
  { slug: "ferritina", label: "Ferritina", group: "vitaminas", aliases: ["ferritina"] },
  { slug: "tsh", label: "TSH", group: "hormonal", aliases: ["tsh", "tsh ultrassensivel"] },
  { slug: "t4_livre", label: "T4 livre", group: "hormonal", aliases: ["t4 livre", "t4l", "tiroxina livre"] },
  {
    slug: "testosterona_total",
    label: "Testosterona total",
    group: "hormonal",
    aliases: ["testosterona total", "testosterona"],
  },
  { slug: "fsh", label: "FSH", group: "hormonal", aliases: ["fsh"] },
  { slug: "lh", label: "LH", group: "hormonal", aliases: ["lh"] },
  { slug: "prolactina", label: "Prolactina", group: "hormonal", aliases: ["prolactina", "prl"] },
  {
    slug: "hemoglobina",
    label: "Hemoglobina",
    group: "hematologia",
    aliases: ["hemoglobina", "hb"],
  },
  {
    slug: "hematocrito",
    label: "Hematócrito",
    group: "hematologia",
    aliases: ["hematocrito", "ht"],
  },
  {
    slug: "leucocitos",
    label: "Leucócitos",
    group: "hematologia",
    aliases: ["leucocitos", "leucograma"],
  },
  { slug: "plaquetas", label: "Plaquetas", group: "hematologia", aliases: ["plaquetas"] },
];

const POR_ALIAS = new Map<string, AnalyteDef>();
for (const a of ANALYTES) {
  for (const alias of a.aliases) POR_ALIAS.set(alias, a);
  POR_ALIAS.set(a.slug, a);
}

export const ANALYTE_BY_SLUG = new Map(ANALYTES.map((a) => [a.slug, a]));

/** Minúsculo, sem acento, sem pontuação, espaços colapsados. */
export function normalizeAnalyteName(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9/\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nome do laudo → slug canônico, ou `null` quando não reconhecido.
 *
 * Null NÃO significa descartar: quem chama guarda o resultado com o label
 * original mesmo assim. Perder um valor porque o vocabulário não previu a
 * grafia seria pior que não ter série dele.
 */
export function resolveAnalyte(nomeDoLaudo: string): AnalyteDef | null {
  const n = normalizeAnalyteName(nomeDoLaudo);
  if (!n) return null;

  const exato = POR_ALIAS.get(n);
  if (exato) return exato;

  // Alias contido como PALAVRA INTEIRA. "colesterol ldl" acha `ldl`; mas
  // "ldl" não pode casar dentro de "vldl", e é por isso que a checagem é por
  // fronteira de palavra e não por substring.
  let melhor: AnalyteDef | null = null;
  let maiorAlias = 0;
  for (const [alias, def] of POR_ALIAS) {
    if (alias.length <= maiorAlias) continue;
    if (contemPalavra(n, alias)) {
      melhor = def;
      maiorAlias = alias.length;
    }
  }
  return melhor;
}

function contemPalavra(haystack: string, alias: string): boolean {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(alias, from);
    if (i === -1) return false;
    const fim = i + alias.length;
    const antesOk = i === 0 || haystack[i - 1] === " ";
    const depoisOk = fim === haystack.length || haystack[fim] === " ";
    if (antesOk && depoisOk) return true;
    from = i + 1;
  }
}
