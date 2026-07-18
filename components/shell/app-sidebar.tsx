"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNav, groupNavItems, GROUP_LABEL } from "@/lib/navigation";
import { SignOutButton } from "@/components/shell/sign-out-button";

export function AppSidebar({ className, isAdmin }: { className?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const groups = groupNavItems(mainNav);

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 flex h-dvh w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-zinc-800/80 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-900 to-emerald-900 shadow-inner shadow-black/40">
          <Activity className="h-5 w-5 text-emerald-300" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-zinc-50">GLYX</p>
          <p className="text-[11px] text-zinc-500">Inteligência metabólica</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {groups.map(({ group, items }) => (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
              {GROUP_LABEL[group]}
            </p>
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-zinc-800/90 text-white shadow-sm shadow-black/30"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
        {isAdmin ? (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              pathname.startsWith("/admin")
                ? "bg-zinc-800/90 text-white shadow-sm shadow-black/30"
                : "text-amber-400/90 hover:bg-zinc-900 hover:text-amber-300"
            )}
          >
            <ShieldCheck className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span>Admin</span>
          </Link>
        ) : null}
      </nav>
      <div className="mt-auto space-y-3 border-t border-zinc-800/80 p-3">
        <SignOutButton />
        <p className="text-[11px] leading-relaxed text-zinc-500">
          GLYX oferece orientações gerais. Não substitui avaliação médica.
        </p>
        <p className="text-[11px] text-zinc-600">© {new Date().getFullYear()} Riva&apos;s Alexandre</p>
      </div>
    </aside>
  );
}
