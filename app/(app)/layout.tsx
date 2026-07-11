import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { AppHeader } from "@/components/shell/app-header";
import { SetupBanner } from "@/components/setup-banner";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar className="hidden md:flex" />
      <div className="flex min-h-dvh flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <SetupBanner />
        <AppHeader />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </div>
      <MobileTabBar className="md:hidden" />
    </div>
  );
}
