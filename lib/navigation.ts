import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  Lightbulb,
  Sparkles,
  User,
  FileText,
  ScrollText,
  BellRing,
  Plug,
  Radar,
  Map,
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
  { title: "Mapa de risco", href: "/mapa-risco", icon: Map, mobile: false, group: "analises" }, // importância: score longitudinal + relatório pro médico
  { title: "Alertas", href: "/alertas", icon: BellRing, mobile: false, group: "analises" }, // importância: segurança (hipo/hiperglicemia), não só clique
  { title: "IA metabólica", href: "/ia-metabolica", icon: Sparkles, mobile: false, group: "analises" }, // uso: item mais acessado das análises
  { title: "Insights", href: "/insights", icon: Lightbulb, mobile: false, group: "analises" },
  { title: "Histórico", href: "/historico", icon: ScrollText, mobile: false, group: "analises" },
  { title: "Exames", href: "/exames", icon: FileText, mobile: false, group: "analises" }, // uso: zero registros até agora
  { title: "Perfil", href: "/perfil", icon: User, mobile: false, group: "conta" }, // importância: metas, medicação de referência, dados corporais
  { title: "Integrações", href: "/integracoes", icon: Plug, mobile: false, group: "conta" },
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
  "/glicemia": [
    { title: "Visão geral", href: "/glicemia" },
    { title: "Tendências", href: "/glicemia/tendencias" },
    { title: "Sensor", href: "/glicemia/sensor" },
    { title: "Histórico", href: "/glicemia/historico" },
  ],
  "/alimentacao": [
    { title: "Visão geral", href: "/alimentacao" },
    { title: "Refeições", href: "/alimentacao/refeicoes" },
    { title: "Plano", href: "/alimentacao/plano" },
    { title: "Por foto", href: "/alimentacao/foto" },
    { title: "Montar prato", href: "/alimentacao/montar-prato" },
  ],
  "/exercicios": [
    { title: "Visão geral", href: "/exercicios" },
    { title: "Plano", href: "/exercicios/plano" },
    { title: "Sessões", href: "/exercicios/sessoes" },
    { title: "Recuperação", href: "/exercicios/recuperacao" },
  ],
  "/medicacao": [
    { title: "Visão geral", href: "/medicacao" },
    { title: "Agenda", href: "/medicacao/agenda" },
  ],
};

export function getModuleKeyFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const root = `/${segments[0]}`;
  return moduleSubNav[root] ? root : null;
}
