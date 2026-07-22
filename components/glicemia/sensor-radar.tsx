"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { friendlyCgmError } from "@/lib/cgm/friendly-error";

const POLL_MS = 60 * 1000;
/** Sensor conectado sem leitura nova há mais que isto → aviso âmbar. */
const STALE_MIN = 20;

type Health = {
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  latestReadingAt: string | null;
  latestReadingSource: string | null;
  serverTime: string;
};

function minutesSince(iso: string, nowIso: string): number {
  return Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000));
}

function idadeLabel(min: number): string {
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${String(min % 60).padStart(2, "0")}`;
}

/**
 * Radar do sensor: vigia a sincronização do CGM e torna quebras visíveis
 * em vez de deixar o dashboard "parado" sem explicação — erro de credencial
 * vira faixa vermelha com atalho pra reconectar; leitura velha vira aviso
 * âmbar; tudo certo vira uma linha discreta com a idade da última leitura.
 * Usuários sem sensor conectado não veem nada.
 */
export function SensorRadar() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/cgm/health");
        if (cancelled || !res.ok) return;
        setHealth((await res.json()) as Health);
      } catch {
        /* offline — mantém o último estado conhecido */
      }
    }

    void poll();
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!health?.connected) return null;

  if (health.lastError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        <span aria-hidden>📡</span>
        <span className="min-w-0 flex-1">{friendlyCgmError(health.lastError)}</span>
        <Link
          href="/integracoes"
          className="shrink-0 rounded-lg border border-red-400/40 px-2 py-1 font-medium transition hover:bg-red-500/20"
        >
          Reconectar →
        </Link>
      </div>
    );
  }

  const readingAge = health.latestReadingAt
    ? minutesSince(health.latestReadingAt, health.serverTime)
    : null;

  if (readingAge == null || readingAge > STALE_MIN) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <span aria-hidden>📡</span>
        <span className="min-w-0 flex-1">
          {readingAge == null
            ? "Sensor conectado, mas ainda sem leituras."
            : `Sem leitura nova do sensor ${idadeLabel(readingAge)}.`}
        </span>
        <Link
          href="/integracoes"
          className="shrink-0 rounded-lg border border-amber-400/40 px-2 py-1 font-medium transition hover:bg-amber-500/20"
        >
          Ver sensor →
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/status"
      className="flex items-center gap-2 px-1 text-[11px] text-zinc-500 transition hover:text-zinc-300"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
      Sensor ativo · última leitura {idadeLabel(readingAge)} · ver auditoria →
    </Link>
  );
}
