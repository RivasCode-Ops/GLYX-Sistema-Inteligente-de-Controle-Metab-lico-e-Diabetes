import { NextResponse } from "next/server";
import { persistFindings, runCorrelationEngine } from "@/lib/insights/v2/engine";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
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

  let windowDays = 14;
  try {
    const body = (await req.json()) as { windowDays?: number };
    if (typeof body.windowDays === "number" && body.windowDays >= 7 && body.windowDays <= 90) {
      windowDays = body.windowDays;
    }
  } catch {
    /* body opcional */
  }

  const findings = await runCorrelationEngine(supabase, user.id, windowDays);
  const saved = await persistFindings(supabase, user.id, findings);

  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    generated: findings.length,
    upserted: saved.upserted,
  });
}
