"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { mobileNav, moreNav } from "@/lib/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const HIGHLIGHT = new Set(["/exames", "/mapa-risco"]);

export function MobileTabBar({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = moreNav.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/90 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl",
        className
      )}
      aria-label="Navegação principal"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1 pt-2">
        {mobileNav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                  moreActive || open ? "text-emerald-400" : "text-zinc-500"
                )}
              >
                <Menu className="h-5 w-5" aria-hidden />
                <span className="truncate">Mais</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-4">
              <DialogHeader className="text-left">
                <DialogTitle>Mais</DialogTitle>
                <DialogDescription>
                  Exames (ECG / Raio-X), mapa de risco e outras áreas.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 grid gap-1">
                {moreNav.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  const highlight = HIGHLIGHT.has(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm",
                        active
                          ? "bg-zinc-800 text-white"
                          : highlight
                            ? "border border-emerald-600/40 bg-emerald-500/10 text-emerald-100"
                            : "text-zinc-300 hover:bg-zinc-900"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </li>
      </ul>
    </nav>
  );
}
