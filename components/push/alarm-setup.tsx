"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { playAlarm, stopAlarm } from "@/lib/push/alarm-sound";

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
  const [playing, setPlaying] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [testing, setTesting] = useState(false);

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

  async function sendTestPush() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json()) as { error?: string; devices?: number };
      setMessage(
        res.ok
          ? `Teste enviado para ${data.devices ?? 1} aparelho(s). Se não chegou som, ajuste as notificações no sistema — as instruções estão abaixo.`
          : (data.error ?? "Falha ao enviar o teste.")
      );
    } catch {
      setMessage("Erro de rede ao enviar o teste.");
    } finally {
      setTesting(false);
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
    <div className="grid gap-3">
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

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-sm font-medium text-zinc-200">Som do alarme</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-400">
            Com o <strong>app aberto</strong>, alertas críticos (hipoglicemia) tocam um alarme
            próprio e mostram um aviso que não some sozinho. Teste agora — isso também libera o
            áudio neste navegador, que só permite som depois de um toque na tela.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (playing) {
                  stopAlarm();
                  setPlaying(false);
                  return;
                }
                const ok = playAlarm(6000);
                setPlaying(ok);
                setSoundBlocked(!ok);
                if (ok) setTimeout(() => setPlaying(false), 6000);
              }}
            >
              {playing ? "Parar" : "🔊 Testar alarme sonoro"}
            </Button>
            {state === "enabled" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={() => void sendTestPush()}
              >
                {testing ? "Enviando…" : "📲 Enviar notificação de teste"}
              </Button>
            ) : null}
            {soundBlocked ? (
              <span className="text-[11px] text-amber-300">
                Este navegador não deixou tocar. Toque na tela e tente de novo.
              </span>
            ) : null}
          </div>
          {state === "enabled" ? (
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              A notificação de teste vai como <strong>crítica</strong>, igual a um alerta de
              hipoglicemia. Para o teste que vale, bloqueie a tela do celular antes de enviar — é
              assim que o alerta vai chegar de verdade.
            </p>
          ) : null}

          <p className="mt-3 text-[11px] font-medium text-zinc-300">
            Com o celular no bolso e a tela apagada, quem faz barulho é o sistema — não o app
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
            Nenhum site pode forçar som ou volume numa notificação: isso é decisão do
            Android/iPhone. Se a notificação chega calada, o ajuste é lá:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-zinc-500">
            <li>
              <strong>Android:</strong> Ajustes → Apps → GLYX (ou Chrome) → Notificações → deixe a
              importância como <em>Urgente/Alta</em> e confirme que há som escolhido. Em
              &quot;Não perturbe&quot;, adicione o app como exceção.
            </li>
            <li>
              <strong>iPhone:</strong> instale pela tela de início (Compartilhar → Adicionar à Tela
              de Início) e depois Ajustes → Notificações → GLYX → <em>Sons</em> ligado. O iOS não
              permite alerta de emergência para app web.
            </li>
            <li>
              Em qualquer um dos dois: o modo silencioso do aparelho silencia a notificação. A
              vibração longa dos alertas críticos continua funcionando.
            </li>
          </ul>
        </div>
    </div>
  );
}
