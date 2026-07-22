import { redirect } from "next/navigation";

// Tendências foi fundida na Visão geral de Glicemia (gráfico + tiles).
export default function GlicemiaTendenciasRedirect() {
  redirect("/glicemia");
}
