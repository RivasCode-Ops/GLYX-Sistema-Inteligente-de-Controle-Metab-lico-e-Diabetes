"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
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
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p className="text-sm font-medium text-amber-400/90">Erro no módulo</p>
      <p className="mt-2 text-sm text-zinc-400">
        Não foi possível mostrar este ecrã. Os seus dados no Supabase não são apagados.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-zinc-600">ref: {error.digest}</p>
      ) : null}
      <Button className="mt-6" type="button" onClick={() => reset()}>
        Recarregar secção
      </Button>
    </div>
  );
}
