import { redirect } from "next/navigation";

// Plano alimentar era conteúdo demo estático (sem dado do usuário) — removido
// por ora. Metas de carboidrato passam a viver no Perfil quando forem reais.
export default function AlimentacaoPlanoRedirect() {
  redirect("/alimentacao");
}
