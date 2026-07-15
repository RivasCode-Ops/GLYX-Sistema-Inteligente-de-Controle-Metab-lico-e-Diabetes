"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 60 * 1000;
// Alinhado à trava do servidor em /api/cgm/libre-sync (5 min) — pedir mais
// que isso só devolve { throttled: true }.
const SYNC_MS = 5 * 60 * 1000;

/**
 * Mantém o dashboard vivo com a aba aberta: re-renderiza os Server
 * Components a cada minuto (pega leituras que o cron inseriu, refeições,
 * água etc.) e dispara a sincronização do sensor a cada 5 min. Tudo pausa
 * quando a aba fica oculta e retoma — com refresh imediato — ao voltar.
 */
export function DashboardAutoRefresh() {
  const router = useRouter();
  const lastSyncRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function syncSensor() {
      if (Date.now() - lastSyncRef.current < SYNC_MS) return;
      lastSyncRef.current = Date.now();
      try {
        const res = await fetch("/api/cgm/libre-sync", { method: "POST" });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { inserted?: number };
        if (data.inserted && data.inserted > 0) router.refresh();
      } catch {
        /* rede/504 — o radar mostra o estado; próxima rodada tenta de novo */
      }
    }

    function tick() {
      if (cancelled || document.visibilityState === "hidden") return;
      router.refresh();
      void syncSensor();
    }

    function onVisible() {
      if (document.visibilityState === "visible") tick();
    }

    void syncSensor();
    const interval = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
