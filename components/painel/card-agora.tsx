"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markHypoActed, recordHypoRecheck } from "@/app/actions/hypo-plan";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INTENTS_DE_DISPENSAR, type CardAgora, type CardLevel } from "@/lib/painel/card-agora";
import { localDateKey } from "@/lib/time/local-day";

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

/**
 * Ações que gravam (`/api/...`) viram server actions aqui (Etapa 2, B2). Antes
 * os botões apontavam para formulários que não existiam: "Fiz" e "Registrar
 * medição" não faziam nada, e o ciclo de hipoglicemia nunca fechava.
 */
function HypoForms({
  card,
  onDone,
  pendente,
  startTransition,
}: {
  card: CardAgora;
  onDone: (erro: string | null) => void;
  pendente: boolean;
  startTransition: (f: () => Promise<void>) => void;
}) {
  const router = useRouter();
  if (!card.hypo) return null;
  const h = card.hypo;

  const enviar = (acao: (fd: FormData) => Promise<{ ok?: true; error?: string }>) => (fd: FormData) =>
    startTransition(async () => {
      const r = await acao(fd);
      onDone(r.error ?? null);
      if (!r.error) router.refresh();
    });

  return (
    <>
      <form id="card-agora--api-hypo-acted" action={enviar(markHypoActed)} hidden aria-hidden>
        <input type="hidden" name="event_id" value={h.eventId ?? ""} />
        <input type="hidden" name="glucose_mg_dl" value={h.glucoseMgDl ?? ""} />
        <input type="hidden" name="detected_at" value={h.detectedAt ?? ""} />
      </form>
      {card.actions.some((a) => a.intent === "/api/hypo/recheck") ? (
        <form
          id="card-agora--api-hypo-recheck"
          action={enviar(recordHypoRecheck)}
          className="mt-3 flex items-center gap-2"
        >
          <input type="hidden" name="event_id" value={h.eventId ?? ""} />
          <label className="text-xs text-zinc-400" htmlFor="recheck-glicemia">
            Glicemia agora (mg/dL)
          </label>
          <input
            id="recheck-glicemia"
            name="glucose_mg_dl"
            type="number"
            inputMode="numeric"
            min={20}
            max={600}
            required
            disabled={pendente}
            className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm text-zinc-100"
          />
        </form>
      ) : null}
    </>
  );
}

export function CardAgoraView({
  card,
  hora,
}: {
  card: CardAgora;
  /** horário da leitura que disparou, quando houver */
  hora?: string | null;
}) {
  const [porQue, setPorQue] = useState(false);
  const [emergencia, setEmergencia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Pendência compartilhada com os botões: enquanto um envio corre, os botões
  // que gravam ficam desabilitados (toque duplo não grava duas vezes).
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  // "Até amanhã" no fuso do aparelho, que é onde a pessoa vê o card.
  const chaveDispensa = `glyx-card-dispensado:${card.id}:${localDateKey(
    new Date().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )}`;
  const [dispensado, setDispensado] = useState(false);
  useEffect(() => {
    try {
      setDispensado(window.localStorage.getItem(chaveDispensa) === "1");
    } catch {
      /* armazenamento indisponível: o card aparece */
    }
  }, [chaveDispensa]);

  const dispensar = () => {
    try {
      window.localStorage.setItem(chaveDispensa, "1");
    } catch {
      /* sem armazenamento, esconde só nesta visita */
    }
    setDispensado(true);
  };
  const mostrarDeNovo = () => {
    try {
      window.localStorage.removeItem(chaveDispensa);
    } catch {
      /* nada a desfazer */
    }
    setDispensado(false);
  };

  // "Registrei" e "Adiar 15 min" da medicação atrasada: as MESMAS rotas da
  // notificação, com o remédio e a dose do card.
  const medicacao = (intent: string) =>
    startTransition(async () => {
      if (!card.medicacao) return;
      const taken = intent === "/api/medications/taken";
      const res = await fetch(intent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          taken
            ? { medication_id: card.medicacao.medId, scheduled_for: card.medicacao.scheduledFor, pedido: crypto.randomUUID() }
            : { medication_id: card.medicacao.medId, minutes: 15 }
        ),
      }).catch(() => null);
      const corpo = res ? ((await res.json().catch(() => ({}))) as { error?: string; url?: string; conflito?: boolean }) : {};
      if (res?.ok) {
        setErro(null);
        router.refresh();
      } else if (res?.status === 409 && corpo.conflito && corpo.url) {
        router.push(corpo.url);
      } else {
        setErro(corpo.error ?? "Não consegui registrar agora. Tente pela tela de medicação.");
      }
    });

  if (dispensado) {
    return (
      <Card className="w-full">
        <div className="flex items-center justify-between gap-3 p-3 text-xs text-zinc-500">
          <span>Aviso dispensado até amanhã neste aparelho.</span>
          <Button type="button" variant="ghost" size="sm" onClick={mostrarDeNovo}>
            Mostrar
          </Button>
        </div>
      </Card>
    );
  }

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

        <HypoForms card={card} onDone={setErro} pendente={pendente} startTransition={startTransition} />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {card.actions.map((a) =>
            a.intent === "/api/hypo/emergency" ? (
              // Mostra o texto de emergência que a pessoa cadastrou, literal.
              <Button
                key={a.label}
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={emergencia}
                onClick={() => setEmergencia((v) => !v)}
              >
                {a.label}
              </Button>
            ) : (INTENTS_DE_DISPENSAR as readonly string[]).includes(a.intent) ? (
              <Button
                key={a.label}
                type="button"
                variant={a.kind === "primary" ? "default" : "outline"}
                size="sm"
                onClick={dispensar}
              >
                {a.label}
              </Button>
            ) : a.intent === "/api/medications/taken" || a.intent === "/api/medications/snooze" ? (
              <Button
                key={a.label}
                type="button"
                variant={a.kind === "primary" ? "default" : "outline"}
                size="sm"
                disabled={pendente || !card.medicacao}
                onClick={() => medicacao(a.intent)}
              >
                {a.label}
              </Button>
            ) : a.intent.startsWith("/api/") ? (
              <Button
                key={a.label}
                type="submit"
                form={`card-agora-${a.intent.replace(/\W+/g, "-")}`}
                variant={a.kind === "primary" ? "default" : "outline"}
                size="sm"
                disabled={pendente}
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

        {erro ? <p className="mt-3 text-xs text-amber-300">{erro}</p> : null}
        {emergencia && card.hypo?.emergencyText ? (
          <p className="mt-3 whitespace-pre-line border-t border-zinc-800/80 pt-3 text-sm text-amber-200">
            {card.hypo.emergencyText}
          </p>
        ) : null}

        {/* Expande no próprio card, sem navegar. Transição só de altura. */}
        {porQue ? (
          <p className="mt-3 border-t border-zinc-800/80 pt-3 text-xs text-zinc-400">{card.why}</p>
        ) : null}
      </div>
    </Card>
  );
}
