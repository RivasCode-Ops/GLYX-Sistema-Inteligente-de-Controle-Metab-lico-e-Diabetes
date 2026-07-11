import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Direito de portabilidade (LGPD): baixa todos os dados do usuário em JSON.
const TABLES = [
  "profiles",
  "glucose_readings",
  "meals",
  "medications",
  "medication_logs",
  "exercise_sessions",
  "metabolic_alerts",
  "exams",
  "health_snapshots",
  "insight_findings",
  "ai_threads",
  "ai_messages",
] as const;

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

  const payload: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
  };

  for (const table of TABLES) {
    // profiles usa "id"; as demais, "user_id" — RLS garante o isolamento de qualquer forma
    const column = table === "profiles" ? "id" : "user_id";
    const { data, error } = await supabase.from(table).select("*").eq(column, user.id);
    payload[table] = error ? { error: error.message } : (data ?? []);
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="glyx-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
