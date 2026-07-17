"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/app/actions/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ChangePasswordCard() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(() => {
      void (async () => {
        const r = await changePasswordAction(fd);
        if (r.error) {
          setError(r.error);
          return;
        }
        setOk("Senha alterada com sucesso.");
        form.reset();
      })();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alterar senha</CardTitle>
        <CardDescription>
          Confirme a senha atual e defina uma nova. Conta principal do app usa atualização direta no
          servidor (menos bloqueio por tentativas).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
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
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-password">Nova senha (mín. 6)</Label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              disabled={pending}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Alterar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
