"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { mainNav } from "@/lib/navigation";
import { ModuleSubnav } from "@/components/shell/module-subnav";
import { SignOutButton } from "@/components/shell/sign-out-button";

function titleForPath(pathname: string): { title: string; crumbs: string[] } {
  if (pathname === "/dashboard")
    return { title: "Painel metabólico", crumbs: ["Painel"] };

  const segments = pathname.split("/").filter(Boolean);
  const rootHref = `/${segments[0]}`;
  const rootItem = mainNav.find((n) => n.href === rootHref);

  const crumbs: string[] = [];
  if (rootItem) crumbs.push(rootItem.title);

  if (segments.length > 1) {
    const rest = segments.slice(1).join(" / ");
    crumbs.push(rest.replace(/-/g, " "));
  }

  return {
    title: rootItem?.title ?? "GLYX",
    crumbs,
  };
}

export function AppHeader() {
  const pathname = usePathname();
  const { title, crumbs } = titleForPath(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 px-4 py-3 backdrop-blur-xl md:px-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-500">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
                <span className={i === crumbs.length - 1 ? "text-zinc-300" : ""}>
                  {c}
                </span>
              </span>
            ))}
          </div>
          {/* No desktop o "Sair" fica na sidebar; no mobile ela não existe. */}
          <div className="md:hidden">
            <SignOutButton compact />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50 md:text-2xl">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              {pathname === "/dashboard"
                ? "Visão geral do seu dia — aprofunde em cada módulo ao lado ou abaixo."
                : "Experiência dedicada deste domínio. Use as abas para navegar dentro do módulo."}
            </p>
          </div>
        </div>
        <ModuleSubnav />
      </div>
    </header>
  );
}
