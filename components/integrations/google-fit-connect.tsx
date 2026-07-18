"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ConnectionInfo = {
  lastSyncAt: string | null;
  lastError: string | null;
} | null;

const ERROR_LABEL: Record<string, string> = {
  not_configured: "OAuth não configurado no servidor.",
  missing_code: "Autorização cancelada ou incompleta.",
  invalid_state: "Sessão de autorização expirada — tente de novo.",
  session: "Sessão de login não confere — entre de novo e tente.",
  save: "Falha ao salvar a conexão.",
  token: "Falha ao trocar o código por token com o Google.",
  no_refresh_token:
    "O Google não devolveu permissão de acesso contínuo. Remova o acesso do GLYX em myaccount.google.com/permissions e tente conectar de novo.",
};

export function GoogleFitConnect({
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
    const flag = params.get("googleFit");
    if (flag === "connected") return "Google Fit conectado.";
    if (flag === "error") {
      const reason = params.get("reason") ?? "erro";
      return ERROR_LABEL[reason] ?? `Falha no OAuth Google Fit (${reason}).`;
    }
    return null;
  });

  const flash = useMemo(() => params.get("googleFit"), [params]);

  async function syncNow() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/health/google-fit/sync", { method: "POST" });
      const data = (await res.json()) as { upserted?: number; throttled?: boolean; error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na sincronização.");
        return;
      }
      setStatus(
        data.throttled
          ? "Sincronizado há menos de 5 min — aguarde um pouco."
          : `${data.upserted ?? 0} dia(s) atualizados.`
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
      await fetch("/api/health/google-fit", { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (connection) {
    return (
      <Card className="border-sky-500/25">
        <CardHeader>
          <CardTitle className="text-base">Google Fit conectado</CardTitle>
          <CardDescription>
            Passos, sono e frequência cardíaca
            {connection.lastSyncAt
              ? ` · última sincronização ${new Date(connection.lastSyncAt).toLocaleString("pt-BR")}`
              : " · ainda sem sincronização"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connection.lastError ? (
            <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              {connection.lastError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void syncNow()} disabled={loading}>
              {loading ? "Sincronizando…" : "Sincronizar agora"}
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
        <CardTitle className="text-base">Conectar Google Fit (OAuth)</CardTitle>
        <CardDescription>
          Traz passos, sono e frequência cardíaca de relógios que sincronizam com o Google Fit (ex.:
          Amazfit via app Zepp) — tokens guardados cifrados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!oauthConfigured ? (
          <p className="text-xs text-zinc-500">
            Configure <code className="font-mono">GOOGLE_FIT_CLIENT_ID</code>,{" "}
            <code className="font-mono">GOOGLE_FIT_CLIENT_SECRET</code> e{" "}
            <code className="font-mono">GOOGLE_FIT_REDIRECT_URI</code> (ou{" "}
            <code className="font-mono">NEXT_PUBLIC_SITE_URL</code>) no servidor — veja
            docs/PRODUCAO.md.
          </p>
        ) : (
          <Button asChild disabled={loading}>
            <a href="/api/health/google-fit/authorize">Conectar com Google</a>
          </Button>
        )}
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
