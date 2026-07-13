"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { compressImageFile } from "@/lib/images/compress";

type Result = {
  productName: string;
  verdict: "seguro" | "atencao" | "evitar";
  summary: string;
  concerningIngredients: { name: string; why: string }[];
  crossCheck: string[];
  doctorNote: string;
  limitations: string;
};

const VERDICT_STYLE: Record<Result["verdict"], { box: string; label: string }> = {
  seguro: { box: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", label: "✅ Seguro" },
  atencao: { box: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "⚠️ Atenção" },
  evitar: { box: "border-red-500/40 bg-red-500/10 text-red-300", label: "🚫 Evitar" },
};

export function SupplementCheckForm() {
  const [pages, setPages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function resetPreviews(next: string[]) {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews(next);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    setStatus(null);
    if (!file) {
      setPages([]);
      resetPreviews([]);
      return;
    }
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      setStatus("Convertendo PDF em imagens…");
      setLoading(true);
      try {
        const { pdfToImages } = await import("@/lib/pdf/pdf-to-images");
        const imgs = await pdfToImages(file, 3);
        if (!imgs.length) {
          setStatus("Não consegui ler este PDF. Tente uma foto do rótulo.");
          return;
        }
        setPages(imgs);
        resetPreviews(imgs.map((i) => URL.createObjectURL(i)));
        setStatus(null);
      } catch {
        setStatus("Falha ao converter o PDF. Tente uma foto do rótulo.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setStatus("Comprimindo foto…");
    setLoading(true);
    try {
      const compressed = await compressImageFile(file);
      setPages([compressed]);
      resetPreviews([URL.createObjectURL(compressed)]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pages.length) {
      setStatus("Selecione a foto do rótulo (ingredientes e tabela nutricional).");
      return;
    }
    setLoading(true);
    setStatus("Lendo o rótulo e cruzando com seus dados…");
    setResult(null);
    try {
      const fd = new FormData();
      for (const p of pages) fd.append("images", p);
      const res = await fetch("/api/ai/supplement-check", { method: "POST", body: fd });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      setResult(data);
      setStatus(null);
      setPages([]);
      resetPreviews([]);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analisar suplemento antes de comprar</CardTitle>
          <CardDescription>
            Fotografe o rótulo (ingredientes + tabela nutricional). A IA cruza com sua glicemia,
            exames e medicações — não recomenda onde comprar, só avalia a segurança.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => void onFileChange(e)}
              className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-2 file:text-sm file:text-emerald-100"
            />
            {previews.length ? (
              <div className={previews.length > 1 ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : ""}>
                {previews.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p}
                    src={p}
                    alt="Rótulo do suplemento"
                    className="max-h-64 w-full rounded-xl border border-zinc-800 object-contain"
                  />
                ))}
              </div>
            ) : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Analisando…" : "Analisar rótulo"}
            </Button>
            {status ? <p className="text-xs text-amber-300">{status}</p> : null}
            <p className="text-[11px] leading-4 text-zinc-600">
              Análise educativa de segurança — não prescreve dose nem substitui
              nutricionista/nefrologista/endocrinologista.
            </p>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card className={VERDICT_STYLE[result.verdict].box}>
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">
                {VERDICT_STYLE[result.verdict].label} — {result.productName}
              </p>
              <p className="mt-1 text-sm text-zinc-200">{result.summary}</p>
            </div>

            {result.concerningIngredients.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-amber-300">Ingredientes de atenção</p>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {result.concerningIngredients.map((i) => (
                    <li key={i.name}>
                      <strong>{i.name}:</strong> {i.why}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.crossCheck.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-300">
                  Cruzamento com seus dados
                </p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {result.crossCheck.map((c) => (
                    <li key={c}>🔎 {c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-700 bg-zinc-950/50 p-3">
              <p className="mb-1 text-xs font-medium text-zinc-300">
                📋 Resumo para levar ao seu médico
              </p>
              <p className="text-sm text-zinc-200">{result.doctorNote}</p>
            </div>

            <p className="text-[11px] leading-4 text-zinc-600">{result.limitations}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
