"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
        {n}
      </span>
      <span className="text-[15px] leading-6 text-zinc-200">{children}</span>
    </li>
  );
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true)
    ) {
      setInstalled(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
  }

  if (installed) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-2 text-lg font-medium text-emerald-200">O GLYX já está instalado!</p>
        <p className="mt-1 text-sm text-zinc-400">
          Procure o ícone <strong className="text-emerald-300">G</strong> na tela inicial do seu
          aparelho.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white"
        >
          Abrir o GLYX
        </Link>
      </div>
    );
  }

  if (installEvent) {
    return (
      <div className="space-y-3 text-center">
        <button
          type="button"
          onClick={() => void install()}
          className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500"
        >
          📲 Instalar agora — 1 toque
        </button>
        <p className="text-xs text-zinc-500">
          Toque no botão e confirme. O ícone aparece na tela inicial.
        </p>
      </div>
    );
  }

  if (platform === "ios") {
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Abra esta página no <strong>Safari</strong> (o navegador da bússola 🧭).
        </Step>
        <Step n={2}>
          Toque no botão <strong>Compartilhar</strong> — o quadrado com a seta para cima{" "}
          <span className="text-sky-300">⬆️</span> na barra de baixo.
        </Step>
        <Step n={3}>
          Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.
        </Step>
        <Step n={4}>
          Toque em <strong>Adicionar</strong> no canto superior. Pronto — o GLYX vira um app! 🎉
        </Step>
      </ol>
    );
  }

  if (platform === "android") {
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Abra esta página no <strong>Chrome</strong>.
        </Step>
        <Step n={2}>
          Toque nos <strong>três pontinhos ⋮</strong> no canto superior direito.
        </Step>
        <Step n={3}>
          Toque em <strong>Instalar aplicativo</strong> (ou <strong>Adicionar à tela inicial</strong>).
        </Step>
        <Step n={4}>
          Confirme. O ícone <strong className="text-emerald-300">G</strong> aparece na tela inicial —
          é por ele que você abre o GLYX a partir de agora. 🎉
        </Step>
      </ol>
    );
  }

  return (
    <ol className="space-y-3">
      <Step n={1}>
        No <strong>Chrome</strong> ou <strong>Edge</strong>, olhe o fim da barra de endereço.
      </Step>
      <Step n={2}>
        Clique no ícone de <strong>instalar</strong> (um monitor com seta ⬇) e confirme.
      </Step>
      <Step n={3}>O GLYX abre em janela própria, como qualquer programa. 🎉</Step>
    </ol>
  );
}
