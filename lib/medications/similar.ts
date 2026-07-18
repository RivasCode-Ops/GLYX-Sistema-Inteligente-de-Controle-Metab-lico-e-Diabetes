// Termos genéricos demais para indicar que dois nomes são o mesmo produto
// (ex.: "Insulina Fiasp" e "Insulina Lantus" compartilham "insulina" mas são
// remédios diferentes — só a marca em comum importa).
const STOPWORDS = new Set([
  "insulina",
  "comprimido",
  "comprimidos",
  "capsula",
  "capsulas",
  "unidade",
  "unidades",
  "gota",
  "gotas",
  "uso",
  "adulto",
  "pediatrico",
  "acima",
  "ano",
  "anos",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "com",
  "sem",
  "por",
  "para",
  "mg",
  "ml",
]);

function significantWords(name: string): Set<string> {
  const words = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Heurística leve (sem extensão de banco) para avisar "isso parece o mesmo
 * item que você já tem" antes de cadastrar por foto — não é um bloqueio,
 * só um aviso, então falso positivo custa pouco (o usuário ignora) e falso
 * negativo não piora o que já existia (sem aviso nenhum).
 */
export function namesLookSimilar(a: string, b: string): boolean {
  const wordsA = significantWords(a);
  const wordsB = significantWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  for (const w of wordsA) {
    if (wordsB.has(w)) return true;
  }
  return false;
}
