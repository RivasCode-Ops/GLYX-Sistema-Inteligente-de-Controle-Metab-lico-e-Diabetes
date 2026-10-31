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
  /\bglicemia\b[^.!?]{0,80}\b((vai|ir[áa]|dever[áa]|pode)\s+(cair|subir|baixar|chegar|ficar|estar|atingir|passar|descer)|estar[áa]|ficar[áa]|cair[áa]|subir[áa]|chegar[áa])\b[^.!?]{0,80}\d/i;

/**
 * Contextos em que a frase proibida aparece NEGADA ou com objeto inofensivo —
 * exatamente o que o app pede para dizer (correção de 31/10/2026). Sem isto,
 * "não é seguro", "não significa que está sem risco" e "pode manter a
 * caminhada" derrubavam a resposta inteira, inclusive o alerta de substância
 * fora da base. Casados sobre o texto normalizado (sem acento, minúsculo).
 */
const CONTEXTOS_PERMITIDOS: RegExp[] = [
  /\b(nao|nunca|nem|jamais)\s+(e|esta|sera|seria)\s+(seguro|liberado)\b/g,
  /\b(nao|nem)\s+(significa|quer dizer|garante|indica)\s+(que\s+)?(esta\s+|seja\s+|ha\s+|estar\s+|fique\s+)?(sem risco|seguro|liberado)\b/g,
  /\b(nao|nem)\s+(da|e possivel|consigo|posso|podemos)\s+(para\s+)?(dizer|afirmar|concluir|saber)\s+(que\s+)?(isso\s+|ele\s+|ela\s+)?(e a causa|esta causando)\b/g,
  /\bpode manter\s+(a |o |as |os |sua |seu |suas |seus )?(caminhada|rotina|atividade|treino|exercicio|alimentacao|horario|ritmo|habito|registro|hidratacao|sono)/g,
];

function trechosPermitidos(normalizado: string): [number, number][] {
  const out: [number, number][] = [];
  for (const re of CONTEXTOS_PERMITIDOS) {
    re.lastIndex = 0;
    for (const m of normalizado.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

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
  const permitidos = trechosPermitidos(normalizado);
  const dentroDePermitido = (i: number, fim: number) => permitidos.some(([a, b]) => i >= a && fim <= b);

  for (const frase of FORBIDDEN_PHRASES) {
    const alvo = frase
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .toLowerCase();
    // Toda ocorrência conta: uma negada não pode esconder outra afirmada.
    for (let i = normalizado.indexOf(alvo); i !== -1; i = normalizado.indexOf(alvo, i + 1)) {
      if (dentroDePermitido(i, i + alvo.length)) continue;
      hits.push({ phrase: frase, excerpt: texto.slice(Math.max(0, i - 40), i + alvo.length + 40) });
      break;
    }
  }

  // Sobre o texto SEM acento: `\b` do JavaScript não vê borda depois de "á",
  // e "estará" passava (achado em 31/10/2026).
  const previsao = FORBIDDEN_PREDICTION.exec(normalizado);
  if (previsao) {
    hits.push({ phrase: "previsão de glicemia com hora e valor", excerpt: previsao[0] });
  }

  return hits;
}
