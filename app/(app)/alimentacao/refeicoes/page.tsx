import { redirect } from "next/navigation";

// Refeições foi fundida na tela principal de Alimentação (resumo + registro + diário).
export default function AlimentacaoRefeicoesRedirect() {
  redirect("/alimentacao");
}
