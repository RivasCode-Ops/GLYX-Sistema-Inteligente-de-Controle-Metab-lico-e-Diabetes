/**
 * Circuit breaker para sync LibreLinkUp — lógica pura (testável).
 * O cron pula conexões com circuito aberto; sync manual do usuário ainda tenta.
 */

export type CgmErrorKind =
  | "auth"
  | "rate_limit"
  | "unavailable"
  | "client_version"
  | "crypto"
  | "unknown";

export type BreakerSnapshot = {
  consecutive_failures: number;
  circuit_open_until: string | null;
  last_error_kind: CgmErrorKind | null;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

export function classifyCgmError(message: string): CgmErrorKind {
  const m = message.toLowerCase();
  if (/senha|e-mail ou senha|incorret|credencial|reconecte o sensor informando/i.test(message)) {
    return "auth";
  }
  if (/unsupported state|unable to authenticate data|bad decrypt|criptografia/i.test(m)) {
    return "crypto";
  }
  if (/limitou as tentativas|429|rate.?limit/i.test(m)) {
    return "rate_limit";
  }
  if (/versão mais nova|status 920|minimumversion|cliente librelinkup/i.test(m)) {
    return "client_version";
  }
  if (/indisponível|http 5|falha ao ler|rede|timeout|timed out|abort/i.test(m)) {
    return "unavailable";
  }
  return "unknown";
}

/** Backoff em ms conforme severidade e número de falhas seguidas. */
export function backoffMs(failures: number, kind: CgmErrorKind): number {
  const n = Math.max(1, failures);
  switch (kind) {
    case "auth":
      // Não martelar senha errada — abre cedo e por bastante tempo.
      return n >= 2 ? 6 * HOUR : 1 * HOUR;
    case "crypto":
      return 12 * HOUR;
    case "client_version":
      return 6 * HOUR;
    case "rate_limit":
      return Math.min(2 * HOUR, 15 * MIN * Math.min(n, 6));
    case "unavailable":
      return Math.min(2 * HOUR, 10 * MIN * 2 ** Math.min(n - 1, 4));
    default:
      return Math.min(2 * HOUR, 15 * MIN * Math.min(n, 6));
  }
}

export function isCircuitOpen(
  state: Pick<BreakerSnapshot, "circuit_open_until">,
  now = Date.now()
): boolean {
  if (!state.circuit_open_until) return false;
  return new Date(state.circuit_open_until).getTime() > now;
}

export function breakerAfterSuccess(): BreakerSnapshot {
  return {
    consecutive_failures: 0,
    circuit_open_until: null,
    last_error_kind: null,
  };
}

/**
 * Mesmo cálculo de breakerAfterFailure, mas recebendo a contagem de falhas
 * JÁ incrementada (ex.: por um UPDATE atômico no banco) em vez de somar 1
 * aqui — usar quando o +1 precisa ser atômico no servidor para não perder
 * incrementos em chamadas concorrentes (duplo clique, app + aba abertos).
 */
export function breakerStateForCount(
  consecutive: number,
  errorMessage: string,
  now = Date.now()
): { state: BreakerSnapshot; shouldAlertOps: boolean; kind: CgmErrorKind } {
  const kind = classifyCgmError(errorMessage);
  const openMs = backoffMs(consecutive, kind);
  const openUntil = new Date(now + openMs).toISOString();
  // Alerta ops em falhas “duras” ou marcos (1ª / 3ª / 5ª), não a cada retry curto.
  const shouldAlertOps =
    kind === "auth" ||
    kind === "crypto" ||
    kind === "client_version" ||
    consecutive === 1 ||
    consecutive === 3 ||
    consecutive === 5;

  return {
    kind,
    shouldAlertOps,
    state: {
      consecutive_failures: consecutive,
      circuit_open_until: openUntil,
      last_error_kind: kind,
    },
  };
}

export function breakerAfterFailure(
  prev: Pick<BreakerSnapshot, "consecutive_failures">,
  errorMessage: string,
  now = Date.now()
): { state: BreakerSnapshot; shouldAlertOps: boolean; kind: CgmErrorKind } {
  return breakerStateForCount((prev.consecutive_failures ?? 0) + 1, errorMessage, now);
}

export function circuitOpenUserMessage(openUntilIso: string, kind: CgmErrorKind | null): string {
  const when = new Date(openUntilIso).toLocaleString("pt-BR");
  if (kind === "auth" || kind === "crypto") {
    return `Sincronização automática pausada até ${when}. Reconecte com a senha correta do LibreLinkUp.`;
  }
  if (kind === "rate_limit") {
    return `A Abbott limitou tentativas — pausamos o sync automático até ${when}.`;
  }
  if (kind === "client_version") {
    return `A API do Libre exige atualização do cliente. Sync automático pausado até ${when}.`;
  }
  return `Sincronização automática em pausa (proteção) até ${when}. Você ainda pode tentar manualmente.`;
}
