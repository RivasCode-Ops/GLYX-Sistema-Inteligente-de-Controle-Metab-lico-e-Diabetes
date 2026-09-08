"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhotoCaptureButtons } from "@/components/ui/photo-capture-buttons";
import { InteractionAlert } from "@/components/medicacao/interaction-alert";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";
import type { SafetyPayload } from "@/lib/safety/present";
import { Input } from "@/components/ui/input";

/**
 * O alerta desta tela vem de `result.safety`, que o servidor monta a partir do
 * motor determinístico — nunca do texto do modelo. Por isso não existe estado
 * verde aqui: o melhor caso possível é "sem alerta na base", com a legenda
 * dizendo que isso não é atestado de segurança. Um card verde escrito "Seguro"
 * foi exatamente o que o app mostrou no incidente da berberina.
 */

type Result = {
  productName: string;
  safety: SafetyPayload;
  summary: string;
  concerningIngredients: { name: string; why: string }[];
  crossCheck: string[];
  doctorNote: string;
  limitations: string;
  llmSkipped: boolean;
};

const TONE_STYLE: Record<SafetyPayload["tone"], string> = {
  evitar: "border-red-500/40 bg-red-500/10",
  atencao: "border-amber-500/40 bg-amber-500/10",
  // Neutro, deliberadamente. Não é verde e não diz "seguro".
  sem_alerta: "border-zinc-700 bg-zinc-900/60",
};

export function SupplementCheckForm() {
  const { files: pages, previews, status, setStatus, loading, setLoading, selectSingle, reset } =
    usePhotoSelection({ allowPdf: true });
  const [result, setResult] = useState<Result | null>(null);
  // O caminho por texto é o mais direto e faltava por inteiro: a pergunta de
  // quem está na farmácia — "posso tomar berberina?" — não tinha onde ser feita.
  const [texto, setTexto] = useState("");

  async function onFileChange(file: File | undefined) {
    setResult(null);
    await selectSingle(file);
  }

  const podeEnviar = pages.length > 0 || texto.trim().length > 0;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!podeEnviar) {
      setStatus("Digite o nome da substância ou selecione a foto do rótulo.");
      return;
    }
    setLoading(true);
    setStatus(
      pages.length ? "Lendo o rótulo e cruzando com seus dados…" : "Cruzando com seus dados…"
    );
    setResult(null);
    try {
      const fd = new FormData();
      for (const p of pages) fd.append("images", p);
      // Foto vence: havendo rótulo, ele traz os ingredientes que o nome não tem.
      if (!pages.length && texto.trim()) fd.append("substances", texto.trim());
      const res = await fetch("/api/ai/supplement-check", { method: "POST", body: fd });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      setResult(data);
      setStatus(null);
      reset();
      setTexto("");
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="substancia" className="text-xs font-medium text-zinc-300">
              Nome da substância ou do produto
            </label>
            <Input
              id="substancia"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setResult(null);
              }}
              placeholder="ex.: berberina · vitamina D · cromo, gymnema"
              maxLength={300}
            />
            <p className="text-[11px] leading-4 text-zinc-600">
              Vírgula separa mais de uma. Digitado, o app cruza direto com seus medicamentos — sem
              ler nenhum rótulo, e sem que nenhum modelo opine antes.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-600">
            <span className="h-px flex-1 bg-zinc-800" />
            ou fotografe o rótulo
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          <PhotoCaptureButtons
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onFile={(f) => void onFileChange(f)}
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
          <Button type="submit" disabled={loading || !podeEnviar}>
            {loading ? "Analisando…" : pages.length ? "Analisar rótulo" : "Checar substância"}
          </Button>
          {status ? <p className="text-xs text-amber-300">{status}</p> : null}
          <p className="text-[11px] leading-4 text-zinc-600">
            Checagem de interação com o que você tem registrado — não prescreve dose nem substitui
            nutricionista/nefrologista/endocrinologista.
          </p>
        </form>
      </div>

      {result ? (
        <Card className={TONE_STYLE[result.safety.tone]}>
          <CardContent className="space-y-4 pt-6">
            {result.productName ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                {result.productName}
              </p>
            ) : null}

            {/* O alerta vem antes da prosa e não depende dela. */}
            <InteractionAlert safety={result.safety} />

            <p className="whitespace-pre-line text-sm text-zinc-200">{result.summary}</p>

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
                <p className="mb-1 text-xs font-medium text-zinc-300">Cruzamento com seus dados</p>
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

            {result.limitations ? (
              <p className="text-[11px] leading-4 text-zinc-600">{result.limitations}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
