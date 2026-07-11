"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "unsupported" | "idle" | "enabled" | "denied" | "loading";

export function AlarmSetup() {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    void navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "enabled" : Notification.permission === "denied" ? "denied" : "idle");
    });
  }, []);

  async function enable() {
    setMessage(null);
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setMessage("Chaves de push não configuradas no servidor.");
      return;
    }
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setMessage(data.error ?? "Falha ao registrar o dispositivo.");
        setState("idle");
        return;
      }
      setState("enabled");
      setMessage("Alarmes ativados neste dispositivo.");
    } catch {
      setMessage("Falha ao ativar. Tente novamente.");
      setState("idle");
    }
  }

  async function disable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("idle");
      setMessage("Alarmes desativados neste dispositivo.");
    } catch {
      setState("enabled");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alarmes no dispositivo</CardTitle>
        <CardDescription>
          Receba alarme de medicação e alertas de glicemia neste aparelho, mesmo com o app fechado.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {state === "unsupported" ? (
          <p className="text-sm text-zinc-500">
            Este navegador não suporta notificações push. No iPhone, adicione o GLYX à tela inicial
            (Compartilhar → Adicionar à Tela de Início) e ative por lá.
          </p>
        ) : state === "denied" ? (
          <p className="text-sm text-amber-300">
            Notificações bloqueadas para este site. Libere nas configurações do navegador e tente de
            novo.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            {state === "enabled" ? (
              <>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
                  ● Ativado neste dispositivo
                </span>
                <Button type="button" variant="outline" onClick={() => void disable()}>
                  Desativar
                </Button>
              </>
            ) : (
              <Button type="button" disabled={state === "loading"} onClick={() => void enable()}>
                {state === "loading" ? "Verificando…" : "Ativar alarmes neste dispositivo"}
              </Button>
            )}
          </div>
        )}
        {message ? <p className="text-xs text-zinc-400">{message}</p> : null}
        <p className="text-[11px] leading-4 text-zinc-600">
          Ative em cada aparelho que deve tocar (celular, computador). Os horários de dose são
          definidos em cada medicamento, no módulo Medicação.
        </p>
      </CardContent>
    </Card>
  );
}
