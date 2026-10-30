/**
 * Banco FALSO, em memória, para testar o registro de dose (D14/P45). Só para
 * testes. Nenhuma rede, nenhum dado real.
 *
 * Imita o que importa da migration `20261015101000`:
 *  - `novo`: colunas `client_request_id`, `correcao_pedido`, `correcoes`; índice
 *    do pedido; índice de dose única só para linhas criadas a partir do corte;
 *    gatilho (created_at do servidor, histórico de correção); rótulo `adicional`.
 *  - `antigo`: nada disso — select das colunas novas devolve 42703, insert/update
 *    com elas devolve PGRST204, rótulo `adicional` viola o CHECK (23514).
 *
 * Cada operação cede a vez ao laço de eventos, então duas chamadas em
 * `Promise.all` se intercalam como dois pedidos simultâneos. Isto imita a
 * CORRIDA dentro de um processo; não substitui o teste em Postgres real com
 * duas sessões.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Linha = Record<string, unknown> & { id: string };
type Erro = { code: string; message: string; details?: string | null; hint?: string | null } | null;

const COLUNAS_NOVAS = ["client_request_id", "correcao_pedido", "correcoes"];
const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

export function bancoFalsoDeDoses(op: {
  modo: "novo" | "antigo";
  med: Record<string, unknown>;
  /** Corte do índice prospectivo (só no modo novo). */
  corte?: Date;
  timezone?: string;
  agora?: () => Date;
}) {
  const logs: Linha[] = [];
  let seq = 0;
  const agora = op.agora ?? (() => new Date());
  const corte = op.corte ?? new Date(0);

  function criarLinha(l: Record<string, unknown>): Erro {
    if (op.modo === "antigo") {
      const nova = Object.keys(l).find((k) => COLUNAS_NOVAS.includes(k));
      if (nova) return { code: "PGRST204", message: `Could not find the '${nova}' column of 'medication_logs' in the schema cache` };
      if (l.adherence_status === "adicional") {
        return {
          code: "23514",
          message: 'new row for relation "medication_logs" violates check constraint "medication_logs_adherence_status_check"',
          details: "Failing row contains (…).",
          hint: null,
        };
      }
      logs.push({ ...l, id: `log-${++seq}`, created_at: agora().toISOString() });
      return null;
    }
    const linha: Linha = { ...l, id: `log-${++seq}`, created_at: agora().toISOString(), correcoes: [], correcao_pedido: null };
    if (linha.client_request_id && logs.some((x) => x.user_id === linha.user_id && x.client_request_id === linha.client_request_id)) {
      return {
        code: "23505",
        message: 'duplicate key value violates unique constraint "medication_logs_pedido_unico"',
        details: "Key (user_id, client_request_id)=(…, …) already exists.",
        hint: null,
      };
    }
    const noIndice = (x: Record<string, unknown>) =>
      x.confirmed === true && x.scheduled_for != null && new Date(x.created_at as string) >= corte;
    if (
      noIndice(linha) &&
      logs.some(
        (x) =>
          noIndice(x) && x.user_id === linha.user_id && x.medication_id === linha.medication_id && x.scheduled_for === linha.scheduled_for
      )
    ) {
      return {
        code: "23505",
        message: 'duplicate key value violates unique constraint "medication_logs_dose_confirmada_unica"',
        details: "Key (user_id, medication_id, scheduled_for)=(…, …, …) already exists.",
        hint: null,
      };
    }
    logs.push(linha);
    return null;
  }

  function atualizar(alvo: Linha, v: Record<string, unknown>): Erro {
    if (op.modo === "antigo" && Object.keys(v).some((k) => COLUNAS_NOVAS.includes(k))) {
      return { code: "PGRST204", message: "Could not find the 'correcao_pedido' column of 'medication_logs' in the schema cache" };
    }
    const clinicos = ["taken_at", "scheduled_for", "adherence_status", "confirmed"];
    const mudou = clinicos.some((k) => k in v && v[k] !== alvo[k]);
    if (op.modo === "novo" && mudou) {
      alvo.correcoes = [
        ...((alvo.correcoes as unknown[]) ?? []),
        {
          em: agora().toISOString(),
          pedido: v.correcao_pedido ?? null,
          taken_at_anterior: alvo.taken_at,
          scheduled_for_anterior: alvo.scheduled_for,
          rotulo_anterior: alvo.adherence_status,
          confirmed_anterior: alvo.confirmed,
        },
      ];
      for (const k of clinicos) if (k in v) alvo[k] = v[k];
      alvo.correcao_pedido = v.correcao_pedido ?? null;
    }
    return null;
  }

  const from = (tabela: string) => {
    const filtros: [string, unknown][] = [];
    let colunas = "*";
    let atualizacao: Record<string, unknown> | null = null;
    const casa = (l: Record<string, unknown>) => filtros.every(([k, v]) => l[k] === v);
    const resolverLista = async () => {
      await ceder();
      if (tabela === "medication_logs" && op.modo === "antigo") {
        const nova = COLUNAS_NOVAS.find((c) => colunas.includes(c) || filtros.some(([k]) => k === c));
        if (nova) return { data: null, error: { code: "42703", message: `column medication_logs.${nova} does not exist` } };
      }
      if (atualizacao) {
        const alvo = logs.find(casa);
        return { data: null, error: alvo ? atualizar(alvo, atualizacao) : null };
      }
      if (tabela === "medications") return { data: [op.med].filter(casa), error: null };
      if (tabela === "profiles") return { data: [{ timezone: op.timezone ?? "America/Sao_Paulo" }], error: null };
      return { data: logs.filter(casa).map((l) => ({ ...l })), error: null };
    };
    const b = {
      select: (c?: string) => ((colunas = c ?? "*"), b),
      eq: (k: string, v: unknown) => (tabela === "profiles" ? b : (filtros.push([k, v]), b)),
      order: () => b,
      limit: () => b,
      maybeSingle: async () => {
        const r = await resolverLista();
        return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error };
      },
      update: (v: Record<string, unknown>) => ((atualizacao = v), b),
      insert: async (l: Record<string, unknown>) => {
        await ceder();
        return { error: criarLinha(l) };
      },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolverLista().then(ok, falha),
    };
    return b;
  };

  return {
    cliente: { from, auth: { getUser: async () => ({ data: { user: { id: "pessoa-sintetica" } } }) } } as unknown as SupabaseClient,
    logs,
  };
}
