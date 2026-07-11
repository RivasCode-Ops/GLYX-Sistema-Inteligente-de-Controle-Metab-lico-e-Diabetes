"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    if (!isSupabaseConfigured()) {
      router.refresh();
      return;
    }
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
