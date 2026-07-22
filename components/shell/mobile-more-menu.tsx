"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { moreNav, groupNavItems, GROUP_LABEL } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const HIGHLIGHT = new Set(["/exames", "/analise"]);

const DEFAULT_TRIGGER = (
  <button
    type="button"
    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 md:hidden"
    aria-label="Abrir mais opções"
  >
    <Menu className="h-4 w-4" aria-hidden />
    Mais
  </button>
);

/**
 * Diálogo "Mais" com o restante da navegação — usado tanto no header (botão
 * dedicado) quanto na tab bar mobile (item da lista). Fica num só lugar para
 * o texto e a lista de itens não divergirem entre as duas entradas.
 */
export function MobileMoreMenu({
  trigger,
  open: openProp,
  onOpenChange,
}: {
  /** Elemento de gatilho custom (ex.: item da tab bar). Padrão: botão "Mais" do header. */
  trigger?: ReactNode;
  /** Estado controlado, para o chamador estilizar o próprio gatilho conforme aberto/fechado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const groups = groupNavItems(moreNav);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? DEFAULT_TRIGGER}</DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-4 sm:rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle>Mais no GLyX</DialogTitle>
          <DialogDescription>
            Exames (ECG / Raio-X), análise metabólica e o restante do app.
          </DialogDescription>
        </DialogHeader>
        <nav className="mt-2 grid gap-3">
          {groups.map(({ group, items }) => (
            <div key={group} className="grid gap-1">
              <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
                {GROUP_LABEL[group]}
              </p>
              {items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                const Icon = item.icon;
                const highlight = HIGHLIGHT.has(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                      active
                        ? "bg-zinc-800 text-white"
                        : highlight
                          ? "border border-emerald-600/40 bg-emerald-500/10 text-emerald-100"
                          : "text-zinc-300 hover:bg-zinc-900"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                    <span className="font-medium">{item.title}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
