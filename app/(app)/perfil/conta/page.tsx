import { isSupabaseConfigured } from "@/lib/env";
import { AiUsageCard } from "@/components/perfil/ai-usage-card";
import { ChangePasswordCard } from "@/components/perfil/change-password-card";
import { DataPrivacySection } from "@/components/perfil/data-privacy-section";

// Aba Conta & privacidade: senha, uso de IA e LGPD (exportar/apagar dados).
// Em demo não há conta real, então nada a mostrar aqui.
export default function PerfilContaPage() {
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <ChangePasswordCard />
      <AiUsageCard />
      <DataPrivacySection />
    </div>
  );
}
