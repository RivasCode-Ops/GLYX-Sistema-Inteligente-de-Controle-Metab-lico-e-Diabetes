"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "glyx-install-dismissed";

/** Registra o service worker globalmente e oferece a instalação como app. */
export function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true);
    if (isStandalone || localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS não dispara beforeinstallprompt — mostra instrução manual no Safari
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setInstallEvent(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  }

  if (!installEvent && !showIosHint) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-zinc-950/95 p-4 shadow-2xl shadow-emerald-950/40 backdrop-blur md:bottom-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-lg font-bold text-emerald-300">
          G
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">Instale o GLYX como aplicativo</p>
          {installEvent ? (
            <p className="mt-0.5 text-xs leading-5 text-zinc-400">
              Ícone na tela inicial, tela cheia e alarmes — sem depender do navegador.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-5 text-zinc-400">
              No Safari: toque em <strong>Compartilhar</strong> (quadrado com seta) →{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {installEvent ? (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
              >
                Instalar agora
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
