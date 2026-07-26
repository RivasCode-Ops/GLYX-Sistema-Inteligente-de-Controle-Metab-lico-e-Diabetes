import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPushConfigured, sendPushToUser } from "@/lib/push/send";

/**
 * Dispara um alerta de teste para os próprios aparelhos do usuário.
 *
 * Existe porque a única pergunta que importa aqui — "o celular faz barulho com
 * a tela bloqueada?" — não pode ser respondida em código: o som da notificação
 * é decisão do Android/iOS. Sem um botão de teste, descobrir isso exigiria
 * esperar uma hipoglicemia de verdade, que é exatamente o pior momento
 * possível para descobrir que o alarme está mudo.
 *
 * Vai como `critical: true` de propósito: exercita o mesmo caminho de um alerta
 * de hipoglicemia (vibração longa, notificação que não some sozinha e alarme
 * sonoro no app aberto), em vez de testar um caminho mais fácil que o real.
 *
 * Só envia para as assinaturas do usuário da sessão — não há como usar isto
 * para notificar outra pessoa.
 */
export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push não configurado no servidor." }, { status: 503 });
  }

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (!count) {
    return NextResponse.json(
      { error: "Nenhum aparelho registrado. Ative os alarmes neste dispositivo primeiro." },
      { status: 400 }
    );
  }

  await sendPushToUser(supabase, user.id, {
    title: "🔔 Teste de alarme do GLYX",
    body: "Se você ouviu som ou sentiu vibração, o alarme crítico está funcionando neste aparelho.",
    url: "/medicacao/medicamentos",
    critical: true,
  });

  return NextResponse.json({ ok: true, devices: count });
}

export const runtime = "nodejs";
