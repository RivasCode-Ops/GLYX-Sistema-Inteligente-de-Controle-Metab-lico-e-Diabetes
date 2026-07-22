import { redirect } from "next/navigation";

// Alertas virou a aba "Alertas" do módulo unificado /analise.
export default function AlertasRedirect() {
  redirect("/analise/alertas");
}
