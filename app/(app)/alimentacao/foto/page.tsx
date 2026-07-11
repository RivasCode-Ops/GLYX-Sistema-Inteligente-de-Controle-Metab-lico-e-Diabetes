"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AlimentacaoFotoPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("image");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("Selecione uma imagem.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/meal-photo", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { meal?: unknown; error?: string; demo?: boolean };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      setStatus(
        data.demo
          ? "Configure OPENAI_API_KEY para análise por IA."
          : `Salvo: ${JSON.stringify(data.meal)}`
      );
      form.reset();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm text-zinc-400">
        Envio seguro via sessão; o modelo estima macros e salva como refeição (servidor).
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Foto da refeição</CardTitle>
          <CardDescription>JPEG ou PNG, boa iluminação para melhor estimativa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-2 file:text-sm file:text-emerald-100"
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Analisando…" : "Analisar e salvar"}
            </Button>
            {status ? <p className="text-xs text-zinc-400">{status}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
