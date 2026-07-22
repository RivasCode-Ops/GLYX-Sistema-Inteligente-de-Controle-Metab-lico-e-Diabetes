import { redirect } from "next/navigation";

// Mapa de risco virou a aba "Resumo" do módulo unificado /analise.
// Mantido como redirect para não quebrar links, bookmarks e revalidatePath legados.
export default function MapaRiscoRedirect() {
  redirect("/analise");
}
