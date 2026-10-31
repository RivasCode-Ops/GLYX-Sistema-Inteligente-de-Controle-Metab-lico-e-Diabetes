import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { AppHeader } from "@/components/shell/app-header";
import { MetabolicChatFab } from "@/components/ia/metabolic-chat-fab";
import { CriticalAlarm } from "@/components/push/critical-alarm";
import { SessionGuard } from "@/components/shell/session-guard";
import { SetupBanner } from "@/components/setup-banner";
import { ToastProvider } from "@/components/ui/toast-provider";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { somenteNaoLidos } from "@/lib/alerts/unread";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
  let unreadAlerts = 0;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        isAdmin = data?.is_admin ?? false;

        // Contagem para o sino do cabeçalho. Falha aqui deixa o sino apagado,
        // que é o estado honesto de "não sei" — nunca um número inventado.
        // Regra única de "não lido" (B16): cai a zero ao abrir os alertas.
        const { count } = await somenteNaoLidos(
          supabase
            .from("metabolic_alerts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
        );
        unreadAlerts = count ?? 0;
      }
    }
  }

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        <SessionGuard />
        <AppSidebar className="hidden md:flex" isAdmin={isAdmin} />
        <div className="flex min-h-dvh flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <SetupBanner />
          <AppHeader unreadAlerts={unreadAlerts} />
          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
          <footer className="px-4 pb-4 pt-2 text-center text-xs text-zinc-600 md:px-8 md:text-left">
            © {new Date().getFullYear()} Riva&apos;s Alexandre
          </footer>
        </div>
        <MobileTabBar className="md:hidden" />
        <MetabolicChatFab />
        <CriticalAlarm />
      </div>
    </ToastProvider>
  );
}
