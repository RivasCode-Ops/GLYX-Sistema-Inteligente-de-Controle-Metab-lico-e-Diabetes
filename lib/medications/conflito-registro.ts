/**
 * Conflito de registro de dose na URL (D14/P45).
 *
 * Quando já existe tomada na mesma dose prevista, a tela leva a pessoa para
 * /medicacao com estes parâmetros e PERGUNTA: corrigir aquela tomada ou
 * registrar outra. Só identificadores e instantes — nenhum texto livre vai pela
 * URL, e tudo é validado na leitura.
 */
import { codigoDoErroDeRegistro, pedidoValido } from "./register-dose";

export type ConflitoNaUrl = {
  medicationId: string;
  /** Dose prevista disputada (ISO UTC). */
  scheduledFor: string;
  /** Instante que a pessoa quis registrar (ISO UTC). */
  takenAtPedido: string;
  /** Identidade da ação original — a resposta à pergunta reusa o mesmo pedido. */
  pedido: string | null;
};

const ID = /^[0-9a-f-]{36}$/i;
const instante = (v: string | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function urlDoConflito(c: ConflitoNaUrl): string {
  const q = new URLSearchParams({
    conflito: "1",
    med: c.medicationId,
    dose: c.scheduledFor,
    quando: c.takenAtPedido,
  });
  if (c.pedido) q.set("pedido", c.pedido);
  return `/medicacao?${q.toString()}`;
}

export function lerConflito(sp: Record<string, string | string[] | undefined>): ConflitoNaUrl | null {
  const um = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  if (um("conflito") !== "1") return null;
  const med = um("med");
  const dose = instante(um("dose"));
  const quando = instante(um("quando"));
  if (!med || !ID.test(med) || !dose || !quando) return null;
  const pedido = um("pedido");
  return { medicationId: med, scheduledFor: dose, takenAtPedido: quando, pedido: pedidoValido(pedido) ? pedido : null };
}

/**
 * Para onde a tela vai depois de registrar uma dose. Devolvido pela ação e
 * seguido pelo navegador (`FormularioDeAcao`), não por `redirect()` depois da
 * ação — no build de produção a navegação nem sempre se concluía e a pergunta
 * de conflito não abria (medido em 15/10/2026). Null = gravou; fica na tela.
 */
export function destinoAposRegistro(
  r: { error?: string; conflito?: ConflitoNaUrl },
  respondeuPergunta: boolean,
  voltaDoLogin: string
): string | null {
  // Já existe tomada nessa dose: a pessoa decide (corrigir ou outra tomada).
  if (r.conflito) return urlDoConflito(r.conflito);
  // Sessão expirada no clique: nada foi gravado; leva ao login em vez de calar.
  if (r.error === "Sessão expirada.") return `/login?next=${encodeURIComponent(voltaDoLogin)}`;
  // Qualquer falha volta à tela com o motivo (código fechado) — nunca em silêncio.
  if (r.error) return `/medicacao?registro_erro=${codigoDoErroDeRegistro(r.error) ?? "falha_gravacao"}`;
  // Resposta à pergunta de conflito: volta para a tela limpa.
  if (respondeuPergunta) return "/medicacao";
  return null;
}
