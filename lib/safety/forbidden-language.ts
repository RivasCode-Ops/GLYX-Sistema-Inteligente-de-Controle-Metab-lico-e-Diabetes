/**
 * Frases que o app não pode dizer sobre segurança de substâncias.
 *
 * Não é lista de estilo. Cada item marca a fronteira entre RELATAR e
 * DIAGNOSTICAR, e o app fica do lado de relatar: ele afirma contagem, janela e
 * data — nunca causa, nunca previsão, nunca conduta.
 *
 * A lista mora em módulo próprio, e não dentro do teste, porque quem escreve
 * texto novo precisa poder consultá-la e porque o teste que a aplica varre o
 * FONTE dos módulos de segurança, não só a saída em tempo de execução.
 */

/** Atribuição de causa. O app mostra associação temporal; a causa é do médico. */
const CAUSA = [
  "o motivo das suas hipoglicemias",
  "o motivo é claro",
  "isso está causando",
  "está causando",
  "é a causa",
  "responsável pelas suas",
];

/** Conduta. Alterar ou suspender tratamento é decisão médica, em qualquer severidade. */
const CONDUTA = ["suspenda", "pare de tomar", "interrompa", "deixe de tomar", "não tome mais"];

/**
 * Liberação. O app só sabe consultar uma base parcial, então não existe estado
 * que signifique "seguro" — o melhor possível é "sem alerta na base".
 */
const LIBERACAO = ["é seguro", "pode manter", "está liberado", "sem risco"];

export const FORBIDDEN_PHRASES = [...CAUSA, ...CONDUTA, ...LIBERACAO];

/**
 * Previsão de glicemia com hora e valor. O card reporta concentração de
 * mecanismos numa janela; não afirma que a glicemia vai cair, nem quando, nem
 * quanto.
 *
 * Casa coisas como "vai cair para 60 às 15h" ou "sua glicemia às 15:00 estará".
 */
export const FORBIDDEN_PREDICTION =
  /\bglicemia\b[^.!?]{0,80}\b(vai|ir[áa]|dever[áa]|estar[áa])\b[^.!?]{0,80}\d/i;

/** Ocorrência encontrada, com contexto suficiente para achar no arquivo. */
export type ForbiddenHit = { phrase: string; excerpt: string };

/**
 * Procura frase proibida num texto. Acento e caixa são normalizados, porque
 * "Suspenda" e "suspenda" são a mesma proibição.
 */
export function findForbiddenLanguage(texto: string): ForbiddenHit[] {
  const normalizado = texto
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();

  const hits: ForbiddenHit[] = [];

  for (const frase of FORBIDDEN_PHRASES) {
    const alvo = frase
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .toLowerCase();
    const i = normalizado.indexOf(alvo);
    if (i === -1) continue;
    hits.push({ phrase: frase, excerpt: texto.slice(Math.max(0, i - 40), i + alvo.length + 40) });
  }

  const previsao = FORBIDDEN_PREDICTION.exec(texto);
  if (previsao) {
    hits.push({ phrase: "previsão de glicemia com hora e valor", excerpt: previsao[0] });
  }

  return hits;
}
