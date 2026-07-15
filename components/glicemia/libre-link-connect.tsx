"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConnectionInfo = {
  email: string;
  lastSyncAt: string | null;
  lastError: string | null;
} | null;

export function LibreLinkConnect({ connection }: { connection: ConnectionInfo }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Mostra o formulário de credenciais mesmo já conectado (reconexão). */
  const [reconnecting, setReconnecting] = useState(false);

  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cgm/libre-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha ao conectar.");
        return;
      }
      setPassword("");
      setStatus(null);
      setReconnecting(false);
      router.refresh();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cgm/libre-sync", { method: "POST" });
      const data = (await res.json()) as {
        inserted?: number;
        throttled?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na sincronização.");
        return;
      }
      setStatus(
        data.throttled
          ? "Sincronizado há menos de 5 min — aguarde um pouco."
          : `✅ ${data.inserted ?? 0} leituras novas do sensor.`
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
      await fetch("/api/cgm/libre-link", { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (connection && !reconnecting) {
    return (
      <Card className="border-emerald-500/25">
        <CardHeader>
          <CardTitle className="text-base">🔗 Libre 2 conectado — sincronização automática</CardTitle>
          <CardDescription>
            Conta seguidora: {connection.email}
            {connection.lastSyncAt
              ? ` · última sincronização ${new Date(connection.lastSyncAt).toLocaleString("pt-BR")}`
              : " · ainda sem sincronização"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-400">
            O GLYX acompanha seu sensor como o seu médico: as leituras entram sozinhas sempre que
            você abre o app (e pelo botão abaixo). Alerta de hipoglicemia dispara automaticamente.
          </p>
          {connection.lastError ? (
            <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-xs text-red-300">Último erro: {connection.lastError}</p>
              <p className="text-xs text-zinc-400">
                Se o erro persistir após sincronizar, reconecte informando a senha de novo — é o
                que resolve credencial expirada ou inválida.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void syncNow()} disabled={loading}>
              {loading ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
            <Button
              variant={connection.lastError ? "default" : "ghost"}
              onClick={() => {
                setStatus(null);
                setReconnecting(true);
              }}
              disabled={loading}
            >
              Reconectar (informar senha de novo)
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
          {status ? <p className="text-xs text-amber-300">{status}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="text-base">
          {connection ? "🔗 Reconectar o FreeStyle Libre 2" : "🔗 Conectar o FreeStyle Libre 2 (automático)"}
        </CardTitle>
        <CardDescription>
          {connection
            ? `Informe de novo o e-mail e a senha da conta LibreLinkUp (atual: ${connection.email}) — a credencial salva será substituída.`
            : "O mesmo acompanhamento que seu médico tem — o GLYX vira um seguidor do seu sensor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connection ? (
          <ol className="space-y-1.5 text-sm text-zinc-400">
            <li>
              1. No app <strong className="text-zinc-200">LibreLink</strong> do celular: menu →{" "}
              <strong className="text-zinc-200">Aplicativos conectados</strong> →{" "}
              <strong className="text-zinc-200">LibreLinkUp</strong> → convide um e-mail seu (pode
              ser um segundo e-mail)
            </li>
            <li>
              2. Baixe o app <strong className="text-zinc-200">LibreLinkUp</strong>, crie a conta com
              esse e-mail e aceite o convite
            </li>
            <li>3. Informe aqui o e-mail e a senha dessa conta LibreLinkUp:</li>
          </ol>
        ) : null}
        <form onSubmit={(e) => void connect(e)} className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="llu-email">E-mail do LibreLinkUp</Label>
            <Input
              id="llu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="llu-pass">Senha do LibreLinkUp</Label>
            <Input
              id="llu-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Validando com a Abbott…" : connection ? "Reconectar sensor" : "Conectar sensor"}
            </Button>
            {connection ? (
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setStatus(null);
                  setReconnecting(false);
                }}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}
        <p className="text-[11px] leading-4 text-zinc-600">
          A senha é validada na hora, guardada cifrada (AES-256) e usada só para ler as leituras do
          sensor. Você pode desconectar quando quiser. Canal não oficial da Abbott (o mesmo usado
          por projetos como o Nightscout) — se a Abbott mudar algo, o app avisa aqui.
        </p>
      </CardContent>
    </Card>
  );
}
