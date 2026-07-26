"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { playAlarm, primeAudio, stopAlarm } from "@/lib/push/alarm-sound";

type Incoming = { title?: string; body?: string; url?: string; critical?: boolean };

/**
 * Alarme audível para alertas críticos com o app aberto.
 *
 * A notificação push sozinha depende do som do sistema, que o usuário pode ter
 * baixo, mudo ou em "não perturbe" — e um alerta de hipoglicemia despercebido é
 * problema de segurança, não de conforto. Com o app na tela, quem faz barulho
 * passa a ser o app, com um banner que não some sozinho.
 *
 * O contexto de áudio é destravado no **primeiro toque** em qualquer lugar do
 * app: navegador bloqueia som sem gesto prévio, e sem isso o alarme falharia
 * exatamente na hora em que precisa tocar.
 */
export function CriticalAlarm() {
  const [alert, setAlert] = useState<Incoming | null>(null);
  const [muted, setMuted] = useState(false);
  const primed = useRef(false);

  // Destrava o áudio no primeiro gesto — uma vez por sessão.
  useEffect(() => {
    const unlock = () => {
      if (primed.current) return;
      primed.current = primeAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: Incoming } | null;
      if (!data || data.type !== "glyx-critical") return;
      const payload = data.payload ?? {};
      setAlert(payload);
      // Falhou em tocar (sem gesto prévio): o banner ainda aparece, então o
      // alerta não se perde em silêncio.
      setMuted(!playAlarm());
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const dismiss = useCallback(() => {
    stopAlarm();
    setAlert(null);
    setMuted(false);
  }, []);

  if (!alert) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={alert.title ?? "Alerta crítico"}
      className="fixed inset-x-0 top-0 z-[60] p-3"
    >
      <div className="mx-auto max-w-xl rounded-2xl border-2 border-red-500 bg-red-950 p-4 shadow-2xl">
        <p className="text-base font-bold text-red-100">{alert.title ?? "Alerta"}</p>
        {alert.body ? <p className="mt-1 text-sm text-red-100/90">{alert.body}</p> : null}

        {muted ? (
          <p className="mt-2 rounded-lg bg-red-900/60 p-2 text-[11px] text-red-100">
            O som não pôde tocar (o navegador exige um toque na tela antes de liberar áudio).
            Toque em qualquer lugar do app uma vez e o próximo alarme sai com som.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={dismiss}>
            Parar alarme
          </Button>
          {alert.url ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                dismiss();
                window.location.href = alert.url!;
              }}
            >
              Ver detalhes
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
