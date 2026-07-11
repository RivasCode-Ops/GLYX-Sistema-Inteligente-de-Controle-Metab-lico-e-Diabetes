import { isSupabaseConfigured } from "@/lib/env";

export function SetupBanner() {
  if (isSupabaseConfigured()) return null;
  return (
    <div className="border-b border-amber-900/50 bg-amber-950/50 px-4 py-2 text-center text-[13px] text-amber-100">
      <strong className="font-medium">Modo demonstração:</strong> configure{" "}
      <code className="rounded bg-black/30 px-1 font-mono text-xs">.env.local</code> com Supabase
      para persistência e login. Sem isso, as telas carregam dados simulados onde aplicável.
    </div>
  );
}
