import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  User,
  FileText,
  Plug,
  Radar,
  LineChart,
} from "lucide-react";

/** "registrar" = ação do dia a dia; "analises" = telas retrospectivas/IA; "conta" = configuração. */
export type NavGroup = "registrar" | "analises" | "conta";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Show in bottom tab bar (mobile) */
  mobile?: boolean;
  group: NavGroup;
};

/**
 * Ordem dentro de cada grupo NÃO é alfabética/arbitrária — segue uso real
 * medido no banco (contagem de registros por tabela) combinado com
 * importância clínica onde o uso puro erraria a mão (ex.: Alertas é pouco
 * "visitado" porque chega por push, mas é seguridade crítica; Exames tem
 * zero registros até agora mas seria péssimo escondê-lo de propósito).
 */
export const mainNav: NavItem[] = [
  { title: "Hoje", href: "/dashboard", icon: LayoutDashboard, mobile: true, group: "registrar" },
  { title: "Glicemia", href: "/glicemia", icon: Droplets, mobile: true, group: "registrar" }, // uso: leituras é o dado mais numeroso do app, de longe
  { title: "Alimentação", href: "/alimentacao", icon: UtensilsCrossed, mobile: true, group: "registrar" }, // uso: 2º mais registrado
  { title: "Medicação", href: "/medicacao", icon: Pill, mobile: true, group: "registrar" }, // uso: 3º + criticidade clínica (insulina)
  { title: "Exercícios", href: "/exercicios", icon: Dumbbell, mobile: true, group: "registrar" }, // uso: o menos registrado do grupo hoje
  // Análises consolidadas: Mapa de risco, Insights, Histórico e Alertas viraram
  // abas de uma tela só (/analise). A IA metabólica virou chat flutuante global
  // (ver MetabolicChatFab), então saiu do menu. Exames é gestão de documento —
  // foi para Conta.
  { title: "Análise", href: "/analise", icon: LineChart, mobile: false, group: "analises" }, // resumo de risco + correlações + linha do tempo + alertas
  { title: "Perfil", href: "/perfil", icon: User, mobile: false, group: "conta" }, // importância: metas, medicação de referência, dados corporais
  { title: "Exames", href: "/exames", icon: FileText, mobile: false, group: "conta" }, // gestão de documentos (lab / ECG / raio-X)
  { title: "Conexões", href: "/integracoes", icon: Plug, mobile: false, group: "conta" }, // CGM + Google Fit + sono, unificado
  { title: "Sistema", href: "/status", icon: Radar, mobile: false, group: "conta" },
];

export const mobileNav = mainNav.filter((i) => i.mobile);

/** Itens que no celular ficam fora da barra inferior (menu Mais). */
export const moreNav = mainNav.filter((i) => !i.mobile);

export const GROUP_LABEL: Record<NavGroup, string> = {
  registrar: "Registrar",
  analises: "Análises",
  conta: "Conta",
};

const GROUP_ORDER: NavGroup[] = ["registrar", "analises", "conta"];

/** Agrupa preservando a ordem registrar → análises → conta; grupos vazios somem. */
export function groupNavItems(items: NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter(
    (g) => g.items.length > 0
  );
}

export type SubNavItem = { title: string; href: string };

/** Secondary routes per module (desktop subnav + mobile chips) */
export const moduleSubNav: Record<string, SubNavItem[]> = {
  "/analise": [
    { title: "Resumo", href: "/analise" },
    { title: "Correlações", href: "/analise/correlacoes" },
    { title: "Linha do tempo", href: "/analise/linha-do-tempo" },
    { title: "Alertas", href: "/analise/alertas" },
  ],
  "/glicemia": [
    { title: "Visão geral", href: "/glicemia" },
    { title: "Histórico", href: "/glicemia/historico" },
    { title: "Pressão", href: "/glicemia/pressao" },
  ],
  "/alimentacao": [
    { title: "Refeições", href: "/alimentacao" },
    { title: "Por foto", href: "/alimentacao/foto" },
    { title: "Montar prato", href: "/alimentacao/montar-prato" },
  ],
  "/exercicios": [
    { title: "Visão geral", href: "/exercicios" },
    { title: "Plano", href: "/exercicios/plano" },
    { title: "Recuperação", href: "/exercicios/recuperacao" },
  ],
  "/medicacao": [
    { title: "Doses de hoje", href: "/medicacao" },
    { title: "Meus medicamentos", href: "/medicacao/medicamentos" },
    { title: "Calculadora", href: "/medicacao/calculadora" },
  ],
};

export function getModuleKeyFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const root = `/${segments[0]}`;
  return moduleSubNav[root] ? root : null;
}
