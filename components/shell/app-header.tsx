"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, User } from "lucide-react";
import { mainNav } from "@/lib/navigation";
import { ModuleSubnav } from "@/components/shell/module-subnav";
import { MobileMoreMenu } from "@/components/shell/mobile-more-menu";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { FeatureSearch } from "@/components/shell/feature-search";

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

export function AppHeader({ unreadAlerts = 0 }: { unreadAlerts?: number }) {
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
          <div className="flex items-center gap-2">
            {/* A lupa fica nas duas larguras: "onde acho isso" é pergunta de
                quem não conhece o app, e não muda de natureza no desktop. */}
            <FeatureSearch />

            {/* Sino e avatar, das referências. O sino só existe porque tem o
                que dizer: o ponto acende a partir de alerta metabólico não lido
                das últimas 48h, e leva para a lista. Sino que nunca muda é
                ícone decorativo, e o sistema visual proíbe ícone sem função. */}
            <Link
              href="/analise/alertas"
              aria-label={
                unreadAlerts > 0
                  ? `${unreadAlerts} alerta(s) recente(s)`
                  : "Alertas — nenhum recente"
              }
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Bell className="h-4 w-4" aria-hidden />
              {unreadAlerts > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-severity-atencao ring-2 ring-zinc-950" />
              ) : null}
            </Link>

            <Link
              href="/perfil"
              aria-label="Perfil e conta"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <User className="h-4 w-4" aria-hidden />
            </Link>

            {/* No desktop o "Sair" fica na sidebar; no mobile ela não existe. */}
            <span className="flex items-center gap-2 md:hidden">
              <MobileMoreMenu />
              <SignOutButton compact />
            </span>
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
