import type { HealthIntegrationStatus } from "@/lib/health/types";

/**
 * Google Fit / Health Connect: integração real exige projeto Google Cloud + OAuth.
 * Apple Health: sem acesso direto no browser — precisa app iOS ou exportação.
 */
export function getHealthIntegrationStatus(): HealthIntegrationStatus {
  const googleConfigured = Boolean(
    process.env.GOOGLE_FIT_CLIENT_ID?.length && process.env.GOOGLE_FIT_CLIENT_SECRET?.length
  );

  return {
    googleFit: {
      configured: googleConfigured,
      hint: googleConfigured
        ? "OAuth Google configurado — ligar cliente Fit API no próximo passo."
        : "Defina GOOGLE_FIT_CLIENT_ID e GOOGLE_FIT_CLIENT_SECRET para OAuth2.",
    },
    appleHealth: {
      availableOnWeb: false,
      hint: "HealthKit não está disponível na web. Use app nativo, atalhos iOS ou importação manual.",
    },
    manual: { available: true },
    mock: { available: true },
  };
}
