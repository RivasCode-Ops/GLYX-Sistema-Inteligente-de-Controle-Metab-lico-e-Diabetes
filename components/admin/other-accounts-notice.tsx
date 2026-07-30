import Link from "next/link";
import { sinceLabel, type OtherAccountsSummary } from "@/lib/admin/other-accounts";

/**
 * Aviso de que existe conta além da do dono.
 *
 * Fica no painel inicial, não no /admin: a informação só serve se encontrar a
 * pessoa, e o painel de administração só é visto por quem já foi procurar.
 *
 * Não some sozinho e não tem botão de dispensar — sumir é consequência de
 * resolver (desativar ou excluir a conta), nunca de ignorar.
 */
export function OtherAccountsNotice({ summary }: { summary: OtherAccountsSummary }) {
  if (summary.active === 0) return null;

  const plural = summary.active > 1;

  return (
    <section
      aria-label="Outras contas com acesso"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-amber-200">
          {plural
            ? `${summary.active} contas além da sua têm acesso ao GLYX`
            : "Outra conta tem acesso ao GLYX"}
        </p>
        <Link href="/admin" className="text-xs text-amber-300 underline underline-offset-2">
          Gerenciar acessos →
        </Link>
      </div>

      <ul className="mt-3 space-y-1.5">
        {summary.accounts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-mono text-zinc-300">{a.label}</span>
            <span className="text-zinc-500">
              {a.lastSeenKind === "registro"
                ? `registrou algo ${sinceLabel(a.lastSeenAt)}`
                : a.lastSeenKind === "acesso"
                  ? `entrou ${sinceLabel(a.lastSeenAt)}`
                  : "nunca usou"}
            </span>
          </li>
        ))}
      </ul>

      {summary.disabled > 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          {summary.disabled === 1
            ? "1 conta já desativada não aparece aqui."
            : `${summary.disabled} contas já desativadas não aparecem aqui.`}
        </p>
      ) : null}
    </section>
  );
}
