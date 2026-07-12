"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseLibreViewCsv } from "@/lib/cgm/normalize/libre-csv";
import type { UnifiedCgmReading } from "@/lib/cgm/types";

type Preview = {
  readings: UnifiedCgmReading[];
  from: string;
  to: string;
};

export function LibreCsvImport() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(null);
    setDone(null);
    setStatus(null);
    if (!file) return;

    const text = await file.text();
    const { readings, skipped } = parseLibreViewCsv(text);
    if (!readings.length) {
      setStatus(
        "Não reconheci leituras neste arquivo. Confira se é o CSV exportado do LibreView (Baixar dados de glicose)."
      );
      return;
    }
    const sorted = [...readings].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    setPreview({
      readings,
      from: new Date(sorted[0].recordedAt).toLocaleDateString("pt-BR"),
      to: new Date(sorted[sorted.length - 1].recordedAt).toLocaleDateString("pt-BR"),
    });
    if (skipped > 0) setStatus(`${skipped} linha(s) sem valor foram ignoradas (normal).`);
  }

  async function importReadings() {
    if (!preview) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cgm/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "unified", readings: preview.readings }),
      });
      const data = (await res.json()) as { inserted?: number; skipped?: number; error?: string };
      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : "Falha na importação.");
        return;
      }
      setDone(
        `✅ ${data.inserted ?? 0} leituras novas importadas` +
          (data.skipped ? ` (${data.skipped} já existiam — ignoradas)` : "") +
          ". Veja em Glicemia → Tendências."
      );
      setPreview(null);
      router.refresh();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="text-base">FreeStyle Libre 2 — importar do LibreView</CardTitle>
        <CardDescription>
          Traga o histórico do seu sensor: até 90 dias de leituras entram no GLYX de uma vez, sem
          digitar nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-1.5 text-sm text-zinc-400">
          <li>
            1. Entre em <strong className="text-zinc-200">libreview.com</strong> com a mesma conta
            do app LibreLink do celular
          </li>
          <li>
            2. Clique no ícone de <strong className="text-zinc-200">download</strong> (canto
            superior) → <strong className="text-zinc-200">Baixar dados de glicose</strong>
          </li>
          <li>3. Envie aqui o arquivo .csv baixado:</li>
        </ol>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onFileChange(e)}
          className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-2 file:text-sm file:text-emerald-100"
        />
        {preview ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-sm text-zinc-200">
              📊 <strong>{preview.readings.length}</strong> leituras encontradas ({preview.from} a{" "}
              {preview.to})
            </p>
            <Button className="mt-2" onClick={() => void importReadings()} disabled={loading}>
              {loading ? "Importando…" : "Importar para o GLYX"}
            </Button>
          </div>
        ) : null}
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}
        {done ? (
          <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            {done}
          </p>
        ) : null}
        <p className="text-[11px] leading-4 text-zinc-600">
          Reimportar o mesmo período não duplica nada — leituras repetidas são reconhecidas e
          ignoradas. Alarme de hipoglicemia vale para novas leituras registradas no app.
        </p>
      </CardContent>
    </Card>
  );
}
