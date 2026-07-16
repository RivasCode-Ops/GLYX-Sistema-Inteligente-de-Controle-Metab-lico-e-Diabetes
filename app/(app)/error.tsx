"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Assinaturas de erro de "peça antiga": o cliente ficou numa versão anterior
// do app (PWA aberto há tempo) e tenta baixar um chunk que o deploy novo
// substituiu. Recarregar a página resolve — então fazemos isso sozinhos.
const STALE_BUILD_RE =
  /ChunkLoadError|Loading chunk|dynamically imported module|module script failed|css chunk/i;

const RELOAD_GUARD_KEY = "glyx-stale-reload-at";
const RELOAD_GUARD_MS = 30_000;

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isStaleBuild =
    STALE_BUILD_RE.test(error.message ?? "") || STALE_BUILD_RE.test(error.name ?? "");

  useEffect(() => {
    console.error(error);
    if (!isStaleBuild) return;
    // Recarrega sozinho no máximo 1x por 30s — evita loop se o reload não
    // resolver (ex.: sem rede).
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Date.now() - last > RELOAD_GUARD_MS) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      window.location.reload();
    }
  }, [error, isStaleBuild]);

  if (isStaleBuild) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <p className="text-sm font-medium text-emerald-400/90">Nova versão do app</p>
        <p className="mt-2 text-sm text-zinc-400">
          Uma atualização foi publicada e esta tela precisa recarregar. Fazendo isso
          automaticamente…
        </p>
        <Button className="mt-6" type="button" onClick={() => window.location.reload()}>
          Recarregar agora
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p className="text-sm font-medium text-amber-400/90">Erro no módulo</p>
      <p className="mt-2 text-sm text-zinc-400">
        Não foi possível mostrar esta tela. Seus dados continuam seguros no servidor — nada foi
        apagado.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-zinc-600">ref: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-2">
        <Button type="button" onClick={() => reset()}>
          Tentar de novo
        </Button>
        <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
          Recarregar página
        </Button>
      </div>
    </div>
  );
}
