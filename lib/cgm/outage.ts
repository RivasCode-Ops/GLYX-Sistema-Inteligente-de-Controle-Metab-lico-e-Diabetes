/**
 * Distingue **quebra do provedor** de **problema individual do usuário**.
 *
 * O circuit breaker já protege cada conexão, mas o alerta é por usuário: com a
 * API não oficial do Libre mudando (o que acontece), o operador recebe N
 * alertas idênticos e nenhum deles diz a única coisa que importa — que não é
 * culpa de ninguém, é a Abbott que mexeu. É esse sinal que este arquivo produz.
 *
 * A regra central é conservadora de propósito, e a assimetria é intencional:
 *
 * - Errar para "quebra do provedor" quando era senha errada custa um alerta
 *   inútil ao operador.
 * - Errar para "problema seu" quando a API mudou custa ao usuário reconferir
 *   uma senha correta várias vezes, concluir que o app está quebrado, e perder
 *   dias de leitura sem saber que existe o import por CSV.
 *
 * Por isso `auth` e `crypto` **nunca** disparam quebra sistêmica sozinhos: são
 * individualmente acionáveis (senha, chave) e o falso positivo mandaria o
 * usuário certo trocar uma senha certa.
 */

import type { CgmErrorKind } from "@/lib/cgm/circuit-breaker";

export type SyncFailure = {
  userId: string;
  provider: string;
  kind: CgmErrorKind;
};

export type OutageVerdict = {
  isOutage: boolean;
  provider: string;
  kind: CgmErrorKind | null;
  affectedUsers: number;
  attemptedUsers: number;
  reason: string;
};

/** Mínimo de usuários distintos para considerar quebra por indisponibilidade. */
export const MIN_USERS_FOR_OUTAGE = 2;

/**
 * Tipos que, sozinhos, já indicam mudança do lado do provedor.
 * `client_version` é o caso clássico: a API passou a exigir um cliente mais
 * novo. Nenhuma ação do usuário resolve, e esperar 2 usuários falharem só
 * atrasa o diagnóstico em contas com um piloto só.
 */
const PROVIDER_SIDE_KINDS: CgmErrorKind[] = ["client_version"];

/** Tipos que indicam quebra quando atingem vários usuários ao mesmo tempo. */
const SYSTEMIC_WHEN_WIDESPREAD: CgmErrorKind[] = ["unavailable", "rate_limit", "unknown"];

/**
 * Avalia as falhas de UMA execução do cron, para UM provedor.
 *
 * `attemptedUsers` é quantas conexões daquele provedor foram efetivamente
 * tentadas na rodada — sem esse denominador, "3 usuários falharam" não
 * distingue 3 de 3 (quebra) de 3 de 300 (ruído).
 */
export function detectProviderOutage(
  failures: SyncFailure[],
  provider: string,
  attemptedUsers: number
): OutageVerdict {
  const own = failures.filter((f) => f.provider === provider);
  const affectedUsers = new Set(own.map((f) => f.userId)).size;

  const base = { provider, affectedUsers, attemptedUsers };

  if (!own.length) {
    return { ...base, isOutage: false, kind: null, reason: "Nenhuma falha nesta rodada." };
  }

  const providerSide = own.find((f) => PROVIDER_SIDE_KINDS.includes(f.kind));
  if (providerSide) {
    return {
      ...base,
      isOutage: true,
      kind: providerSide.kind,
      reason:
        "A API recusou o cliente atual (client_version). Isso muda do lado do provedor e nenhuma ação do usuário resolve.",
    };
  }

  // Conta por tipo: uma rodada pode misturar senha errada de um com rede caída
  // de outro, e só o tipo predominante caracteriza a quebra.
  const byKind = new Map<CgmErrorKind, Set<string>>();
  for (const f of own) {
    if (!SYSTEMIC_WHEN_WIDESPREAD.includes(f.kind)) continue;
    const set = byKind.get(f.kind) ?? new Set<string>();
    set.add(f.userId);
    byKind.set(f.kind, set);
  }

  let worstKind: CgmErrorKind | null = null;
  let worstCount = 0;
  for (const [kind, users] of byKind) {
    if (users.size > worstCount) {
      worstKind = kind;
      worstCount = users.size;
    }
  }

  if (
    worstKind &&
    worstCount >= MIN_USERS_FOR_OUTAGE &&
    attemptedUsers > 0 &&
    worstCount >= attemptedUsers / 2
  ) {
    return {
      ...base,
      isOutage: true,
      kind: worstKind,
      reason: `${worstKind} atingiu ${worstCount} de ${attemptedUsers} conexões tentadas na mesma rodada — padrão de indisponibilidade do provedor, não de conta individual.`,
    };
  }

  return {
    ...base,
    isOutage: false,
    kind: worstKind,
    reason: "Falhas isoladas ou individualmente acionáveis (senha, chave, conta).",
  };
}

/**
 * O erro do usuário aponta para o lado do provedor? Usado na tela de Conexões
 * para oferecer o import por CSV em vez de mandar reconferir a senha.
 *
 * Aceita `string` porque é o que a coluna `last_error_kind` devolve: `text` com
 * CHECK. Comparar contra os literais aqui é mais honesto que um cast na
 * chamada, que só esconderia um valor inesperado vindo do banco.
 */
export function looksLikeProviderIssue(kind: string | null | undefined): boolean {
  return kind === "client_version" || kind === "unavailable";
}
