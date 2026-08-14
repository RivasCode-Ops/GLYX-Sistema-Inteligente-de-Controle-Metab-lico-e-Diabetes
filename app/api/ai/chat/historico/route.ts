import { NextResponse } from "next/server";
import { getLatestThread } from "@/lib/queries/ai-threads";

/**
 * Última conversa do usuário, para o copiloto reabrir de onde parou.
 *
 * É rota e não Server Action porque o chat é componente cliente que já fala com
 * `/api/ai/chat` por fetch — uma segunda forma de chamar o servidor no mesmo
 * componente só somaria maneiras de errar.
 *
 * `getLatestThread` resolve a sessão por conta própria e a RLS filtra por dono,
 * então não há id de usuário vindo do cliente para conferir aqui.
 */
export async function GET() {
  const history = await getLatestThread();
  if (!history) return NextResponse.json({ messages: [] });

  return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
}
