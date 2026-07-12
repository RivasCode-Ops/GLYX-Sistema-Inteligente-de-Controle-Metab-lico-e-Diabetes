"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Dispara a sincronização do sensor ao abrir o painel (fire-and-forget).
 * O servidor aplica trava de 5 min; sem conexão configurada devolve 404
 * e nada acontece.
 */
export function LibreAutoSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cgm/libre-sync", { method: "POST" })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { inserted?: number };
        if (data.inserted && data.inserted > 0) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
