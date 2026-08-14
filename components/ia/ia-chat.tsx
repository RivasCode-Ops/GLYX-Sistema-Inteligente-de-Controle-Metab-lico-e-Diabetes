"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Msg = { role: "user" | "assistant"; content: string };

/** Saudação de abertura. Não é conteúdo de conversa e por isso não é gravada —
 * histórico cheio de "olá" repetido a cada reabertura não é histórico. */
const SAUDACAO: Msg = {
  role: "assistant",
  content:
    "Olá. Sou o copiloto metabólico GLYX. Posso ajudar a interpretar padrões dos seus dados e sugerir perguntas para seu médico — não substituo a consulta. O que deseja revisar?",
};

export function IaChat() {
  const [messages, setMessages] = useState<Msg[]>([SAUDACAO]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(true);

  // Retoma a conversa mais recente ao abrir. Falha aqui é silenciosa de
  // propósito: começar do zero é um chat pior, não um chat quebrado.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/ai/chat/historico");
        if (!res.ok) return;
        const data = (await res.json()) as { threadId?: string; messages?: Msg[] };
        if (!ativo || !data.threadId || !data.messages?.length) return;
        setThreadId(data.threadId);
        setMessages([SAUDACAO, ...data.messages]);
      } catch {
        /* segue com conversa nova */
      } finally {
        if (ativo) setRestaurando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  function novaConversa() {
    setThreadId(null);
    setMessages([SAUDACAO]);
    setError(null);
  }

  const SUGGESTIONS = [
    {
      label: "🔎 Analisar meus picos",
      prompt:
        "Analise meus picos de glicemia recentes: quais refeições parecem ter causado, o que nelas provavelmente pesou (tipo e quantidade de carboidrato, horário, combinação) e o que eu posso ajustar na ALIMENTAÇÃO para reduzir os próximos picos? Sobre insulina, apenas resuma o que registrei e o que vale levar ao médico — sem sugerir dose.",
    },
    {
      label: "⏰ Meus horários de risco",
      prompt:
        "Com base no meu padrão de glicemia por hora do dia: em quais horários minha glicemia mais fica alta? Analise o quadro todo (refeições, insulina registrada, atividade), proponha estratégias práticas para conter os picos nessas janelas, e explique em linguagem simples os riscos de ficar acima da meta com frequência e também de cair demais (hipoglicemia). Sem sugerir dose de insulina — o que for de dose, me diga o que levar ao médico.",
    },
    {
      label: "🍽️ Revisar meu dia",
      prompt:
        "Revise meu dia até agora (glicemia, refeições, bebidas, insulina registrada e exercício) e me diga o que está indo bem e o que merece atenção no restante do dia.",
    },
    {
      label: "💬 O que perguntar ao médico?",
      prompt:
        "Com base nos meus dados recentes, monte uma lista curta de perguntas e pontos concretos para eu levar à próxima consulta médica.",
    },
  ];

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setError(null);
    setLoading(true);
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          ...(threadId ? { threadId } : {}),
        }),
      });

      const novaThread = res.headers.get("X-Thread-Id");
      if (novaThread) setThreadId(novaThread);

      const contentType = res.headers.get("content-type") ?? "";

      if (!res.ok || contentType.includes("application/json")) {
        const data = (await res.json()) as { reply?: string; error?: string; demo?: boolean };
        if (!res.ok) {
          setError(data.error ?? "Falha na requisição.");
          return;
        }
        setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "(sem resposta)" }]);
        return;
      }

      // Resposta em streaming: mostra o texto conforme chega
      const reader = res.body?.getReader();
      if (!reader) {
        setError("Falha ao ler a resposta.");
        return;
      }
      const decoder = new TextDecoder();
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const current = acc;
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: current }]);
      }
      if (!acc) {
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: "(sem resposta)" }]);
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Conversa</CardTitle>
            <CardDescription>
              {restaurando
                ? "Buscando a conversa anterior…"
                : threadId
                  ? "Retomando de onde você parou. O histórico fica na sua conta e entra no export e no apagamento da LGPD."
                  : "Requer sessão e, para respostas do modelo, KIMI_API_KEY."}
            </CardDescription>
          </div>
          {threadId ? (
            <button
              type="button"
              onClick={novaConversa}
              className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
            >
              Nova conversa
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-sky-950/60 p-3 text-zinc-100"
                  : "mr-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-zinc-300"
              }
            >
              {m.content}
            </div>
          ))}
          {loading ? <p className="text-xs text-zinc-500">Gerando…</p> : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={loading}
              onClick={() => void send(s.prompt)}
              className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-200 disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre padrões ou rotina…"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void send())}
          />
          <Button type="button" onClick={() => void send()} disabled={loading}>
            Enviar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
