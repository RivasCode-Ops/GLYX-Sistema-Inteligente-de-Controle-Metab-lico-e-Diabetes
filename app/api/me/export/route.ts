import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { montarExportacao } from "@/lib/privacy/export";

// Direito de portabilidade (LGPD): baixa os dados do usuário em JSON.
//
// Cada tabela é lida paginada (`lib/privacy/export.ts`). Até 14/10/2026 era um
// `select('*')` por tabela, e o PostgREST devolve no máximo 1000 linhas por
// requisição: as leituras de glicemia saíam cortadas, sem aviso.
export async function GET() {
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

  const payload = await montarExportacao(supabase, user.id, user.email ?? null);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="glyx-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
