"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getModuleKeyFromPath, moduleSubNav } from "@/lib/navigation";

export function ModuleSubnav() {
  const pathname = usePathname();
  const key = getModuleKeyFromPath(pathname);
  if (!key) return null;

  const items = moduleSubNav[key];
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 scrollbar-thin md:flex-wrap">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== key && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-emerald-600/25 text-emerald-200 ring-1 ring-emerald-500/40"
                : "bg-zinc-900/60 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </div>
  );
}
