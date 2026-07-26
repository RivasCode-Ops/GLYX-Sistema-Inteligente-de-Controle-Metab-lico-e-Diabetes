"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type ComparablePhoto = {
  id: string;
  takenOn: string;
  pose: "frente" | "costas" | "perfil_esq" | "perfil_dir";
  url: string;
};

type Comparison = {
  summary: string;
  changes: string[];
  uncertain: string[];
  from: { takenOn: string };
  to: { takenOn: string };
};

const POSE_LABEL: Record<ComparablePhoto["pose"], string> = {
  frente: "Frente",
  costas: "Costas",
  perfil_esq: "Perfil esquerdo",
  perfil_dir: "Perfil direito",
};

function fmt(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR");
}

/**
 * Comparação lado a lado + leitura opcional da IA.
 *
 * O lado a lado é local e não sai do dispositivo do usuário além do próprio
 * Storage privado. A leitura da IA é um passo separado, com aviso explícito
 * antes: mandar foto de corpo para um provedor externo é decisão de quem está
 * na foto, não do app.
 */
export function PhotoCompare({ photos }: { photos: ComparablePhoto[] }) {
  const poses = useMemo(() => {
    const set = new Set(photos.map((p) => p.pose));
    return [...set];
  }, [photos]);

  const [pose, setPose] = useState<ComparablePhoto["pose"]>(poses[0] ?? "frente");
  const ofPose = useMemo(
    () => photos.filter((p) => p.pose === pose).sort((a, b) => a.takenOn.localeCompare(b.takenOn)),
    [photos, pose]
  );

  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");

  const from = ofPose.find((p) => p.id === (fromId || ofPose[0]?.id));
  const to = ofPose.find((p) => p.id === (toId || ofPose[ofPose.length - 1]?.id));

  const [result, setResult] = useState<Comparison | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function compare() {
    if (!from || !to || from.id === to.id) {
      setStatus("Escolha duas fotos diferentes da mesma pose.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/body-photo-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: from.id, toId: to.id }),
      });
      const data = (await res.json()) as Comparison & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na comparação.");
        setResult(null);
        return;
      }
      setResult(data);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  if (photos.length < 2) {
    return (
      <p className="text-sm text-zinc-400">
        Envie fotos em pelo menos duas datas diferentes para comparar a evolução.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="pose" className="text-xs">
            Pose
          </Label>
          <select
            id="pose"
            value={pose}
            onChange={(e) => {
              setPose(e.target.value as ComparablePhoto["pose"]);
              setFromId("");
              setToId("");
              setResult(null);
            }}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            {poses.map((p) => (
              <option key={p} value={p}>
                {POSE_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="from" className="text-xs">
            Antes
          </Label>
          <select
            id="from"
            value={from?.id ?? ""}
            onChange={(e) => setFromId(e.target.value)}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            {ofPose.map((p) => (
              <option key={p.id} value={p.id}>
                {fmt(p.takenOn)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="to" className="text-xs">
            Depois
          </Label>
          <select
            id="to"
            value={to?.id ?? ""}
            onChange={(e) => setToId(e.target.value)}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            {ofPose.map((p) => (
              <option key={p.id} value={p.id}>
                {fmt(p.takenOn)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[from, to].map((photo, i) => (
          <figure key={i} className="overflow-hidden rounded-xl border border-zinc-800">
            {photo ? (
              <>
                {/* URL assinada e temporária do Storage privado — mesmo padrão
                    das fotos de refeição; o otimizador do next/image não
                    aceita host dinâmico com assinatura. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Foto ${POSE_LABEL[photo.pose]} de ${fmt(photo.takenOn)}`}
                  className="h-auto w-full object-cover"
                />
                <figcaption className="px-2 py-1 text-center text-[11px] text-zinc-400">
                  {i === 0 ? "antes" : "depois"} · {fmt(photo.takenOn)}
                </figcaption>
              </>
            ) : null}
          </figure>
        ))}
      </div>

      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3">
        <p className="text-xs leading-snug text-amber-200">
          A leitura por IA envia <strong>estas duas fotos</strong> para o provedor de IA do app.
          Comparar lado a lado acima não envia nada. A IA descreve mudanças visíveis e não estima
          peso, medida ou percentual de gordura a partir de foto — isso não é possível com honestidade.
        </p>
        <div className="mt-2">
          <Button onClick={() => void compare()} disabled={loading} size="sm" variant="outline">
            {loading ? "Comparando…" : "Comparar com IA"}
          </Button>
        </div>
      </div>

      {status ? <p className="text-xs text-amber-300">{status}</p> : null}

      {result ? (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-sm leading-relaxed text-zinc-200">{result.summary}</p>
          {result.changes.length ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Mudanças observáveis
              </h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
                {result.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.uncertain.length ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Pode ser efeito da foto
              </h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-500">
                {result.uncertain.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
