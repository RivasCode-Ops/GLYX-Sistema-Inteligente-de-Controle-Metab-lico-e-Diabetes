"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Apagar um registro pela tela (Etapa 2, D1), com confirmação em dois toques.
 *
 * Sem `confirm()` do navegador: diálogo modal trava o PWA em alguns aparelhos
 * e some atrás da notificação. O primeiro toque arma; o segundo, em até 5 s,
 * apaga. As ações de servidor já existiam (insulina, medida, foto) — faltava
 * o botão.
 */
export function BotaoApagar({
  acao,
  campos,
  rotulo = "Apagar",
  descricao,
}: {
  acao: (fd: FormData) => Promise<{ ok?: true; error?: string }>;
  /** Campos que identificam o registro (ex.: `{ id }`, `{ measured_on }`). */
  campos: Record<string, string>;
  rotulo?: string;
  /** Texto para leitores de tela: o que será apagado. */
  descricao: string;
}) {
  const router = useRouter();
  const [armado, setArmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function tocar() {
    if (!armado) {
      setArmado(true);
      setErro(null);
      setTimeout(() => setArmado(false), 5000);
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    startTransition(async () => {
      const r = await acao(fd);
      setArmado(false);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={armado ? "outline" : "ghost"}
        size="sm"
        disabled={pendente}
        aria-label={armado ? `Confirmar: apagar ${descricao}` : `Apagar ${descricao}`}
        onClick={tocar}
        className={armado ? "border-red-500/60 text-red-300" : "text-zinc-500"}
      >
        {pendente ? "Apagando…" : armado ? "Confirmar" : rotulo}
      </Button>
      {erro ? <span className="text-xs text-amber-300">{erro}</span> : null}
    </span>
  );
}
