"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ensureSession() {
      const supabase = createClient();
      if (!supabase) {
        if (!cancelled) setError("Supabase não configurado neste ambiente.");
        return;
      }

      // Links de recuperação: session via cookies (callback) ou hash no URL.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // Aguarda um tick do client auth processar o hash (#access_token / type=recovery).
        await new Promise((r) => setTimeout(r, 400));
        const again = await supabase.auth.getSession();
        if (!again.data.session) {
          if (!cancelled) {
            setError(
              "Não há sessão de recuperação ativa. Abra o link do e-mail de novo ou peça outro em “Esqueci minha senha”."
            );
          }
          return;
        }
      }

      if (!cancelled) setReady(true);
    }

    void ensureSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A nova senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase não configurado neste ambiente.");
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(friendlyAuthError(err.message));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Definir nova senha</CardTitle>
        <CardDescription>Escolha a nova senha da sua conta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          {error ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
          {!ready && !error ? (
            <p className="text-xs text-zinc-500">Validando o link de recuperação…</p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="password">Nova senha (mín. 6 caracteres)</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              disabled={!ready || loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              disabled={!ready || loading}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!ready || loading}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
