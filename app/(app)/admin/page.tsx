import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toggleUserDisabled } from "@/app/actions/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpendGauge } from "@/components/admin/spend-gauge";
import { estimateCostUsd } from "@/lib/ai/cost";

const DAILY_BUDGET_USD = Number(process.env.AI_DAILY_BUDGET_USD ?? "1");
const MONTHLY_BUDGET_USD = Number(process.env.AI_MONTHLY_BUDGET_USD ?? "20");

type UserStat = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  disabled: boolean;
  is_admin: boolean;
  glucose_count: number;
  meals_count: number;
  medications_count: number;
  ai_calls_7d: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
};

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/dashboard");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) redirect("/dashboard");

  async function toggleAction(formData: FormData): Promise<void> {
    "use server";
    await toggleUserDisabled(formData);
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, daySpendRes, monthSpendRes] = await Promise.all([
    supabase.rpc("admin_user_stats"),
    supabase.rpc("admin_ai_spend", { since: dayAgo }),
    supabase.rpc("admin_ai_spend", { since: monthAgo }),
  ]);

  const users = (usersRes.data ?? []) as UserStat[];
  const daySpend = daySpendRes.data?.[0] as
    | { calls: number; input_tokens: number; output_tokens: number }
    | undefined;
  const monthSpend = monthSpendRes.data?.[0] as
    | { calls: number; input_tokens: number; output_tokens: number }
    | undefined;

  const dayCost = estimateCostUsd(daySpend?.input_tokens ?? 0, daySpend?.output_tokens ?? 0);
  const monthCost = estimateCostUsd(monthSpend?.input_tokens ?? 0, monthSpend?.output_tokens ?? 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Painel de administração</h1>
        <p className="text-sm text-zinc-500">
          Visível só para contas admin. Mostra contagens e uso de IA — nunca o conteúdo de saúde de
          outros usuários.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Relógio de gastos (IA)</CardTitle>
          <CardDescription>
            Estimativa baseada no preço do Kimi K2.6 — a fatura real está no painel Moonshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-8 py-4">
          <SpendGauge
            label="Hoje"
            costUsd={dayCost}
            budgetUsd={DAILY_BUDGET_USD}
            calls={daySpend?.calls ?? 0}
          />
          <SpendGauge
            label="Últimos 30 dias"
            costUsd={monthCost}
            budgetUsd={MONTHLY_BUDGET_USD}
            calls={monthSpend?.calls ?? 0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários ({users.length})</CardTitle>
          <CardDescription>Cadastro, atividade e controle de acesso.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Usuário</th>
                <th className="py-2 pr-3">Desde</th>
                <th className="py-2 pr-3">Dados</th>
                <th className="py-2 pr-3">IA (7d)</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3">
                    <p className="text-zinc-200">{u.full_name ?? "—"}</p>
                    <p className="font-mono text-xs text-zinc-500">
                      {u.email ?? "—"} {u.is_admin ? "· admin" : ""}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-500">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-zinc-500">
                    {u.glucose_count}g · {u.meals_count}r · {u.medications_count}m
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-zinc-500">
                    {u.ai_calls_7d} chamadas
                  </td>
                  <td className="py-2.5 pr-3">
                    {u.disabled ? (
                      <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                        Desativado
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {u.is_admin ? (
                      <span className="text-xs text-zinc-600">—</span>
                    ) : (
                      <form action={toggleAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="disabled" value={(!u.disabled).toString()} />
                        <Button type="submit" variant="outline" size="sm">
                          {u.disabled ? "Reativar" : "Desativar"}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
