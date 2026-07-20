"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/errors";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "not_allowed"
      ? "Essa conta não está autorizada a entrar no GLYX."
      : null
  );
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(friendlyAuthError(err.message));
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function onOAuth(provider: "google" | "apple") {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setOauthLoading(provider);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setError(friendlyAuthError(err.message));
      setOauthLoading(null);
    }
    // Em sucesso o navegador é redirecionado pro provedor — sem mais nada a fazer aqui.
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entrar</CardTitle>
        <CardDescription>Use o e-mail e senha da sua conta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {!isSupabaseConfigured() ? (
            <p className="rounded-lg border border-amber-900/60 bg-amber-950/40 p-3 text-xs text-amber-200">
              Modo sem backend: crie <code className="font-mono">.env.local</code> com as chaves do
              projeto Supabase para habilitar login.
            </p>
          ) : null}
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
          <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>

          <div className="flex items-center gap-3 text-xs text-zinc-600">
            <span className="h-px flex-1 bg-zinc-800" />
            ou
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={oauthLoading !== null}
              onClick={() => void onOAuth("google")}
            >
              {oauthLoading === "google" ? "Redirecionando…" : "Continuar com Google"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={oauthLoading !== null}
              onClick={() => void onOAuth("apple")}
            >
              {oauthLoading === "apple" ? "Redirecionando…" : "Continuar com Apple"}
            </Button>
          </div>

          <p className="text-center text-xs text-zinc-500">
            Não tem conta?{" "}
            <Link href="/register" className="text-emerald-400 hover:underline">
              Criar conta
            </Link>{" "}
            ·{" "}
            <Link href="/forgot-password" className="text-emerald-400 hover:underline">
              Esqueci minha senha
            </Link>
          </p>
          <p className="text-center text-xs text-zinc-500">
            📱{" "}
            <Link href="/instalar" className="text-emerald-400 hover:underline">
              Instalar o GLYX como aplicativo no celular
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
