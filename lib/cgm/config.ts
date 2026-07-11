import type { CgmIntegrationStatus } from "@/lib/cgm/types";

/**
 * Dexcom / Libre requerem fluxo OAuth ou parceria conforme região.
 * Variáveis são placeholders até ligar SDK/API reais.
 */
export function getCgmIntegrationStatus(): CgmIntegrationStatus {
  const dexcomConfigured = Boolean(
    process.env.DEXCOM_CLIENT_ID?.length && process.env.DEXCOM_CLIENT_SECRET?.length
  );
  const libreConfigured = Boolean(
    process.env.LIBRE_EMAIL?.length && process.env.LIBRE_PASSWORD?.length
  );

  return {
    dexcom: {
      configured: dexcomConfigured,
      hint: dexcomConfigured
        ? "Credenciais OAuth presentes — ligar cliente HTTP no próximo passo."
        : "Defina DEXCOM_CLIENT_ID e DEXCOM_CLIENT_SECRET (OAuth2 Dexcom).",
    },
    libre: {
      configured: libreConfigured,
      hint: libreConfigured
        ? "Credenciais Libre presentes — ligar cliente no próximo passo."
        : "Opcional: LIBRE_EMAIL / LIBRE_PASSWORD ou token conforme API regional.",
    },
    mock: { available: true },
  };
}
