"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Exportação do resumo em texto puro.
 *
 * Copiar para a área de transferência em vez de gerar arquivo: o destino real
 * é WhatsApp, e-mail ou o bloco de notas do celular, e texto puro é o formato
 * que sobrevive a todos eles. O `<textarea>` de fallback existe porque a
 * Clipboard API falha em contexto não seguro e em alguns navegadores móveis —
 * sem ele, o botão simplesmente não faria nada e o usuário não saberia por quê.
 */
export function WeeklySummaryExport({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void copy()} variant="outline" size="sm">
          Copiar resumo
        </Button>
        {status === "copied" ? (
          <span className="text-xs text-emerald-300">Copiado.</span>
        ) : null}
        {status === "failed" ? (
          <span className="text-xs text-amber-300">
            Não deu para copiar automaticamente — selecione o texto abaixo.
          </span>
        ) : null}
      </div>

      {status === "failed" ? (
        <textarea
          readOnly
          value={text}
          rows={14}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-snug text-zinc-300"
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
    </div>
  );
}
