import type { ResultadoEntrega } from "./send";

/**
 * Desfecho de cada alarme despachado, a partir das tentativas por assinatura.
 *
 * Um alarme (`push_dispatch_log.id`) vai para todas as assinaturas do usuário
 * — um aparelho por assinatura. Ele chegou se chegou a QUALQUER aparelho.
 * Se todas as assinaturas estavam mortas, não há para onde reenviar
 * (`sem_assinatura`). Qualquer outra combinação é falha transitória e o banco
 * reenvia na próxima rodada, dentro do limite de tentativas e da validade.
 */

export type StatusDespacho = "enviado" | "falhou" | "sem_assinatura";

export type Desfecho = { id: string; status: StatusDespacho; erro: string | null };

export function consolidarDespachos(
  tentativas: readonly { dispatchId: string | null | undefined; resultado: ResultadoEntrega }[]
): Desfecho[] {
  const porId = new Map<string, ResultadoEntrega[]>();
  for (const t of tentativas) {
    if (!t.dispatchId) continue; // despachantes antigos (dica, água) não pedem confirmação
    const lista = porId.get(t.dispatchId) ?? [];
    lista.push(t.resultado);
    porId.set(t.dispatchId, lista);
  }

  const out: Desfecho[] = [];
  for (const [id, rs] of porId) {
    if (rs.some((r) => r.entregue)) {
      out.push({ id, status: "enviado", erro: null });
      continue;
    }
    const falhas = rs.filter((r): r is Extract<ResultadoEntrega, { entregue: false }> => !r.entregue);
    if (falhas.every((r) => r.morta)) {
      out.push({ id, status: "sem_assinatura", erro: "todas as assinaturas expiraram" });
      continue;
    }
    const motivo = falhas.find((r) => !r.morta)?.motivo ?? "falha desconhecida";
    out.push({ id, status: "falhou", erro: motivo.slice(0, 200) });
  }
  return out;
}
