"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Msg = { role: "user" | "assistant"; content: string };

export function IaChat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Olá. Sou o copiloto metabólico GLYX. Posso ajudar a interpretar padrões dos seus dados e sugerir perguntas para seu médico — não substituo a consulta. O que deseja revisar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
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
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; demo?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Falha na requisição.");
        return;
      }
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply ?? "(sem resposta)",
        },
      ]);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversa</CardTitle>
        <CardDescription>
          Requer sessão e, para respostas do modelo, <code className="font-mono text-xs">OPENAI_API_KEY</code>.
        </CardDescription>
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
