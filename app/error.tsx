"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-sm font-medium text-amber-400/90">Algo correu mal</p>
      <h1 className="mt-2 text-xl font-semibold text-zinc-100">GLYX</h1>
      <p className="mt-3 max-w-md text-sm text-zinc-400">
        Tente novamente. Confirme a ligação ao Supabase e à rede.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-zinc-600">ref: {error.digest}</p>
      ) : null}
      <Button className="mt-6" type="button" onClick={() => reset()}>
        Tentar outra vez
      </Button>
    </div>
  );
}
