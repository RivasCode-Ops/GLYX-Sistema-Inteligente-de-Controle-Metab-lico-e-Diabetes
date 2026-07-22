import { redirect } from "next/navigation";

// A agenda (histórico de doses) foi fundida em "Doses de hoje" (/medicacao).
export default function MedicacaoAgendaRedirect() {
  redirect("/medicacao");
}
