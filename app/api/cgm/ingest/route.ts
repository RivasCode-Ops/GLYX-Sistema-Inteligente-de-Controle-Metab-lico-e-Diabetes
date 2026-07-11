import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestUnifiedReadings } from "@/lib/cgm/ingest";
import { generateMockCgmSeries } from "@/lib/cgm/mock";
import { normalizeDexcomEgvs } from "@/lib/cgm/normalize/dexcom";
import { normalizeLibreMeasurements } from "@/lib/cgm/normalize/libre";
import type { UnifiedCgmReading } from "@/lib/cgm/types";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("unified"),
    readings: z.array(
      z.object({
        valueMgDl: z.number(),
        recordedAt: z.string(),
        source: z.enum(["dexcom", "libre", "mock", "manual"]),
        externalId: z.string().nullable().optional(),
        trend: z.string().nullable().optional(),
        metadata: z.record(z.any()).nullable().optional(),
      })
    ),
  }),
  z.object({
    mode: z.literal("dexcom"),
    egvs: z.array(z.any()),
  }),
  z.object({
    mode: z.literal("libre"),
    measurements: z.array(z.any()),
  }),
  z.object({
    mode: z.literal("mock"),
    points: z.number().min(1).max(288).optional(),
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

  let readings: UnifiedCgmReading[] = [];

  switch (parsed.data.mode) {
    case "unified":
      readings = parsed.data.readings.map((r) => ({
        valueMgDl: r.valueMgDl,
        recordedAt: r.recordedAt,
        source: r.source,
        externalId: r.externalId ?? null,
        trend: r.trend ?? null,
        metadata: r.metadata ?? null,
      }));
      break;
    case "dexcom":
      readings = normalizeDexcomEgvs(parsed.data.egvs as Parameters<typeof normalizeDexcomEgvs>[0]);
      break;
    case "libre":
      readings = normalizeLibreMeasurements(
        parsed.data.measurements as Parameters<typeof normalizeLibreMeasurements>[0]
      );
      break;
    case "mock":
      readings = generateMockCgmSeries(parsed.data.points ?? 36, 5);
      break;
    default:
      break;
  }

  const result = await ingestUnifiedReadings(supabase, user.id, readings);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    skipped: result.skipped,
  });
}
