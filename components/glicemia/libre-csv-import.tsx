"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseLibreViewCsv } from "@/lib/cgm/normalize/libre-csv";
import type { UnifiedCgmReading } from "@/lib/cgm/types";
import { formatarData } from "@/lib/time/format";

/** Leituras por pedido. ~300 KB de JSON: rápido e bem abaixo do limite de corpo da Vercel. */
const CHUNK = 2000;

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
  const [progress, setProgress] = useState<string | null>(null);

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
      from: formatarData(sorted[0].recordedAt),
      to: formatarData(sorted[sorted.length - 1].recordedAt),
    });
    if (skipped > 0) setStatus(`${skipped} linha(s) sem valor foram ignoradas (normal).`);
  }

  async function importReadings() {
    if (!preview) return;
    setLoading(true);
    setStatus(null);
    const total = preview.readings.length;
    let inserted = 0;
    let skipped = 0;

    // Em partes: 90 dias de LibreView são ~8.600 leituras, e um pedido só que
    // cai no meio não diz quanto entrou (GLYX-19). Cada parte é confirmada
    // antes da próxima; reenviar o arquivo depois não duplica nada.
    const parar = (motivo: string) => {
      const enviadas = inserted + skipped;
      setStatus(
        `${motivo} ${enviadas ? `${enviadas} de ${total} leituras já foram processadas (${inserted} novas) e ficam salvas. ` : ""}` +
          "Envie o mesmo arquivo de novo para completar — o que já entrou é reconhecido e ignorado."
      );
      if (inserted) router.refresh();
    };

    try {
      for (let i = 0; i < total; i += CHUNK) {
        setProgress(`Importando ${Math.min(i + CHUNK, total)} de ${total}…`);
        const res = await fetch("/api/cgm/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "unified", readings: preview.readings.slice(i, i + CHUNK) }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          inserted?: number;
          skipped?: number;
          error?: string;
        };
        inserted += data.inserted ?? 0;
        skipped += data.skipped ?? 0;
        if (!res.ok) {
          parar(typeof data.error === "string" ? data.error : "Falha na importação.");
          return;
        }
      }
      setDone(
        `✅ ${inserted} leituras novas importadas` +
          (skipped ? ` (${skipped} já existiam — ignoradas)` : "") +
          ". Veja em Glicemia → Tendências."
      );
      setPreview(null);
      router.refresh();
    } catch {
      parar("Erro de rede.");
    } finally {
      setLoading(false);
      setProgress(null);
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
              {loading ? (progress ?? "Importando…") : "Importar para o GLYX"}
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
