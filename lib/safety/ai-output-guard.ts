import { findForbiddenLanguage, type ForbiddenHit } from "./forbidden-language";

/**
 * Guarda de saída: nenhum texto de IA chega ao usuário com linguagem proibida
 * (Etapa 1, A6; problema P16).
 *
 * A lista de `forbidden-language.ts` marca a fronteira entre RELATAR e
 * DIAGNOSTICAR — causa, conduta, liberação, previsão de glicemia com hora e
 * valor. Até aqui ela valia só na checagem de suplemento; o chat, o push
 * automático e os textos livres das outras rotas saíam sem filtro, e obedecer
 * dependia só do prompt. Prompt é pedido; isto é barreira.
 *
 * Limitação declarada: a busca é por frase (normaliza acento e caixa). Paráfrase
 * passa. Uma segunda camada (classificador) fica para a avaliação contínua da
 * Etapa 3 — exige chamadas ao provedor e, portanto, autorização de custo.
 */

/** Texto que substitui uma resposta barrada. Ele mesmo é varrido pelo teste de linguagem. */
export const AVISO_RESPOSTA_BARRADA =
  "Esta resposta foi interrompida pelo GLYX porque entrava em orientação que só o seu médico pode dar " +
  "(dose, mudança de tratamento, diagnóstico ou previsão de glicemia). Os seus dados continuam disponíveis " +
  "nas telas do app — leve essa dúvida à próxima consulta.";

export type TextoGuardado = { texto: string; bloqueado: boolean; frases: string[] };

/** Texto pronto (não streaming): devolve o original ou o substituto. */
export function guardarTextoDaIA(texto: string, substituto: string = AVISO_RESPOSTA_BARRADA): TextoGuardado {
  const hits = findForbiddenLanguage(texto);
  if (!hits.length) return { texto, bloqueado: false, frases: [] };
  return { texto: substituto, bloqueado: true, frases: hits.map((h) => h.phrase) };
}

/**
 * Vários campos de texto livre de uma resposta estruturada: se QUALQUER campo
 * tiver linguagem proibida, todos os campos de texto viram o substituto —
 * remendar um campo deixaria o resto construído em cima dele.
 */
export function guardarCamposDaIA<T extends Record<string, unknown>>(
  objeto: T,
  campos: (keyof T)[],
  substituto: string = AVISO_RESPOSTA_BARRADA
): { objeto: T; bloqueado: boolean; frases: string[] } {
  const textos: string[] = [];
  for (const c of campos) {
    const v = objeto[c];
    if (typeof v === "string") textos.push(v);
    else if (Array.isArray(v)) textos.push(...v.filter((x): x is string => typeof x === "string"));
  }
  const hits = findForbiddenLanguage(textos.join("\n"));
  if (!hits.length) return { objeto, bloqueado: false, frases: [] };
  const limpo: Record<string, unknown> = { ...objeto };
  for (const c of campos) {
    const v = objeto[c];
    if (typeof v === "string") limpo[c as string] = substituto;
    else if (Array.isArray(v)) limpo[c as string] = [];
  }
  return { objeto: limpo as T, bloqueado: true, frases: hits.map((h) => h.phrase) };
}

/** Todos os textos de uma estrutura qualquer (objetos e listas aninhados). */
function textosDe(valor: unknown, saida: string[] = []): string[] {
  if (typeof valor === "string") saida.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) textosDe(v, saida);
  else if (valor && typeof valor === "object") for (const v of Object.values(valor)) textosDe(v, saida);
  return saida;
}

/**
 * Varre TODA a resposta estruturada de uma rota de IA (análise corporal, meta,
 * exame, refeição, prato, treino, horário). Qualquer achado reprova a resposta
 * inteira: quem chama devolve `AVISO_RESPOSTA_BARRADA` em vez da análise.
 */
export function linguagemProibidaEm(resposta: unknown): ForbiddenHit[] {
  return findForbiddenLanguage(textosDe(resposta).join("\n"));
}

/**
 * Quantos caracteres ficam retidos no streaming antes de liberar. Maior que o
 * maior trecho que a lista consegue casar (a previsão de glicemia casa até ~170
 * caracteres): assim, quando uma frase proibida aparece, nenhum pedaço dela já
 * foi exibido.
 */
export const RETENCAO_STREAM = 200;

export type GuardaDeStream = {
  /** Recebe um pedaço do modelo e devolve o que pode ser exibido agora. */
  receber(pedaco: string): string;
  /** Fim do stream: devolve o restante (ou o aviso, se barrado). */
  finalizar(): string;
  /** Texto efetivamente entregue ao usuário (o que deve ir para o histórico). */
  entregue(): string;
  bloqueado(): boolean;
  frases(): ForbiddenHit[];
};

export function criarGuardaDeStream(aviso: string = AVISO_RESPOSTA_BARRADA): GuardaDeStream {
  let total = "";
  let liberado = 0;
  let barrado = false;
  let hits: ForbiddenHit[] = [];
  let saida = "";

  function barrar(): string {
    barrado = true;
    const texto = `${saida.length ? "\n\n" : ""}${aviso}`;
    saida += texto;
    return texto;
  }

  return {
    receber(pedaco) {
      if (barrado || !pedaco) return "";
      total += pedaco;
      const encontrados = findForbiddenLanguage(total);
      if (encontrados.length) {
        hits = encontrados;
        return barrar();
      }
      const ate = total.length - RETENCAO_STREAM;
      if (ate <= liberado) return "";
      const trecho = total.slice(liberado, ate);
      liberado = ate;
      saida += trecho;
      return trecho;
    },
    finalizar() {
      if (barrado) return "";
      const encontrados = findForbiddenLanguage(total);
      if (encontrados.length) {
        hits = encontrados;
        return barrar();
      }
      const resto = total.slice(liberado);
      liberado = total.length;
      saida += resto;
      return resto;
    },
    entregue: () => saida,
    bloqueado: () => barrado,
    frases: () => hits,
  };
}
