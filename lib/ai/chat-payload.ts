import { z } from "zod";

export const MAX_MESSAGES = 30;
export const MAX_MESSAGE_CHARS = 4000;

/**
 * Corpo do POST do chat, validado em tempo de execução.
 *
 * Até 14/10/2026 o papel da mensagem era só um cast de TypeScript
 * (`m.role as "user" | "assistant"`): o navegador podia mandar `role: "system"`
 * e acrescentar instruções de sistema próprias depois das do app — por
 * exemplo, revogar "nunca calcule dose". O alcance era a própria sessão, mas
 * num app de saúde é contornar a trava clínica. E JSON inválido virava 500.
 */
const mensagem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const corpo = z.object({
  messages: z.array(mensagem),
  threadId: z.string().uuid().nullish(),
});

export type ChatPayload = z.infer<typeof corpo>;

export type ResultadoPayload =
  | { ok: true; data: ChatPayload; ultimaPergunta: string }
  | { ok: false; erro: string };

export function validarPayloadDoChat(bruto: unknown): ResultadoPayload {
  const p = corpo.safeParse(bruto);
  if (!p.success) {
    const papelInvalido = p.error.issues.some((i) => i.path.includes("role"));
    return { ok: false, erro: papelInvalido ? "Papel de mensagem inválido." : "Payload inválido." };
  }
  const { messages } = p.data;
  if (!messages.length) return { ok: false, erro: "Mensagens vazias." };
  if (messages.length > MAX_MESSAGES) {
    return {
      ok: false,
      erro: `Conversa muito longa (máx. ${MAX_MESSAGES} mensagens). Inicie um novo chat.`,
    };
  }
  if (messages.some((m) => m.content.length > MAX_MESSAGE_CHARS)) {
    return { ok: false, erro: `Mensagem muito longa (máx. ${MAX_MESSAGE_CHARS} caracteres).` };
  }
  const ultimaPergunta = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!ultimaPergunta.trim()) return { ok: false, erro: "Mensagens vazias." };
  return { ok: true, data: p.data, ultimaPergunta };
}

/** Aviso anexado quando a conexão com o provedor cai no meio da resposta. */
export const AVISO_STREAM_INTERROMPIDO =
  "\n\n_(resposta interrompida: a conexão com o modelo caiu e o texto pode estar incompleto — peça para continuar)_";
