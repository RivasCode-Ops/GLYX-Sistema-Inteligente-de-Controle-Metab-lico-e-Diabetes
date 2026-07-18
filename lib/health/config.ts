import type { HealthIntegrationStatus } from "@/lib/health/types";

/**
 * Apple Health: sem acesso direto no browser — precisa app iOS ou exportação.
 * Google Fit tem OAuth real (ver components/integrations/google-fit-connect.tsx).
 */
export function getHealthIntegrationStatus(): HealthIntegrationStatus {
  return {
    appleHealth: {
      availableOnWeb: false,
      hint: "HealthKit não está disponível na web. Use app nativo, atalhos iOS ou importação manual.",
    },
  };
}
