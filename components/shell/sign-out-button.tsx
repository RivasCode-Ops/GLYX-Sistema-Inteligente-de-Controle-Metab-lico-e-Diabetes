"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";

async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      /* sessão já morta no servidor — os cookies locais são limpos mesmo assim */
    }
  }
  // Navegação completa (não router.push): descarta qualquer estado antigo do
  // app — importante no PWA, onde a página pode estar viva há dias.
  window.location.assign("/login");
}

export function SignOutButton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Sair da conta"
        title="Sair"
        className="h-9 w-9 shrink-0 p-0 text-zinc-400 hover:text-zinc-100"
        onClick={() => void signOut()}
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start text-zinc-400 hover:text-zinc-100"
      onClick={() => void signOut()}
    >
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );
}
