import { NextResponse } from "next/server";
import { persistMetabolicAudit, runMetabolicAudit } from "@/lib/audit/run";
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

  const report = await runMetabolicAudit(supabase, user.id, windowDays);
  const saved = await persistMetabolicAudit(supabase, user.id, report);
  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: saved.id, report });
}
