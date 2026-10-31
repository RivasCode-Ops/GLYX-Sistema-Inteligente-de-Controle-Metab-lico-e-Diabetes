import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { AiUsageCard } from "@/components/perfil/ai-usage-card";
import { AiSuggestionConsent } from "@/components/perfil/ai-suggestion-consent";
import { ChangePasswordCard } from "@/components/perfil/change-password-card";
import { DataPrivacySection } from "@/components/perfil/data-privacy-section";
import { OtherAccountsNotice } from "@/components/admin/other-accounts-notice";
import {
  summarizeOtherAccounts,
  type AccountRow,
  type OtherAccountsSummary,
} from "@/lib/admin/other-accounts";

// Aba Conta & privacidade: acessos, senha, uso de IA e LGPD (exportar/apagar
// dados). Em demo não há conta real, então nada a mostrar aqui.
//
// O aviso de "outra conta tem acesso" veio do Painel metabólico. Ele é
// administrativo — não responde "o que eu faço agora" —, e no painel ocupava a
// melhor posição da tela com um evento de um mês atrás. Aqui ele fica ao lado
// das outras decisões de conta, que é onde a pessoa vai quando quer resolver
// acesso.
export default async function PerfilContaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-sm text-zinc-500">
          Segurança e privacidade da conta aparecem aqui quando o Supabase está configurado (login
          real).
        </p>
      </div>
    );
  }

  let otherAccounts: OtherAccountsSummary | null = null;
  let sugestaoIa = { ativo: false, disponivel: false };
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Sem a coluna (migration 20261031102000 não aplicada), a consulta falha:
      // a tela mostra "desligada" e não oferece o botão.
      const { data: consent, error: erroConsent } = await supabase
        .from("profiles")
        .select("ia_sugestao_automatica")
        .eq("id", user.id)
        .maybeSingle();
      sugestaoIa = {
        ativo: Boolean(consent?.ia_sugestao_automatica),
        disponivel: !erroConsent,
      };
      const { data: p } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      // A RPC recusa qualquer chamador que não seja admin. Falha aqui não pode
      // derrubar a tela de conta inteira.
      if (p?.is_admin) {
        const { data: rows, error } = await supabase.rpc("admin_user_stats");
        if (!error && rows) {
          otherAccounts = summarizeOtherAccounts(rows as AccountRow[], user.id);
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {otherAccounts ? <OtherAccountsNotice summary={otherAccounts} /> : null}
      <ChangePasswordCard />
      <AiUsageCard />
      <AiSuggestionConsent ativo={sugestaoIa.ativo} disponivel={sugestaoIa.disponivel} />
      <DataPrivacySection />
    </div>
  );
}
