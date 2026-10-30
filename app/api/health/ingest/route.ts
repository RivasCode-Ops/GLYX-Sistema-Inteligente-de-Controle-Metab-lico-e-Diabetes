import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAppleHealthDaily } from "@/lib/health/apple-health";
import { normalizeGoogleFitDaily } from "@/lib/health/google-fit";
import { ingestHealthSnapshots } from "@/lib/health/ingest";
import {
  MAX_BODY_BYTES,
  MAX_DAYS_PER_REQUEST,
  checkHealthSnapshots,
} from "@/lib/health/snapshot-limits";
import type { UnifiedHealthSnapshot } from "@/lib/health/types";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("unified"),
    snapshots: z.array(
      z.object({
        snapshotDate: z.string(),
        // Sem "mock", pela mesma razão de `/api/cgm/ingest`: a rota grava na
        // série real, e dado de demonstração ali dentro é indistinguível de
        // medição para painel, resumo e IA (GLYX-21 / P19).
        source: z.enum(["apple_health", "google_fit", "manual"]),
        steps: z.number().nullable().optional(),
        sleepHours: z.number().nullable().optional(),
        restingHr: z.number().nullable().optional(),
        activeCalories: z.number().nullable().optional(),
        stressScore: z.number().nullable().optional(),
        metadata: z.record(z.any()).nullable().optional(),
      })
    ).max(MAX_DAYS_PER_REQUEST),
  }),
  z.object({
    mode: z.literal("google_fit"),
    days: z.array(z.any()).max(MAX_DAYS_PER_REQUEST),
  }),
  z.object({
    mode: z.literal("apple_health"),
    days: z.array(z.any()).max(MAX_DAYS_PER_REQUEST),
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

  // Tamanho antes de parsear: o JSON inteiro iria para a memória primeiro.
  // Lê como texto e mede, em vez de confiar no Content-Length que o cliente declara.
  const texto = await req.text();
  if (Buffer.byteLength(texto, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Envio grande demais (máx. ${Math.round(MAX_BODY_BYTES / 1000)} KB).` },
      { status: 413 }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(texto);
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
    default:
      break;
  }

  // Os normalizadores de Google Fit e Apple Health repassam o número que veio;
  // a checagem vale para os três modos, depois de normalizar.
  const check = checkHealthSnapshots(snapshots);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const result = await ingestHealthSnapshots(supabase, user.id, check.snapshots);

  if (result.error) {
    console.error("[health/ingest] gravação falhou", result.error);
    return NextResponse.json({ error: "Não foi possível gravar os dados agora." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    upserted: result.upserted,
    duplicadosIgnorados: check.duplicadosIgnorados,
  });
}
