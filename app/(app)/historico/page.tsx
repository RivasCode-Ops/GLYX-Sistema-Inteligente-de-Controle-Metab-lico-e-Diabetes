import { redirect } from "next/navigation";

// Histórico global virou a aba "Linha do tempo" do módulo unificado /analise.
export default function HistoricoRedirect() {
  redirect("/analise/linha-do-tempo");
}
