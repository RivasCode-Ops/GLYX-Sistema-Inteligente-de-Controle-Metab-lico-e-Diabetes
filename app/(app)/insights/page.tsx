import { redirect } from "next/navigation";

// Insights virou a aba "Correlações" do módulo unificado /analise.
export default function InsightsRedirect() {
  redirect("/analise/correlacoes");
}
