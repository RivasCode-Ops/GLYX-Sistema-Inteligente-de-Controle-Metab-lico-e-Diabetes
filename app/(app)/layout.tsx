import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { AppHeader } from "@/components/shell/app-header";
import { SetupBanner } from "@/components/setup-banner";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
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
      }
    }
  }

  return (
    <div className="flex min-h-dvh">
      <AppSidebar className="hidden md:flex" isAdmin={isAdmin} />
      <div className="flex min-h-dvh flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <SetupBanner />
        <AppHeader />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </div>
      <MobileTabBar className="md:hidden" />
    </div>
  );
}
