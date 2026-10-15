/**
 * Como os registros de dose são contados e mostrados (D14/P45).
 *
 * - REENVIO não é tomada: desde 15/10 o app não grava reenvio (pedido
 *   idempotente). No histórico ANTERIOR há linhas idênticas — mesmo item, mesmo
 *   instante ao milissegundo, mesma confirmação — que são a mesma afirmação
 *   repetida; contam UMA vez. Linhas com instantes diferentes NÃO são fundidas:
 *   podem ser correção ou outra tomada, e esconder isso falsearia o histórico.
 * - TOMADA ADICIONAL (rótulo `adicional`) aparece como tomada e como "a mais"
 *   na adesão — nunca é escondida para a adesão parecer 100%.
 * - CORREÇÃO: a linha mostra o horário corrigido e avisa que foi corrigida; o
 *   valor anterior está em `correcoes` (preenchido pelo banco).
 */

export type RegistroDeDose = {
  medication_id?: string | null;
  taken_at: string;
  confirmed?: boolean | null;
  adherence_status?: string | null;
  /** Só existe depois da migration 20261015101000. */
  correcoes?: unknown[] | null;
};

const chave = (r: RegistroDeDose) =>
  `${r.medication_id ?? ""}|${new Date(r.taken_at).getTime()}|${r.confirmed === false ? "0" : "1"}`;

/** Remove só repetições IDÊNTICAS. Devolve quantas foram fundidas, para poder dizer isso. */
export function consolidarRegistrosDeDose<T extends RegistroDeDose>(
  registros: T[]
): { registros: T[]; repeticoesIdenticas: number } {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const r of registros) {
    const k = chave(r);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(r);
  }
  return { registros: saida, repeticoesIdenticas: registros.length - saida.length };
}

/** Quantas tomadas (confirmadas) os registros representam — sem contar repetição idêntica. */
export function contarTomadas(registros: RegistroDeDose[]): number {
  return consolidarRegistrosDeDose(registros).registros.filter((r) => r.confirmed !== false).length;
}

/** Marcação curta para o histórico; nula quando é uma tomada comum. */
export function marcacaoDoRegistro(r: RegistroDeDose): string | null {
  if (r.confirmed === false) return "pulada";
  if (r.adherence_status === "adicional") return "tomada adicional";
  if (Array.isArray(r.correcoes) && r.correcoes.length > 0) return "horário corrigido";
  return null;
}
