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
        ? "OAuth pronto — use Conectar Dexcom em Glicemia → Sensor."
        : "Defina DEXCOM_CLIENT_ID, DEXCOM_CLIENT_SECRET e DEXCOM_REDIRECT_URI (ou NEXT_PUBLIC_SITE_URL).",
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
