import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EXPORT_REDACT_COLUMNS, USER_DATA_EXPORT_TABLES } from "@/lib/privacy/user-data";

function redactRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const cols = EXPORT_REDACT_COLUMNS[table];
  if (!cols?.length) return row;
  const copy = { ...row };
  for (const col of cols) {
    if (col in copy) copy[col] = "[redacted]";
  }
  return copy;
}

// Direito de portabilidade (LGPD): baixa os dados do usuário em JSON.
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

  for (const table of USER_DATA_EXPORT_TABLES) {
    const column = table === "profiles" ? "id" : "user_id";
    const { data, error } = await supabase.from(table).select("*").eq(column, user.id);
    if (error) {
      payload[table] = { error: error.message };
      continue;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    payload[table] = rows.map((row) => redactRow(table, row));
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="glyx-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
