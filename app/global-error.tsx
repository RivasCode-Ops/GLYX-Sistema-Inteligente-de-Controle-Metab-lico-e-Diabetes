"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR" className="dark">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100 antialiased">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-amber-400/90">Erro crítico</p>
          <h1 className="mt-2 text-xl font-semibold">GLYX</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Falha ao carregar a aplicação. Recarregue a página ou volte mais tarde.
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={() => reset()}
          >
            Tentar outra vez
          </button>
        </div>
      </body>
    </html>
  );
}
