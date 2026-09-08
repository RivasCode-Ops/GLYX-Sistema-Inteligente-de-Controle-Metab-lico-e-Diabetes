import { resolveAnalyte } from "@/lib/exams/analytes";

/**
 * Extração de resultados do texto do laudo — determinística, sem modelo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO COMEÇAR PELA IA
 * ---------------------------------------------------------------------------
 * A rota de exame já chama modelo para descrever o laudo. Seria natural pedir a
 * ele também os valores estruturados — e seria a escolha errada para começar:
 * laudo é uma tabela, e o formato "Analito: valor unidade [referência]" se lê
 * com regra. Regra é reproduzível, testável contra o texto real, custa zero e
 * não alucina um LDL que não está escrito.
 *
 * A IA entra DEPOIS, no que a regra não pegar — laudo em prosa, PDF mal
 * convertido, tabela em colunas. Mesma ordem do checador de substância: motor
 * primeiro, modelo no que sobra.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO NÃO FAZ
 * ---------------------------------------------------------------------------
 * Não classifica resultado como normal ou alterado, e não converte a referência
 * impressa em número quando ela é textual. A faixa que vale é a do laudo — no
 * exame de 24/06 o LDL vem com "<70" anotado à mão pelo médico, que é meta
 * individual e não referência de laboratório. `ref_text` guarda o que estava
 * escrito; `ref_min`/`ref_max` só são preenchidos quando a faixa é inequívoca.
 */

export type ParsedValue = {
  /** Slug canônico, ou null quando o vocabulário não reconhece o nome. */
  analyte: string | null;
  /** Nome como veio no laudo — sempre preservado. */
  label: string;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  refMin: number | null;
  refMax: number | null;
  refText: string | null;
  /** Linha original, para conferência lado a lado. */
  source: string;
};

/** "12,3" e "12.3" são o mesmo número; vírgula é o separador local. */
function toNumber(texto: string): number | null {
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Faixa numérica de uma referência impressa, quando ela é inequívoca.
 *
 * "70-99" e "0,8-4,2" viram min e max. "<70", ">40" e "negativo <10" NÃO viram:
 * um limite só não é faixa, e inventar o outro lado (zero? infinito?) faria o
 * app afirmar um intervalo que o laudo não escreveu.
 */
export function parseRefRange(ref: string): { min: number | null; max: number | null } {
  const m = /(-?[\d.,]+)\s*(?:-|a|até|ate)\s*(-?[\d.,]+)/i.exec(ref);
  if (!m) return { min: null, max: null };
  const min = toNumber(m[1]);
  const max = toNumber(m[2]);
  if (min == null || max == null || min > max) return { min: null, max: null };
  return { min, max };
}

// Nome, dois-pontos, valor, resto. O valor aceita comparador (<, >, ≤, ≥).
const LINHA = /^([A-Za-zÀ-ÿ0-9][^:]{1,80}):\s*(.+)$/;
const VALOR = /^([<>≤≥]?\s*-?[\d.,]+)\s*(.*)$/;

/**
 * Resultados QUALITATIVOS, num conjunto fechado.
 *
 * Sumário de urina não devolve número: "Proteinas: +", "Corpos cetonicos: +",
 * "Urobilinogenio: ausente". Sem isto, esses resultados sumiam — e no caso do
 * usuário eles importam: glicose e cetonas positivas na urina são achado
 * esperado de quem usa inibidor de SGLT2, e o app precisa tê-los para que o
 * módulo de medicação possa um dia dizer isso ao lado do resultado.
 *
 * A lista é FECHADA de propósito. Aceitar qualquer texto como valor faria toda
 * frase do laudo virar resultado.
 */
const QUALITATIVOS = new Set([
  "+", "++", "+++", "++++", "-", "--",
  "ausente", "ausentes", "presente", "presentes",
  "negativo", "negativa", "positivo", "positiva",
  "normal", "normais", "raras", "raro", "raros",
  "nao reagente", "reagente", "vestigios", "traços", "tracos",
]);

function valorQualitativo(texto: string): string | null {
  const n = texto
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "")
    .toLowerCase()
    .trim();
  return QUALITATIVOS.has(n) ? texto.trim() : null;
}

/**
 * Linhas que são cabeçalho de seção, não resultado.
 *
 * Sem esta guarda, "GLICEMIA E METABÓLICO" e "Conclusao: ..." entrariam como
 * analito — a segunda com um texto inteiro no lugar do valor.
 */
function ehCabecalhoOuProsa(nome: string, resto: string): boolean {
  if (nome === nome.toUpperCase() && !/\d/.test(resto.slice(0, 12))) return true;
  if (/^(conclusao|conclusão|impressao|impressão|observa|nota|laudo|solicitante)/i.test(nome)) {
    return true;
  }
  // Valor que não é número, comparador nem qualitativo conhecido é prosa.
  const limpo = resto.trim();
  return !VALOR.test(limpo) && valorQualitativo(limpo) == null;
}

export function parseExamValues(rawText: string): ParsedValue[] {
  const out: ParsedValue[] = [];
  const vistos = new Set<string>();

  for (const linhaBruta of rawText.split(/\r?\n/)) {
    const linhaInteira = linhaBruta.trim();
    if (!linhaInteira) continue;

    // Uma linha pode trazer VÁRIOS resultados separados por "|" — é como o
    // sumário de urina e o hemograma vêm impressos. Só se parte quando cada
    // pedaço parece "nome: valor"; senão a barra é pontuação da prosa.
    const pedacos = linhaInteira.includes("|")
      ? linhaInteira.split("|").map((p) => p.trim()).filter(Boolean)
      : [linhaInteira];
    const todosSaoResultado = pedacos.length > 1 && pedacos.every((p) => LINHA.test(p));

    for (const linha of todosSaoResultado ? pedacos : [linhaInteira]) {
      const m = LINHA.exec(linha);
      if (!m) continue;

      const nome = m[1].trim();
      const resto = m[2].trim();
      if (ehCabecalhoOuProsa(nome, resto)) continue;

      // Referência entre colchetes, quando houver.
      const refMatch = /\[([^\]]+)\]/.exec(resto);
      const refText = refMatch ? refMatch[1].trim() : null;
      const semRef = resto.replace(/\[[^\]]*\]/g, "").trim();

      const vm = VALOR.exec(semRef);
      const qualitativo = vm ? null : valorQualitativo(semRef);
      if (!vm && !qualitativo) continue;

      const bruto = vm ? vm[1].replace(/\s+/g, "") : qualitativo!;
      const unidade = vm ? vm[2].trim() || null : null;

      // Comparador preservado como texto: "<5" não é 5, e gravar 5 diria que o
      // exame mediu um valor que ele declarou não medir.
      const temComparador = /^[<>≤≥]/.test(bruto);
      const valueNum = temComparador || qualitativo ? null : toNumber(bruto);
      const valueText = valueNum == null ? bruto : null;
      if (valueNum == null && !valueText) continue;

      const def = resolveAnalyte(nome);
      // Mesmo analito duas vezes no laudo é erro de extração, não resultado —
      // e o banco tem unique. Fica a primeira ocorrência.
      const chave = def?.slug ?? `livre:${nome.toLowerCase()}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      const faixa = refText ? parseRefRange(refText) : { min: null, max: null };

      out.push({
        analyte: def?.slug ?? null,
        label: nome,
        valueNum,
        valueText,
        unit: unidade,
        refMin: faixa.min,
        refMax: faixa.max,
        refText,
        source: linha,
      });
    }
  }

  return out;
}
