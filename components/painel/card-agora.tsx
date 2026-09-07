"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardAgora, CardLevel } from "@/lib/painel/card-agora";

/**
 * Card "o que fazer agora" — primeiro elemento do painel.
 *
 * O texto vem PRONTO do motor (`lib/painel/card-agora.ts`). O componente não
 * decide nada: não escolhe card, não reescreve corpo, não infere severidade.
 * No card de hipoglicemia o corpo é o texto que a pessoa cadastrou com o
 * médico, e ele chega aqui literal.
 *
 * SEM ANIMAÇÃO DE ENTRADA. Este card é a primeira coisa da tela mais aberta do
 * app; alerta que desliza para dentro chega depois do olho. A única transição é
 * a altura do "Por quê?".
 */

const BORDA: Record<CardLevel, string> = {
  // Âmbar alto contraste, não vermelho: sobre um fundo quase preto o vermelho
  // puro perde contraste e vira ruído.
  critico: "border-l-[3px] border-l-amber-400 bg-zinc-900/60",
  atencao: "border-l border-l-amber-500/70",
  neutro: "",
};

const TITULO: Record<CardLevel, string> = {
  critico: "text-amber-300",
  atencao: "text-zinc-100",
  neutro: "text-zinc-400",
};

export function CardAgoraView({
  card,
  hora,
}: {
  card: CardAgora;
  /** horário da leitura que disparou, quando houver */
  hora?: string | null;
}) {
  const [porQue, setPorQue] = useState(false);

  return (
    <Card className={cn("w-full", BORDA[card.level])}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Caixa alta, curto, sem ponto final. */}
          <p className={cn("text-xs font-semibold uppercase tracking-wide", TITULO[card.level])}>
            {card.title}
          </p>
          {hora ? <span className="font-mono text-xs text-zinc-500">{hora}</span> : null}
        </div>

        {/* `evidence` em monoespaçada, a mesma da coluna direita dos módulos:
            reforça no olho que é dado LIDO, não texto redigido. */}
        <p className="mt-2 font-mono text-sm text-zinc-200">{card.evidence}</p>

        {card.body ? (
          <p className="mt-3 whitespace-pre-line text-sm text-zinc-200">{card.body}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {card.actions.map((a) =>
            a.intent.startsWith("/api/") ? (
              <Button
                key={a.label}
                type="submit"
                form={`card-agora-${a.intent.replace(/\W+/g, "-")}`}
                variant={a.kind === "primary" ? "default" : "outline"}
                size="sm"
              >
                {a.label}
              </Button>
            ) : (
              <Button
                key={a.label}
                asChild
                variant={a.kind === "primary" ? "default" : "outline"}
                size="sm"
              >
                <Link href={a.intent}>{a.label}</Link>
              </Button>
            )
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={porQue}
            aria-label="Por que este aviso apareceu"
            onClick={() => setPorQue((v) => !v)}
          >
            ?
          </Button>
        </div>

        {/* Expande no próprio card, sem navegar. Transição só de altura. */}
        {porQue ? (
          <p className="mt-3 border-t border-zinc-800/80 pt-3 text-xs text-zinc-400">{card.why}</p>
        ) : null}
      </div>
    </Card>
  );
}
