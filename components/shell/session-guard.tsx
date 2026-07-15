"use client";

import { useEffect } from "react";

const POLL_MS = 2 * 60 * 1000;

/**
 * Vigia a sessão em segundo plano: se o servidor responder 401 (sessão
 * expirada/revogada), força navegação completa para /login — descartando o
 * estado antigo da página. Sem isso, o app (especialmente instalado como
 * PWA) fica "zumbi": a tela velha continua visível, mas Adiar da notificação,
 * reconectar sensor e todo o resto falham em silêncio. Checa ao voltar para
 * a aba e a cada 2 min; erros de rede não deslogam (pode ser só offline).
 */
export function SessionGuard() {
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/auth/ping", { cache: "no-store" });
        if (!cancelled && res.status === 401) {
          window.location.assign("/login");
        }
      } catch {
        /* offline — não desloga por falta de rede */
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }

    void check();
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") void check();
    }, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
