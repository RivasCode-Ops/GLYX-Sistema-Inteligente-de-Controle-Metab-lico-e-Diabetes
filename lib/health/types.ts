/** Fontes suportadas para agregados diários */
export type HealthSnapshotSource = "apple_health" | "google_fit" | "manual" | "mock";

/** Modelo interno — um registro por dia e por fonte */
export type UnifiedHealthSnapshot = {
  snapshotDate: string;
  /** YYYY-MM-DD */
  source: HealthSnapshotSource;
  steps: number | null;
  sleepHours: number | null;
  restingHr: number | null;
  activeCalories: number | null;
  stressScore: number | null;
  metadata: Record<string, unknown> | null;
};

export type HealthIntegrationStatus = {
  googleFit: {
    configured: boolean;
    hint: string;
  };
  appleHealth: {
    availableOnWeb: false;
    hint: string;
  };
  manual: { available: boolean };
  mock: { available: boolean };
};
