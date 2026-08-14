import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Persistência das conversas com o copiloto.
 *
 * `ai_threads` e `ai_messages` existiam desde a migration inicial, com RLS, nas
 * listas de export e apagamento da LGPD e nos testes de cobertura — e **nenhuma
 * linha de código escrevia nelas**. O chat rodava inteiro na memória do
 * navegador: 13 conversas aconteceram e todas sumiram ao fechar a janela,
 * enquanto o export da LGPD entregava uma tabela sempre vazia. Estrutura pronta
 * sem escritor é o mesmo defeito que deixou a foto de progresso um mês quebrada.
 */

/** Teto do que volta ao reabrir. O chat recusa conversa acima de 30 mensagens,
 * então restaurar tudo faria a primeira pergunta depois de reabrir já nascer
 * rejeitada — histórico que quebra o chat é pior que histórico nenhum. */
export const HISTORY_LIMIT = 20;

/** Título derivado da primeira pergunta: identificar a conversa na lista sem
 * pedir ao usuário que a nomeie. */
export function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}…`;
}

export type StoredMessage = { role: "user" | "assistant"; content: string };

/**
 * Põe em ordem de leitura o que veio do banco em ordem decrescente, descartando
 * papéis que não são de conversa.
 *
 * A busca é decrescente porque o limite tem que pegar o FIM da conversa: pedir
 * as primeiras 20 de um histórico longo devolveria o começo, que é justamente a
 * parte que o usuário não está retomando. Inverter aqui é o preço disso.
 */
export function toChronological(rows: { role: string; content: string }[]): StoredMessage[] {
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .reverse()
    .map((m) => ({ role: m.role as StoredMessage["role"], content: m.content }));
}

/**
 * Devolve a thread a usar, criando uma se `threadId` não vier ou não for do
 * usuário.
 *
 * A checagem de dono não é redundante com a RLS: sem ela, um id de outra pessoa
 * faria o insert falhar por política em vez de cair numa thread nova, e o
 * usuário perderia a mensagem por um erro que não é dele.
 */
export async function ensureThread(
  supabase: SupabaseClient,
  userId: string,
  threadId: string | null,
  firstMessage: string
): Promise<string | null> {
  if (threadId) {
    const { data } = await supabase
      .from("ai_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data.id as string;
  }

  const { data, error } = await supabase
    .from("ai_threads")
    .insert({ user_id: userId, title: titleFrom(firstMessage) })
    .select("id")
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

/** Grava mensagens na thread e marca a conversa como recente. */
export async function appendMessages(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  messages: StoredMessage[]
): Promise<void> {
  if (!messages.length) return;

  await supabase.from("ai_messages").insert(
    messages.map((m) => ({
      thread_id: threadId,
      user_id: userId,
      role: m.role,
      content: m.content,
    }))
  );

  // `updated_at` é o que ordena a lista de conversas; sem o toque explícito ele
  // ficaria na data de criação e a thread mais ativa pareceria a mais velha.
  await supabase
    .from("ai_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);
}

export type ThreadHistory = { threadId: string; messages: StoredMessage[] };

/**
 * Conversa mais recente do usuário, para o chat reabrir de onde parou.
 *
 * Devolve as últimas `HISTORY_LIMIT` mensagens em ordem cronológica. Busca em
 * ordem decrescente e inverte: pegar as primeiras 20 traria o começo de uma
 * conversa longa, que é justamente a parte que o usuário não está retomando.
 */
export async function getLatestThread(): Promise<ThreadHistory | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: thread } = await supabase
    .from("ai_threads")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!thread) return null;

  const { data: messages } = await supabase
    .from("ai_messages")
    .select("role, content, created_at")
    .eq("thread_id", thread.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  return {
    threadId: thread.id as string,
    messages: toChronological((messages ?? []) as { role: string; content: string }[]),
  };
}
