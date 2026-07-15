"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  circuitOpenUserMessage,
  isCircuitOpen,
  type CgmErrorKind,
} from "@/lib/cgm/circuit-breaker";
import { friendlyCgmError } from "@/lib/cgm/friendly-error";

type ConnectionInfo = {
  lastSyncAt: string | null;
  lastError: string | null;
  circuitOpenUntil: string | null;
  lastErrorKind: string | null;
} | null;

export function DexcomConnect({
  connection,
  oauthConfigured,
}: {
  connection: ConnectionInfo;
  oauthConfigured: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(() => {
    const flag = params.get("dexcom");
    if (flag === "connected") return "Dexcom conectado.";
    if (flag === "error") return `Falha no OAuth Dexcom (${params.get("reason") ?? "erro"}).`;
    return null;
  });

  const flash = useMemo(() => params.get("dexcom"), [params]);

  async function syncNow() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cgm/dexcom/sync", { method: "POST" });
      const data = (await res.json()) as { inserted?: number; throttled?: boolean; error?: string };
      if (!res.ok) {
        setStatus(friendlyCgmError(data.error ?? "Falha na sincronização Dexcom."));
        return;
      }
      setStatus(
        data.throttled
          ? "Sincronizado há menos de 5 min — aguarde um pouco."
          : `${data.inserted ?? 0} leituras novas do Dexcom.`
      );
      router.refresh();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    setLoading(true);
    try {
      await fetch("/api/cgm/dexcom", { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (connection) {
    return (
      <Card className="border-sky-500/25">
        <CardHeader>
          <CardTitle className="text-base">Dexcom conectado</CardTitle>
          <CardDescription>
            Conta autorizada via OAuth
            {connection.lastSyncAt
              ? ` · última sincronização ${new Date(connection.lastSyncAt).toLocaleString("pt-BR")}`
              : " · ainda sem sincronização"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connection.circuitOpenUntil &&
          isCircuitOpen({ circuit_open_until: connection.circuitOpenUntil }) ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              {circuitOpenUserMessage(
                connection.circuitOpenUntil,
                (connection.lastErrorKind as CgmErrorKind | null) ?? null
              )}
            </p>
          ) : null}
          {connection.lastError ? (
            <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              {friendlyCgmError(connection.lastError)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void syncNow()} disabled={loading}>
              {loading ? "Sincronizando…" : "Sincronizar Dexcom"}
            </Button>
            <Button asChild variant="outline" disabled={loading || !oauthConfigured}>
              <a href="/api/cgm/dexcom/authorize">Reautorizar</a>
            </Button>
            <Button
              variant="ghost"
              onClick={() => void disconnect()}
              disabled={loading}
              className="text-zinc-500 hover:text-red-300"
            >
              Desconectar
            </Button>
          </div>
          {status || flash ? <p className="text-xs text-amber-300">{status}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-sky-500/20">
      <CardHeader>
        <CardTitle className="text-base">Conectar Dexcom (OAuth)</CardTitle>
        <CardDescription>
          Autorização oficial Dexcom — tokens guardados cifrados; sync automático via cron.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!oauthConfigured ? (
          <p className="text-xs text-zinc-500">
            Configure <code className="font-mono">DEXCOM_CLIENT_ID</code>,{" "}
            <code className="font-mono">DEXCOM_CLIENT_SECRET</code> e{" "}
            <code className="font-mono">DEXCOM_REDIRECT_URI</code> (ou{" "}
            <code className="font-mono">NEXT_PUBLIC_SITE_URL</code>) no servidor. Use{" "}
            <code className="font-mono">DEXCOM_USE_SANDBOX=true</code> no ambiente de teste.
          </p>
        ) : (
          <Button asChild disabled={loading}>
            <a href="/api/cgm/dexcom/authorize">Conectar com Dexcom</a>
          </Button>
        )}
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
