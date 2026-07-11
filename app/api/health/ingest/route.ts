import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAppleHealthDaily } from "@/lib/health/apple-health";
import { normalizeGoogleFitDaily } from "@/lib/health/google-fit";
import { ingestHealthSnapshots } from "@/lib/health/ingest";
import { generateMockHealthSnapshots } from "@/lib/health/mock";
import type { UnifiedHealthSnapshot } from "@/lib/health/types";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("unified"),
    snapshots: z.array(
      z.object({
        snapshotDate: z.string(),
        source: z.enum(["apple_health", "google_fit", "manual", "mock"]),
        steps: z.number().nullable().optional(),
        sleepHours: z.number().nullable().optional(),
        restingHr: z.number().nullable().optional(),
        activeCalories: z.number().nullable().optional(),
        stressScore: z.number().nullable().optional(),
        metadata: z.record(z.any()).nullable().optional(),
      })
    ),
  }),
  z.object({
    mode: z.literal("google_fit"),
    days: z.array(z.any()),
  }),
  z.object({
    mode: z.literal("apple_health"),
    days: z.array(z.any()),
  }),
  z.object({
    mode: z.literal("mock"),
    daysCount: z.number().min(1).max(90).optional(),
  }),
]);

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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let snapshots: UnifiedHealthSnapshot[] = [];

  switch (parsed.data.mode) {
    case "unified":
      snapshots = parsed.data.snapshots.map((s) => ({
        snapshotDate: s.snapshotDate,
        source: s.source,
        steps: s.steps ?? null,
        sleepHours: s.sleepHours ?? null,
        restingHr: s.restingHr ?? null,
        activeCalories: s.activeCalories ?? null,
        stressScore: s.stressScore ?? null,
        metadata: s.metadata ?? null,
      }));
      break;
    case "google_fit":
      snapshots = normalizeGoogleFitDaily(parsed.data.days);
      break;
    case "apple_health":
      snapshots = normalizeAppleHealthDaily(parsed.data.days);
      break;
    case "mock":
      snapshots = generateMockHealthSnapshots(parsed.data.daysCount ?? 7);
      break;
    default:
      break;
  }

  const result = await ingestHealthSnapshots(supabase, user.id, snapshots);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted: result.upserted });
}
