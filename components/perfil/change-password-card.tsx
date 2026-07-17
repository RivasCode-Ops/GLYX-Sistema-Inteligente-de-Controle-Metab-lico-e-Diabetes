"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("same") || m.includes("different from the old")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Senha atual incorreta.";
  }
  if (m.includes("weak") || m.includes("at least")) {
    return "Senha fraca demais. Use no mínimo 6 caracteres (de preferência letras e números).";
  }
  if (m.includes("session") || m.includes("not authenticated") || m.includes("jwt")) {
    return "Sessão expirada. Saia e entre de novo, depois tente alterar a senha.";
  }
  return message;
}

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (password.length < 6) {
      setError("A nova senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("A confirmação não coincide com a nova senha.");
      return;
    }
    if (password === currentPassword) {
      setError("A nova senha precisa ser diferente da atual.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase não configurado neste ambiente.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user?.email) {
        setError("Não foi possível confirmar sua sessão. Entre de novo no app.");
        return;
      }

      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthErr) {
        setError(friendlyAuthError(reauthErr.message));
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(friendlyAuthError(updateErr.message));
        return;
      }

      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      setOk("Senha alterada com sucesso.");
    } catch {
      setError("Falha de rede ao alterar a senha. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alterar senha</CardTitle>
        <CardDescription>
          Confirme a senha atual e defina uma nova. Isso vale para o login do GLyX.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          {error ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
          {ok ? (
            <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-200">
              {ok}
            </p>
          ) : null}
          <div className="grid gap-1">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-password">Nova senha (mín. 6)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando…" : "Alterar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
