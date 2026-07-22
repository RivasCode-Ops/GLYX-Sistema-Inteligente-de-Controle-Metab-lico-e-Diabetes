import { redirect } from "next/navigation";

// Conexão de sensor (CGM) foi unificada em Conexões, junto do Google Fit —
// um só lugar para conectar fontes de dados.
export default function GlicemiaSensorRedirect() {
  redirect("/integracoes");
}
