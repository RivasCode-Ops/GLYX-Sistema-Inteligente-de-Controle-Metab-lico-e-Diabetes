/**
 * Resumo de "tem mais alguém usando o GLYX além de mim".
 *
 * O painel de administração já listava as contas, mas só respondia a quem
 * lembrasse de abri-lo — e mostrava contagem de registros, que não distingue
 * quem entrou uma vez e sumiu de quem está usando agora. Este resumo existe
 * para virar um aviso que aparece sozinho.
 *
 * Puro de propósito: a decisão de avisar é regra de produto e precisa de teste,
 * não de um banco ligado.
 */

export type AccountRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  disabled: boolean;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
};

export type OtherAccount = {
  id: string;
  label: string;
  disabled: boolean;
  /** Momento mais recente entre entrar no app e gravar algo. */
  lastSeenAt: string | null;
  /** O que gerou esse momento — entrar e registrar dizem coisas diferentes. */
  lastSeenKind: "registro" | "acesso" | null;
};

export type OtherAccountsSummary = {
  /** Contas ativas além da sua. É o número que dispara o aviso. */
  active: number;
  /** Já desativadas: continuam listadas, mas não alarmam. */
  disabled: number;
  /** Ativas, da mais recentemente vista para a mais antiga. */
  accounts: OtherAccount[];
};

function latest(row: AccountRow): { at: string | null; kind: OtherAccount["lastSeenKind"] } {
  const sign = row.last_sign_in_at;
  const act = row.last_activity_at;
  if (!sign && !act) return { at: null, kind: null };
  if (!act) return { at: sign, kind: "acesso" };
  if (!sign) return { at: act, kind: "registro" };
  // Empate vai para "registro": gravar dado é sinal mais forte de uso real do
  // que apenas ter uma sessão aberta.
  return Date.parse(act) >= Date.parse(sign)
    ? { at: act, kind: "registro" }
    : { at: sign, kind: "acesso" };
}

/**
 * `selfId` sai da lista porque o dono não é "outra pessoa". Outros admins
 * continuam contando: o aviso é sobre quem tem acesso, não sobre privilégio.
 */
export function summarizeOtherAccounts(
  rows: AccountRow[],
  selfId: string
): OtherAccountsSummary {
  const others = rows.filter((r) => r.id !== selfId);

  const accounts: OtherAccount[] = others
    .filter((r) => !r.disabled)
    .map((r) => {
      const { at, kind } = latest(r);
      return {
        id: r.id,
        label: r.full_name?.trim() || r.email?.trim() || "conta sem identificação",
        disabled: r.disabled,
        lastSeenAt: at,
        lastSeenKind: kind,
      };
    })
    .sort((a, b) => {
      // Nunca visto vai para o fim: sem data, não há o que comparar, e a
      // pergunta do aviso é "quem esteve aqui mais recentemente".
      if (!a.lastSeenAt && !b.lastSeenAt) return 0;
      if (!a.lastSeenAt) return 1;
      if (!b.lastSeenAt) return -1;
      return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
    });

  return {
    active: accounts.length,
    disabled: others.filter((r) => r.disabled).length,
    accounts,
  };
}

/** Texto curto de "há quanto tempo", sem dependência de biblioteca de data. */
export function sinceLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "nunca usou";
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? "há 1 mês" : `há ${months} meses`;
}
