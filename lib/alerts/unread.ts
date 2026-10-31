/**
 * Uma regra de "alerta não lido" (Etapa 2, B16).
 *
 * O sino contava todo alerta das últimas 48 h (lido ou não) e o painel listava
 * todo alerta com `read_at` nulo (de qualquer idade) — e nada gravava
 * `read_at`. Dois números para a mesma pergunta, e nenhum caía ao ver.
 *
 * Agora: não lido = `read_at` nulo E criado nas últimas 48 h. Alerta de
 * glicemia é agudo; um aviso de cinco dias atrás não é "novidade" para o sino.
 * `read_at` é gravado quando a lista de alertas é aberta.
 */

export const JANELA_ALERTA_NAO_LIDO_H = 48;

export function inicioJanelaNaoLido(agora: Date = new Date()): string {
  return new Date(agora.getTime() - JANELA_ALERTA_NAO_LIDO_H * 3600_000).toISOString();
}

type FiltravelPorLeitura<Q> = {
  is(coluna: string, valor: null): Q;
  gte(coluna: string, valor: string): Q;
};

/** Aplica a regra a uma consulta de `metabolic_alerts`. */
export function somenteNaoLidos<Q extends FiltravelPorLeitura<Q>>(q: Q, agora: Date = new Date()): Q {
  return q.is("read_at", null).gte("created_at", inicioJanelaNaoLido(agora));
}
