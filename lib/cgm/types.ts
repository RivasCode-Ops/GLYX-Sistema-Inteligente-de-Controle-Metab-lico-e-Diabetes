/** Fabricantes suportados pela camada de normalização */
export type CgmVendorId = "dexcom" | "libre" | "mock" | "manual";

/** Modelo interno único — sempre mg/dL e UTC ISO */
export type UnifiedCgmReading = {
  valueMgDl: number;
  recordedAt: string;
  /** Igual a `glucose_readings.source` após ingestão */
  source: "dexcom" | "libre" | "mock" | "manual";
  /** Para dedup no ingest */
  externalId: string | null;
  trend: string | null;
  metadata: Record<string, unknown> | null;
};

/** Status exposto à UI / API */
export type CgmIntegrationStatus = {
  dexcom: { configured: boolean; hint: string };
  libre: { configured: boolean; hint: string };
  mock: { available: boolean };
};
