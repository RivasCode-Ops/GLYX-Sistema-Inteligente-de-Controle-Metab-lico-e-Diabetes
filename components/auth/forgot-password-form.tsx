"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError("Configure as variáveis do Supabase no .env.local.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recuperar senha</CardTitle>
        <CardDescription>
          Enviamos um link de redefinição para o seu e-mail cadastrado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="grid gap-4">
            <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-sm text-emerald-200">
              Se o e-mail existir na base, você receberá um link para redefinir a senha. Verifique
              também a caixa de spam.
            </p>
            <p className="text-center text-xs text-zinc-500">
              <Link href="/login" className="text-emerald-400 hover:underline">
                Voltar ao login
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            {error ? (
              <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de redefinição"}
            </Button>
            <p className="text-center text-xs text-zinc-500">
              Lembrou a senha?{" "}
              <Link href="/login" className="text-emerald-400 hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
